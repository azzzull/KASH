/// <reference path="../types.d.ts" />

// ============================================================
// Supabase Edge Function: send-push
//
// INTERNAL-ONLY Web Push sender & dispatcher.
//
// Business RPC / Backend event / process-reminders
//      ↓
// notifications row created / webhook
//      ↓
// send-push (Canonical route resolution + deduplication)
//      ↓
// Web Push service (Apple / Google / Mozilla)
//      ↓
// KASH PWA Service Worker
//
// SECURITY:
// - NOT callable directly from frontend.
// - Requires KASH_PUSH_INTERNAL_SECRET.
// - SUPABASE_SERVICE_ROLE_KEY remains server-side only.
// - VAPID private key remains server-side only.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-kash-push-secret",
};

interface PushRequestPayload {
  user_id?: string;
  notification_id?: string;
  title?: string;
  message?: string;
  entity_type?: string;
  entity_id?: string;
  metadata?: Record<string, unknown>;
  target_path?: string;
}

interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
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

function resolveCanonicalTargetPath(
  entityType?: string | null,
  entityId?: string | null,
  metadata?: Record<string, unknown> | null,
  explicitPath?: string | null,
): string {
  if (explicitPath && explicitPath.startsWith("/") && explicitPath !== "/dashboard") {
    return explicitPath;
  }

  if (typeof metadata?.target_path === "string" && metadata.target_path.startsWith("/")) {
    return metadata.target_path;
  }

  switch (entityType) {
    case "recurring_obligation":
      return entityId ? `/subscriptions/${entityId}` : "/subscriptions";
    case "counterparty":
    case "debt":
    case "receivable":
      return entityId ? `/debts/${entityId}` : "/debts";
    case "goal":
      return entityId ? `/goals/${entityId}` : "/goals";
    case "budget":
      return entityId ? `/budgets/${entityId}` : "/budgets";
    case "wallet":
      return entityId ? `/wallets/${entityId}` : "/wallets";
    case "shared_savings":
    case "shared_saving":
      return entityId ? `/shared-savings/${entityId}` : "/shared-savings";
    case "shared_savings_invite":
    case "shared_contribution":
      return "/shared-savings";
    case "transaction":
      return "/transactions";
    default:
      return "/dashboard";
  }
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
    // 1. SERVER ENVIRONMENT
    // ============================================================

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY",
    );

    const internalPushSecret = Deno.env.get(
      "KASH_PUSH_INTERNAL_SECRET",
    );

    const vapidPublicKey = Deno.env.get(
      "VAPID_PUBLIC_KEY",
    );

    const vapidPrivateKey = Deno.env.get(
      "VAPID_PRIVATE_KEY",
    );

    const vapidSubject =
      Deno.env.get("VAPID_SUBJECT") ||
      "mailto:admin@kash.app";

    if (!supabaseUrl) {
      throw new Error("Missing SUPABASE_URL.");
    }

    if (!supabaseServiceKey) {
      throw new Error(
        "Missing SUPABASE_SERVICE_ROLE_KEY.",
      );
    }

    if (!internalPushSecret) {
      throw new Error(
        "Missing KASH_PUSH_INTERNAL_SECRET.",
      );
    }

    if (!vapidPublicKey || !vapidPrivateKey) {
      throw new Error(
        "Missing VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY.",
      );
    }

    // ============================================================
    // 2. INTERNAL AUTH
    // ============================================================

    const requestSecret =
      req.headers.get("x-kash-push-secret") ??
      req.headers.get("apikey");

    if (
      !requestSecret ||
      !safeEqual(
        requestSecret,
        internalPushSecret,
      )
    ) {
      return jsonResponse(
        {
          success: false,
          error: "Unauthorized internal push request.",
        },
        401,
      );
    }

    // ============================================================
    // 3. PARSE PAYLOAD
    // ============================================================

    let body: PushRequestPayload = {};

    try {
      body = await req.json();
    } catch {
      return jsonResponse(
        {
          success: false,
          error: "Invalid JSON request body.",
        },
        400,
      );
    }

    // ============================================================
    // 4. PRIVILEGED SUPABASE CLIENT
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
    // 5. RESOLVE NOTIFICATION DETAILS & DEDUPLICATION
    // ============================================================

    let targetUserId = body.user_id;
    let pushTitle = body.title;
    let pushMessage = body.message;
    let entityType = body.entity_type;
    let entityId = body.entity_id;
    let metadata = body.metadata;

    if (body.notification_id) {
      const { data: notifRow, error: notifErr } = await supabase
        .from("notifications")
        .select("id, user_id, title, message, entity_type, entity_id, metadata")
        .eq("id", body.notification_id)
        .single();

      if (notifErr || !notifRow) {
        return jsonResponse({
          success: false,
          error: `Notification ${body.notification_id} not found.`,
        }, 404);
      }

      targetUserId = notifRow.user_id;
      pushTitle = notifRow.title;
      pushMessage = notifRow.message;
      entityType = notifRow.entity_type;
      entityId = notifRow.entity_id;
      metadata = notifRow.metadata as Record<string, unknown>;

      const { error: claimError } = await supabase
        .from("notification_push_deliveries")
        .insert({
          notification_id: body.notification_id,
          user_id: targetUserId,
          status: "pending",
          attempted_at: new Date().toISOString(),
          devices_targeted: 0,
          devices_delivered: 0,
        });

      if (claimError) {
        const typedClaimError = claimError as { code?: string; message?: string };

        if (typedClaimError.code === "23505") {
          const { data: existingDelivery } = await supabase
            .from("notification_push_deliveries")
            .select("id, status")
            .eq("notification_id", body.notification_id)
            .maybeSingle();

          return jsonResponse({
            success: true,
            delivered: 0,
            status: existingDelivery?.status ?? "already_claimed",
            message: "Notification push delivery was already claimed.",
          });
        }

        throw new Error(
          `Failed to claim notification push delivery: ${typedClaimError.message ?? "Unknown claim error"}`,
        );
      }
    }

    if (!targetUserId || !pushTitle || !pushMessage) {
      return jsonResponse(
        {
          success: false,
          error: "Missing required fields: user_id, title, message.",
        },
        400,
      );
    }

    const resolvedTargetPath = resolveCanonicalTargetPath(
      entityType,
      entityId,
      metadata,
      body.target_path,
    );

    // ============================================================
    // 6. FETCH ACTIVE DEVICE SUBSCRIPTIONS
    // ============================================================

    const {
      data: subscriptions,
      error: subError,
    } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", targetUserId)
      .eq("is_active", true);

    if (subError) {
      throw new Error(
        `Failed to load push subscriptions: ${subError.message}`,
      );
    }

    const activeSubscriptions =
      (subscriptions ??
        []) as PushSubscriptionRow[];

    if (activeSubscriptions.length === 0) {
      // Record delivery attempt as no_devices
      if (body.notification_id) {
        await supabase
          .from("notification_push_deliveries")
          .upsert({
            notification_id: body.notification_id,
            user_id: targetUserId,
            status: "no_devices",
            attempted_at: new Date().toISOString(),
            devices_targeted: 0,
            devices_delivered: 0,
          }, { onConflict: "notification_id" });
      }

      return jsonResponse({
        success: true,
        delivered: 0,
        total_devices: 0,
        expired_deactivated: 0,
        status: "no_devices",
      });
    }

    // ============================================================
    // 7. VAPID CONFIG & PUSH PAYLOAD
    // ============================================================

    webpush.setVapidDetails(
      vapidSubject,
      vapidPublicKey,
      vapidPrivateKey,
    );

    // Pure actual title and body — NO "From KASH" injected
    const payload = JSON.stringify({
      title: pushTitle,
      body: pushMessage,
      notification_id: body.notification_id ?? null,
      target_path: resolvedTargetPath,
    });

    let delivered = 0;
    const expiredIds: string[] = [];

    const failures: Array<{
      subscription_id: string;
      status?: number;
      error: string;
    }> = [];

    // ============================================================
    // 8. SEND TO EACH DEVICE
    // ============================================================

    for (const subscription of activeSubscriptions) {
      const pushSubscription = {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      };

      try {
        await webpush.sendNotification(
          pushSubscription,
          payload,
          {
            TTL: 86400,
            urgency: "normal",
            vapidDetails: {
              subject: vapidSubject,
              publicKey: vapidPublicKey,
              privateKey: vapidPrivateKey,
            },
          },
        );

        delivered += 1;
      } catch (error) {
        const candidate =
          error as {
            statusCode?: number;
            body?: string;
            message?: string;
          };

        const status =
          candidate.statusCode;

        if (
          status === 404 ||
          status === 410
        ) {
          expiredIds.push(
            subscription.id,
          );
        } else {
          failures.push({
            subscription_id:
              subscription.id,
            status,
            error:
              candidate.message ??
              candidate.body ??
              "Unknown Web Push error",
          });

          console.error(
            `Web Push failed for subscription ${subscription.id}:`,
            error,
          );
        }
      }
    }

    // ============================================================
    // 9. DEACTIVATE EXPIRED SUBSCRIPTIONS
    // ============================================================

    if (expiredIds.length > 0) {
      await supabase
        .from("push_subscriptions")
        .update({
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .in("id", expiredIds);
    }

    // ============================================================
    // 10. RECORD DELIVERY STATE
    // ============================================================

    if (body.notification_id) {
      const deliveryStatus = delivered > 0 ? "delivered" : failures.length > 0 ? "failed" : "no_devices";
      await supabase
        .from("notification_push_deliveries")
        .upsert({
          notification_id: body.notification_id,
          user_id: targetUserId,
          status: deliveryStatus,
          attempted_at: new Date().toISOString(),
          delivered_at: delivered > 0 ? new Date().toISOString() : null,
          devices_targeted: activeSubscriptions.length,
          devices_delivered: delivered,
          error_message: failures.length > 0 ? failures.map((f) => f.error).join("; ") : null,
        }, { onConflict: "notification_id" });
    }

    // ============================================================
    // 11. SUCCESS RESPONSE
    // ============================================================

    return jsonResponse({
      success: true,
      delivered,
      total_devices: activeSubscriptions.length,
      expired_deactivated: expiredIds.length,
      target_path: resolvedTargetPath,
      failures,
    });
  } catch (error) {
    console.error(
      "send-push error:",
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
