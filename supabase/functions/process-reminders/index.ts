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
// notifications trigger -> send-push
//   ↓
// Web Push devices
//
// SECURITY:
// - Not callable from frontend.
// - Requires KASH_REMINDER_CRON_SECRET.
// - Provisions Vault secrets used by the notification push trigger.
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
    // 4. VAULT SECRETS PROVISIONING (FOR DAILY PG_CRON + PUSH DISPATCH)
    // ============================================================
    try {
      await supabase.rpc("setup_kash_vault_secrets", {
        p_project_url: supabaseUrl,
        p_cron_secret: cronSecret,
      });
      await supabase.rpc("setup_kash_push_vault_secret", {
        p_push_secret: pushInternalSecret,
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

      // Fetch cron execution history
      const { data: cronHistory } = await supabase.rpc("get_cron_run_history");

      return jsonResponse({
        success: true,
        cron_inspection: {
          cron_job: cronJobData ?? [],
          cron_run_history: cronHistory ?? [],
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
    // 7. SUCCESS
    // ============================================================

    return jsonResponse({
      success: true,
      reminders_processed:
        reminders.length,
      pushes_delivered: 0,
      devices_targeted: 0,
      expired_subscriptions_deactivated: 0,
      push_dispatch:
        "handled_by_notifications_trigger",
      details: reminders.map((reminder) => ({
        notification_id:
          reminder.notification_id,
        user_id:
          reminder.user_id,
        title:
          reminder.title,
        target_path:
          reminder.target_path,
        push_dispatch:
          "handled_by_notifications_trigger",
      })),
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
