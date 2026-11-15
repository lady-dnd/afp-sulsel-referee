/**
 * Runtime adapter for the server tasks ported from the original project's Deno functions.
 * Lets that code keep its Deno-style calls (Deno.env.get, createClient(url, key)) while
 * running inside the app's own server routes.
 */
import { createClient as createSupabaseClient, type SupabaseClientOptions } from "@supabase/supabase-js";

export type { SupabaseClient, User } from "@supabase/supabase-js";

const ENV_ALIASES: Record<string, string[]> = {
  SUPABASE_ANON_KEY: ["SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY"],
};

export const Deno = {
  env: {
    get(name: string): string | undefined {
      for (const key of ENV_ALIASES[name] ?? [name]) {
        const value = process.env[key];
        if (value) return value;
      }
      return undefined;
    },
  },
};

function isOpaqueKey(value: string) {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function keyAwareFetch(key: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined);
    if (init?.headers) new Headers(init.headers).forEach((value, name) => headers.set(name, value));
    // Opaque API keys are not JWTs: never send them as a bearer token.
    if (isOpaqueKey(key) && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createClient(url: string, key: string, options: SupabaseClientOptions<any> = {}) {
  return createSupabaseClient(url, key, {
    ...options,
    auth: { persistSession: false, autoRefreshToken: false, ...(options.auth ?? {}) },
    global: { ...(options.global ?? {}), fetch: keyAwareFetch(key) },
  });
}

/** SMTP needs raw TCP sockets, which this hosting runtime does not provide. */
export class SMTPClient {
  constructor(_config: unknown) {}
  async send(_message: unknown): Promise<never> {
    throw new Error("Pengiriman email via SMTP tidak tersedia. Gunakan provider Resend di Pengaturan.");
  }
  async close(): Promise<void> {}
}
