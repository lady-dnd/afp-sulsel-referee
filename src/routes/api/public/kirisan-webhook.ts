import { createFileRoute } from "@tanstack/react-router";

// External provider callback. The handler verifies the provider's signature/secret itself.
async function handle(request: Request) {
  const { webhookTasks } = await import("@/server/edge/registry");
  const mod = await webhookTasks["kirisan-webhook"]!();
  return mod.handler(request);
}

export const Route = createFileRoute("/api/public/kirisan-webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});
