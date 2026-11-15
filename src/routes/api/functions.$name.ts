import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

async function handle(request: Request, name: string) {
  // Every task requires a signed-in user, like the original functions' JWT check.
  const auth = request.headers.get("Authorization") ?? "";
  const token = auth.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
  }
  const { runServerTask } = await import("@/server/edge/registry");
  return runServerTask(name, request);
}

export const Route = createFileRoute("/api/functions/$name")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request, params }) => handle(request, params.name),
      POST: async ({ request, params }) => handle(request, params.name),
    },
  },
});
