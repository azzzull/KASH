/// <reference path="../types.d.ts" />

// ============================================================
// Supabase Edge Function: send-push
//
// INTERNAL-ONLY Web Push sender.
//
// process-reminders
//      ↓
// send-push
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
  user_id: string;
  notification_id?: string;
  title: string;
  message: string;
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
          error: "Unauthorized.",
        },
        401,
      );
    }

    // ============================================================
    // 3. PARSE REQUEST
    // ============================================================

    let body: PushRequestPayload;

    try {
      body = await req.json();
    } catch {
      return jsonResponse(
        {
          success: false,
          error: "Invalid JSON body.",
        },
        400,
      );
    }

    if (
      !body.user_id ||
      !body.title ||
      !body.message
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "Missing required fields: user_id, title, message.",
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
    // 5. FETCH ACTIVE DEVICE SUBSCRIPTIONS
    // ============================================================

    const {
      data: subscriptions,
      error: subError,
    } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", body.user_id)
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
      return jsonResponse({
        success: true,
        delivered: 0,
        total_devices: 0,
        expired_deactivated: 0,
      });
    }

    // ============================================================
    // 6. VAPID CONFIG
    // ============================================================

    webpush.setVapidDetails(
      vapidSubject,
      vapidPublicKey,
      vapidPrivateKey,
    );

    // ============================================================
    // 7. PUSH PAYLOAD
    // ============================================================

    const payload = JSON.stringify({
      title: body.title,
      body: body.message,
      notification_id:
        body.notification_id ?? null,
      target_path:
        body.target_path ?? "/dashboard",
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
      const { error: deactivateError } =
        await supabase
          .from("push_subscriptions")
          .update({
            is_active: false,
            updated_at:
              new Date().toISOString(),
          })
          .in("id", expiredIds);

      if (deactivateError) {
        console.error(
          "Failed to deactivate expired subscriptions:",
          deactivateError,
        );
      }
    }

    // ============================================================
    // 10. SUCCESS
    // ============================================================

    return jsonResponse({
      success: true,
      delivered,
      total_devices:
        activeSubscriptions.length,
      expired_deactivated:
        expiredIds.length,
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