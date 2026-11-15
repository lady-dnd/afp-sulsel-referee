/**
 * Calls one of the app's server tasks (the original project's backend functions) with the
 * signed-in user's session. Returns the same { data, error } shape the old SDK call returned.
 */
import { supabase } from "@/integrations/supabase/client";

export interface ServerTaskOptions {
  body?: unknown;
  headers?: Record<string, string>;
  method?: string;
}

export class ServerTaskError extends Error {
  context: Response;
  status: number;
  constructor(message: string, status: number, context: Response) {
    super(message);
    this.name = "ServerTaskError";
    this.status = status;
    this.context = context;
  }
}

function encodeBody(body: unknown, headers: Headers): BodyInit | undefined {
  if (body === undefined || body === null) return undefined;
  if (typeof body === "string" || body instanceof FormData || body instanceof Blob || body instanceof ArrayBuffer) {
    return body as BodyInit;
  }
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return JSON.stringify(body);
}

async function readPayload(res: Response): Promise<unknown> {
  const type = res.headers.get("content-type") ?? "";
  if (type.includes("application/json")) return res.json();
  if (type.startsWith("text/")) return res.text();
  if (res.status === 204) return null;
  return res.blob();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function invokeServerTask<T = any>(
  name: string,
  options: ServerTaskOptions = {},
): Promise<{ data: T | null; error: ServerTaskError | null }> {
  const headers = new Headers(options.headers);
  if (!headers.has("Authorization")) {
    const { data } = await supabase.auth.getSession();
    if (data.session) headers.set("Authorization", `Bearer ${data.session.access_token}`);
  }
  const res = await fetch(`/api/functions/${name}`, {
    method: options.method ?? "POST",
    headers,
    body: encodeBody(options.body, headers),
  });
  const copy = res.clone();
  const payload = await readPayload(res).catch(() => null);
  if (!res.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : `Server task returned status ${res.status}`;
    return { data: null, error: new ServerTaskError(message, res.status, copy) };
  }
  return { data: payload as T, error: null };
}
