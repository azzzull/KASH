/// <reference path="../types.d.ts" />

// ============================================================
// Supabase Edge Function: process-reminders
//
// Trusted scheduled reminder orchestrator.
//
// Cron
//   ↓
// process-reminders
//   ↓
// PostgreSQL process_recurring_reminders()
//   ↓
// in-app notifications
//   ↓
// send-push
//   ↓
// Web Push devices
//
// SECURITY:
// - Not callable from frontend.
// - Requires KASH_REMINDER_CRON_SECRET.
// - Calls send-push using KASH_PUSH_INTERNAL_SECRET.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-kash-cron-secret",
};

interface ReminderNotificationRow {
  notification_id: string;
  user_id: string;
  title: string;
  message: string;
  target_path: string;
}

interface SendPushResponse {
  success?: boolean;
  delivered?: number;
  total_devices?: number;
  expired_deactivated?: number;
  error?: string;
}

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;

  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      {
        success: false,
        error: "Method not allowed.",
      },
      405,
    );
  }

  try {
    // ============================================================
    // 1. SERVER ENV
    // ============================================================

    const supabaseUrl =
      Deno.env.get("SUPABASE_URL");

    const supabaseServiceKey =
      Deno.env.get(
        "SUPABASE_SERVICE_ROLE_KEY",
      );

    const cronSecret =
      Deno.env.get(
        "KASH_REMINDER_CRON_SECRET",
      );

    const pushInternalSecret =
      Deno.env.get(
        "KASH_PUSH_INTERNAL_SECRET",
      );

    if (!supabaseUrl) {
      throw new Error(
        "Missing SUPABASE_URL.",
      );
    }

    if (!supabaseServiceKey) {
      throw new Error(
        "Missing SUPABASE_SERVICE_ROLE_KEY.",
      );
    }

    if (!cronSecret) {
      throw new Error(
        "Missing KASH_REMINDER_CRON_SECRET.",
      );
    }

    if (!pushInternalSecret) {
      throw new Error(
        "Missing KASH_PUSH_INTERNAL_SECRET.",
      );
    }

    // ============================================================
    // 2. CRON AUTH
    // ============================================================

    const requestSecret =
      req.headers.get(
        "x-kash-cron-secret",
      ) ??
      req.headers.get("apikey");

    if (
      !requestSecret ||
      !safeEqual(
        requestSecret,
        cronSecret,
      )
    ) {
      return jsonResponse(
        {
          success: false,
          error: "Unauthorized.",
        },
        401,
      );
    }

    // ============================================================
    // 3. PRIVILEGED DB CLIENT
    // ============================================================

    const supabase = createClient(
      supabaseUrl,
      supabaseServiceKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    // ============================================================
    // 4. VAULT SECRETS PROVISIONING (FOR DAILY PG_CRON)
    // ============================================================
    try {
      await supabase.rpc("setup_kash_vault_secrets", {
        p_project_url: supabaseUrl,
        p_cron_secret: cronSecret,
      });
    } catch (vaultErr) {
      console.warn("Failed ensuring Vault secrets:", vaultErr);
    }

    // ============================================================
    // 5. OPTIONAL SIMULATED DATE
    // ============================================================

    let simulatedDate: string | undefined;
    let inspectCron = false;

    try {
      const body = await req.json();

      if (
        typeof body?.current_date ===
        "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(
          body.current_date,
        )
      ) {
        simulatedDate =
          body.current_date;
      }

      if (body?.inspect_cron === true) {
        inspectCron = true;
      }
    } catch {
      // Optional body.
    }

    // ============================================================
    // 6. PROCESS REMINDERS IN DATABASE
    // ============================================================

    const {
      data: reminderRows,
      error: rpcError,
    } = await supabase.rpc(
      "process_recurring_reminders",
      simulatedDate
        ? {
          p_current_date:
            simulatedDate,
        }
        : {},
    );

    if (rpcError) {
      throw new Error(
        `process_recurring_reminders failed: ${rpcError.message}`,
      );
    }

    const reminders =
      (Array.isArray(reminderRows)
        ? reminderRows
        : []) as ReminderNotificationRow[];

    if (inspectCron) {
      // Safely test the Vault invoker function
      let vaultInvokerResult: unknown = null;
      try {
        const { data: invRes, error: invErr } = await supabase.rpc("invoke_process_reminders_cron");
        vaultInvokerResult = invErr ? { error: invErr.message } : { request_id: invRes };
      } catch (e: any) {
        vaultInvokerResult = { error: e.message };
      }

      // Fetch cron job registration details
      const { data: cronJobData } = await supabase.rpc("get_cron_job_info");

      return jsonResponse({
        success: true,
        cron_inspection: {
          cron_job: cronJobData ?? [],
          vault_invoker_test: vaultInvokerResult,
        },
        reminders_processed: reminders.length,
        pushes_delivered: 0,
        devices_targeted: 0,
        expired_subscriptions_deactivated: 0,
        details: [],
      });
    }

    if (reminders.length === 0) {
      return jsonResponse({
        success: true,
        reminders_processed: 0,
        pushes_delivered: 0,
        devices_targeted: 0,
        expired_subscriptions_deactivated: 0,
        details: [],
      });
    }

    // ============================================================
    // 6. SEND PUSH FOR EACH LOGICAL NOTIFICATION
    // ============================================================

    let totalPushesDelivered = 0;
    let totalDevicesTargeted = 0;
    let totalExpiredDeactivated = 0;

    const details: Array<{
      notification_id: string;
      user_id: string;
      title: string;
      target_path: string;
      push_success: boolean;
      delivered: number;
      devices_targeted: number;
      expired_deactivated: number;
      error?: string;
    }> = [];

    for (const reminder of reminders) {
      try {
        // Canonical Route Resolution:
        // 1. If reminder has specific target_path, use it.
        // 2. Otherwise, look up the created notification to resolve /subscriptions/<id>
        let targetPath = reminder.target_path;

        if (!targetPath || targetPath === "/subscriptions" || targetPath === "/dashboard") {
          const { data: notif } = await supabase
            .from("notifications")
            .select("entity_type, entity_id, metadata")
            .eq("id", reminder.notification_id)
            .maybeSingle();

          if (notif) {
            if (notif.entity_type === "recurring_obligation" && notif.entity_id) {
              targetPath = `/subscriptions/${notif.entity_id}`;
            } else if (notif.entity_type === "counterparty" && notif.entity_id) {
              targetPath = `/debts/${notif.entity_id}`;
            } else if (notif.entity_type === "goal" && notif.entity_id) {
              targetPath = `/goals/${notif.entity_id}`;
            } else if (notif.entity_type === "wallet" && notif.entity_id) {
              targetPath = `/wallets/${notif.entity_id}`;
            } else if (typeof notif.metadata?.target_path === "string" && notif.metadata.target_path) {
              targetPath = notif.metadata.target_path;
            }
          }
        }

        // Fallback to /subscriptions if still unresolved for recurring reminders
        if (!targetPath || !targetPath.startsWith("/")) {
          targetPath = "/subscriptions";
        }

        const response = await fetch(
          `${supabaseUrl}/functions/v1/send-push`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
              "x-kash-push-secret":
                pushInternalSecret,
            },
            body: JSON.stringify({
              user_id:
                reminder.user_id,
              notification_id:
                reminder.notification_id,
              title:
                reminder.title,
              message:
                reminder.message,
              target_path: targetPath,
            }),
          },
        );

        let pushResult:
          | SendPushResponse
          | null = null;

        try {
          pushResult =
            await response.json();
        } catch {
          pushResult = null;
        }

        const delivered =
          pushResult?.delivered ?? 0;

        const devices =
          pushResult?.total_devices ?? 0;

        const expired =
          pushResult?.expired_deactivated ??
          0;

        totalPushesDelivered += delivered;
        totalDevicesTargeted += devices;
        totalExpiredDeactivated += expired;

        if (!response.ok) {
          const message =
            pushResult?.error ??
            `send-push returned HTTP ${response.status}`;

          console.error(
            `send-push failed for notification ${reminder.notification_id}: ${message}`,
          );

          /*
           * IMPORTANT:
           *
           * Do not fail the reminder itself.
           * In-app notification has already been persisted.
           */
          details.push({
            notification_id:
              reminder.notification_id,
            user_id:
              reminder.user_id,
            title:
              reminder.title,
            target_path: targetPath,
            push_success: false,
            delivered,
            devices_targeted: devices,
            expired_deactivated:
              expired,
            error: message,
          });

          continue;
        }

        details.push({
          notification_id:
            reminder.notification_id,
          user_id:
            reminder.user_id,
          title:
            reminder.title,
          target_path: targetPath,
          push_success: true,
          delivered,
          devices_targeted: devices,
          expired_deactivated:
            expired,
        });
      } catch (error) {
        console.error(
          `Failed to invoke send-push for notification ${reminder.notification_id}:`,
          error,
        );

        details.push({
          notification_id:
            reminder.notification_id,
          user_id:
            reminder.user_id,
          title:
            reminder.title,
          target_path: reminder.target_path || "/subscriptions",
          push_success: false,
          delivered: 0,
          devices_targeted: 0,
          expired_deactivated: 0,
          error:
            error instanceof Error
              ? error.message
              : "Unknown push error",
        });
      }
    }

    // ============================================================
    // 7. SUCCESS
    // ============================================================

    return jsonResponse({
      success: true,
      reminders_processed:
        reminders.length,
      pushes_delivered:
        totalPushesDelivered,
      devices_targeted:
        totalDevicesTargeted,
      expired_subscriptions_deactivated:
        totalExpiredDeactivated,
      details,
    });
  } catch (error) {
    console.error(
      "process-reminders error:",
      error,
    );

    return jsonResponse(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Internal Server Error",
      },
      500,
    );
  }
});