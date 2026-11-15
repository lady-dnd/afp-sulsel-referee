import { createFileRoute } from "@tanstack/react-router";

// Profile photos were public in the original app. The avatars bucket stays private, and this
// route serves only image files inside a user's folder so photos keep working on public pages.
const SAFE_PATH = /^[0-9a-f-]{36}\/[A-Za-z0-9._-]+\.(png|jpe?g|webp|gif)$/i;

export const Route = createFileRoute("/api/public/avatars/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const path = params._splat ?? "";
        if (!SAFE_PATH.test(path)) return new Response("Not found", { status: 404 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.storage.from("avatars").download(path);
        if (error || !data) return new Response("Not found", { status: 404 });
        return new Response(data, {
          headers: {
            "Content-Type": data.type || "image/jpeg",
            "Cache-Control": "public, max-age=3600",
            "X-Content-Type-Options": "nosniff",
          },
        });
      },
    },
  },
});
