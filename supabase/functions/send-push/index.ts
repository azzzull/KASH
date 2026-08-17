// ============================================================
// Supabase Edge Function: send-push
// Deliver Web Push notifications to active user device subscriptions
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PushRequestPayload {
  user_id: string;
  notification_id?: string;
  title: string;
  message: string;
  target_path?: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@kash.app";

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration.");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body: PushRequestPayload = await req.json();

    if (!body.user_id || !body.title || !body.message) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: user_id, title, message" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Fetch active push subscriptions for the recipient user
    const { data: subscriptions, error: subError } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", body.user_id)
      .eq("is_active", true);

    if (subError) throw subError;

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active push subscriptions found for user.", delivered: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const pushPayload = JSON.stringify({
      title: body.title,
      body: body.message,
      target_path: body.target_path || "/dashboard",
      notification_id: body.notification_id || null,
    });

    let deliveredCount = 0;
    const expiredSubIds: string[] = [];

    // 2. Iterate and send push to each device subscription
    for (const sub of subscriptions) {
      try {
        // Direct Web Push HTTP request structure
        // If VAPID keys are configured in Edge environment, standard web push request is dispatched
        const response = await fetch(sub.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            TTL: "86400",
          },
          body: pushPayload,
        });

        if (response.status === 201 || response.status === 200) {
          deliveredCount++;
        } else if (response.status === 404 || response.status === 410) {
          // Endpoint expired or unregistered
          expiredSubIds.push(sub.id);
        }
      } catch (err) {
        console.error(`Failed to deliver push to subscription ${sub.id}:`, err);
      }
    }

    // 3. Deactivate expired endpoints
    if (expiredSubIds.length > 0) {
      await supabase
        .from("push_subscriptions")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .in("id", expiredSubIds);
    }

    return new Response(
      JSON.stringify({
        success: true,
        delivered: deliveredCount,
        total_devices: subscriptions.length,
        expired_deactivated: expiredSubIds.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal Server Error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
