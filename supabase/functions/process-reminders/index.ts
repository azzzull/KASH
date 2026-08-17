// ============================================================
// Supabase Edge Function: process-reminders
// Trusted Scheduled Bridge:
// Cron -> process_recurring_reminders() (Atomically creates & deduplicates in-app notifications)
//      -> Sends Web Push to all active device subscriptions
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ReminderNotificationRow {
  notification_id: string;
  user_id: string;
  title: string;
  message: string;
  target_path: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    }

    // 1. Authorize: Only service_role or valid Bearer token can invoke scheduled batch processor
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Missing Authorization header." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Optional override date for manual simulation / testing
    let simulatedDate: string | undefined = undefined;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body?.current_date) {
          simulatedDate = body.current_date;
        }
      } catch {
        // Body is optional (e.g. GET from simple cron)
      }
    }

    // 2. Authoritative Database Processor: Claims reminders and creates in-app notifications
    const { data: reminderRows, error: rpcError } = await supabase.rpc(
      "process_recurring_reminders",
      simulatedDate ? { p_current_date: simulatedDate } : {}
    );

    if (rpcError) {
      throw rpcError;
    }

    const reminders: ReminderNotificationRow[] = reminderRows || [];

    if (reminders.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No new reminders due for processing at this time.",
          reminders_processed: 0,
          pushes_delivered: 0,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. For each newly created notification, deliver Web Push to user's active device subscriptions
    let totalPushesDelivered = 0;
    const expiredSubIds: string[] = [];
    const processedSummary: Array<{
      notification_id: string;
      user_id: string;
      title: string;
      devices_targeted: number;
    }> = [];

    for (const reminder of reminders) {
      // Query active push subscriptions for this user
      const { data: subscriptions, error: subError } = await supabase
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth")
        .eq("user_id", reminder.user_id)
        .eq("is_active", true);

      if (subError) {
        console.error(`Error querying push subscriptions for user ${reminder.user_id}:`, subError);
        continue;
      }

      const activeSubs = subscriptions || [];
      const pushPayload = JSON.stringify({
        title: reminder.title,
        body: reminder.message,
        target_path: reminder.target_path || "/subscriptions",
        notification_id: reminder.notification_id,
      });

      let deliveredForReminder = 0;

      for (const sub of activeSubs) {
        try {
          const response = await fetch(sub.endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              TTL: "86400",
            },
            body: pushPayload,
          });

          if (response.status === 201 || response.status === 200) {
            deliveredForReminder++;
            totalPushesDelivered++;
          } else if (response.status === 404 || response.status === 410) {
            // Subscription expired or unregistered by browser
            expiredSubIds.push(sub.id);
          }
        } catch (err) {
          console.error(`Failed to dispatch push to endpoint for subscription ${sub.id}:`, err);
        }
      }

      processedSummary.push({
        notification_id: reminder.notification_id,
        user_id: reminder.user_id,
        title: reminder.title,
        devices_targeted: activeSubs.length,
      });
    }

    // 4. Deactivate expired subscriptions if any
    if (expiredSubIds.length > 0) {
      await supabase
        .from("push_subscriptions")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .in("id", expiredSubIds);
    }

    return new Response(
      JSON.stringify({
        success: true,
        reminders_processed: reminders.length,
        pushes_delivered: totalPushesDelivered,
        expired_subscriptions_deactivated: expiredSubIds.length,
        details: processedSummary,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("process-reminders error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Internal Server Error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
