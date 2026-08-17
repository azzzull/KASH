// Ambient TypeScript definitions for Supabase Edge Functions environment
// Resolves Deno globals and URL/npm module specifiers for the IDE language server

declare namespace Deno {
  export interface Env {
    get(key: string): string | undefined;
    set(key: string, value: string): void;
    delete(key: string): void;
    toObject(): Record<string, string>;
  }
  export const env: Env;
  export function serve(
    handler: (req: Request) => Promise<Response> | Response,
  ): void;
}

declare module "https://deno.land/std@0.168.0/http/server.ts" {
  export function serve(
    handler: (req: Request) => Promise<Response> | Response,
  ): void;
}

declare module "https://esm.sh/@supabase/supabase-js@2.39.0" {
  export * from "@supabase/supabase-js";
}

declare module "npm:@supabase/supabase-js@2.39.0" {
  export * from "@supabase/supabase-js";
}

declare module "npm:web-push@3.6.7" {
  interface WebPushDetails {
    subject: string;
    publicKey: string;
    privateKey: string;
  }

  interface SendNotificationOptions {
    TTL?: number;
    urgency?: "very-low" | "low" | "normal" | "high";
    topic?: string;
    vapidDetails?: WebPushDetails;
  }

  interface PushSubscription {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  }

  export function setVapidDetails(
    subject: string,
    publicKey: string,
    privateKey: string,
  ): void;

  export function sendNotification(
    subscription: PushSubscription,
    payload?: string | Buffer | null,
    options?: SendNotificationOptions,
  ): Promise<{
    statusCode: number;
    body: string;
    headers: Record<string, string>;
  }>;

  const webpush: {
    setVapidDetails: typeof setVapidDetails;
    sendNotification: typeof sendNotification;
  };

  export default webpush;
}

declare module "https://esm.sh/web-push@3.6.7" {
  export * from "npm:web-push@3.6.7";
  import webpush from "npm:web-push@3.6.7";
  export default webpush;
}
