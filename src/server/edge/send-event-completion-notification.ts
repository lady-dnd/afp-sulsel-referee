import { Deno, createClient } from "@/server/edge-runtime";
import { hasAnyRole, resolveCaller } from "./_shared/authorization";
import { normalizeWhatsAppNumber } from "@/lib/notificationOrchestrator";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const META_COMPLETION_TEMPLATE_NAME = "afp_sulsel_event_selesai_honor";
const META_COMPLETION_TEMPLATE_LANGUAGE = "id";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function formatRoleLabel(role: string | null | undefined): string {
  if (role === "UTAMA") return "Wasit Utama";
  if (role === "CADANGAN") return "Wasit Cadangan";
  return role || "Wasit";
}

async function sendMetaCompletionTemplate(
  to: string,
  refereeName: string,
  eventName: string,
  roleLabel: string,
): Promise<{ ok: true; messageId: string } | { ok: false; errorCode: string }> {
  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN")?.trim();
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")?.trim();
  const rawVersion = Deno.env.get("WHATSAPP_API_VERSION")?.trim() || "v23.0";

  if (!accessToken || !phoneNumberId || !/^v[0-9]+\.[0-9]+$/.test(rawVersion)) {
    return { ok: false, errorCode: "WHATSAPP_NOT_CONFIGURED" };
  }

  const graphUrl = `https://graph.facebook.com/${encodeURIComponent(rawVersion)}/${encodeURIComponent(phoneNumberId)}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: META_COMPLETION_TEMPLATE_NAME,
      language: { code: META_COMPLETION_TEMPLATE_LANGUAGE },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: refereeName },
            { type: "text", text: eventName },
            { type: "text", text: roleLabel },
          ],
        },
      ],
    },
  };

  try {
    const res = await fetch(graphUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const body = (await res.json().catch(() => null)) as { messages?: Array<{ id?: string }> } | null;
    const messageId = body?.messages?.[0]?.id?.trim();
    if (!res.ok || !messageId) {
      return { ok: false, errorCode: "WHATSAPP_DELIVERY_FAILED" };
    }
    return { ok: true, messageId };
  } catch {
    return { ok: false, errorCode: "WHATSAPP_NETWORK_ERROR" };
  }
}

export async function dispatchEventCompletionNotifications(
  supabase: ReturnType<typeof createClient>,
  eventId: string,
) {
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, name, status, kabupaten_kota_id")
    .eq("id", eventId)
    .is("deleted_at", null)
    .maybeSingle();

  if (eventError || !event) {
    return { notFound: true as const };
  }

  if (event.status !== "SELESAI") {
    return { notCompleted: true as const };
  }

  const { data: assignments, error: assignError } = await supabase
    .from("event_assignments")
    .select("id, referee_id, role, referee:profiles!referee_id(id, full_name)")
    .eq("event_id", eventId)
    .eq("status", "confirmed")
    .is("deleted_at", null);

  if (assignError) {
    throw new Error("Failed to load event assignments");
  }

  const rows = assignments ?? [];
  let honorDraftsCreated = 0;
  let inAppSent = 0;
  let whatsappSent = 0;
  let whatsappSkipped = 0;
  let whatsappFailed = 0;

  if (rows.length === 0) {
    return {
      notFound: false as const,
      notCompleted: false as const,
      eventId,
      processed: 0,
      honorDraftsCreated,
      inAppSent,
      whatsappSent,
      whatsappSkipped,
      whatsappFailed,
    };
  }

  const refereeIds = rows.map((r) => r.referee_id);

  const [{ data: existingHonors }, { data: existingNotifs }, { data: contacts }] = await Promise.all([
    supabase
      .from("honors")
      .select("referee_id")
      .eq("event_id", eventId)
      .in("referee_id", refereeIds)
      .is("deleted_at", null),
    supabase
      .from("notifications")
      .select("user_id")
      .eq("entity_id", eventId)
      .eq("action", "event_completed")
      .in("user_id", refereeIds),
    supabase
      .from("referee_contacts")
      .select("referee_id, whatsapp_number")
      .in("referee_id", refereeIds),
  ]);

  const honoredSet = new Set((existingHonors ?? []).map((h) => h.referee_id));
  const notifiedSet = new Set((existingNotifs ?? []).map((n) => n.user_id));
  const contactMap = new Map((contacts ?? []).map((c) => [c.referee_id, c.whatsapp_number]));

  const honorDraftsToInsert = rows
    .filter((r) => !honoredSet.has(r.referee_id))
    .map((r) => ({
      referee_id: r.referee_id,
      event_id: eventId,
      amount: 0,
      status: "draft",
      notes: "Draft otomatis setelah event selesai",
    }));

  if (honorDraftsToInsert.length > 0) {
    const { error: honorInsertErr } = await supabase.from("honors").insert(honorDraftsToInsert);
    if (!honorInsertErr) {
      honorDraftsCreated = honorDraftsToInsert.length;
    }
  }

  const inAppToInsert = rows
    .filter((r) => !notifiedSet.has(r.referee_id))
    .map((r) => ({
      user_id: r.referee_id,
      title: "Event Selesai - Input Honor",
      message: `Event "${event.name}" telah selesai. Silakan buka menu Honor untuk mengisi dan mengajukan honorarium Anda.`,
      type: "event",
      action: "event_completed",
      entity_type: "event",
      entity_id: eventId,
    }));

  if (inAppToInsert.length > 0) {
    const { error: notifInsertErr } = await supabase.from("notifications").insert(inAppToInsert);
    if (!notifInsertErr) {
      inAppSent = inAppToInsert.length;
    }
  }

  for (const row of rows) {
    const refereeProfile = row.referee as { full_name?: string } | null;
    const refereeName = refereeProfile?.full_name || "Wasit";
    const roleLabel = formatRoleLabel(row.role);

    const { data: claimedRows, error: claimErr } = await supabase.rpc("claim_event_completion_notification", {
      p_event_id: eventId,
      p_referee_id: row.referee_id,
      p_channel: "whatsapp",
    });

    const claimed = Array.isArray(claimedRows) ? claimedRows[0] : null;
    if (claimErr || !claimed?.claim_id) {
      continue;
    }

    const normalizedPhone = normalizeWhatsAppNumber(contactMap.get(row.referee_id) ?? null);
    if (!normalizedPhone) {
      await supabase.rpc("finalize_event_completion_notification", {
        p_event_id: eventId,
        p_referee_id: row.referee_id,
        p_channel: "whatsapp",
        p_claim_id: claimed.claim_id,
        p_status: "skipped",
        p_provider: "meta",
        p_error_code: "WHATSAPP_CONTACT_MISSING",
      });
      whatsappSkipped += 1;
      continue;
    }

    const sendResult = await sendMetaCompletionTemplate(normalizedPhone, refereeName, event.name, roleLabel);
    if (sendResult.ok) {
      await supabase.rpc("finalize_event_completion_notification", {
        p_event_id: eventId,
        p_referee_id: row.referee_id,
        p_channel: "whatsapp",
        p_claim_id: claimed.claim_id,
        p_status: "sent",
        p_provider: "meta",
        p_provider_message_id: sendResult.messageId,
      });
      whatsappSent += 1;
    } else {
      await supabase.rpc("finalize_event_completion_notification", {
        p_event_id: eventId,
        p_referee_id: row.referee_id,
        p_channel: "whatsapp",
        p_claim_id: claimed.claim_id,
        p_status: sendResult.errorCode === "WHATSAPP_NOT_CONFIGURED" ? "skipped" : "failed",
        p_provider: "meta",
        p_error_code: sendResult.errorCode,
      });
      if (sendResult.errorCode === "WHATSAPP_NOT_CONFIGURED") {
        whatsappSkipped += 1;
      } else {
        whatsappFailed += 1;
      }
    }
  }

  return {
    notFound: false as const,
    notCompleted: false as const,
    eventId,
    processed: rows.length,
    honorDraftsCreated,
    inAppSent,
    whatsappSent,
    whatsappSkipped,
    whatsappFailed,
  };
}

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ success: false, error: "Server configuration missing" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const caller = await resolveCaller(req, supabase);
  if (!caller) return jsonResponse({ success: false, error: "Unauthorized" }, 401);
  if (!hasAnyRole(caller, ["admin_provinsi", "admin_kab_kota"])) {
    return jsonResponse({ success: false, error: "Forbidden" }, 403);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ success: false, error: "Invalid request body" }, 400);
  }

  const eventId =
    body && typeof body === "object" && "eventId" in body && typeof body.eventId === "string"
      ? body.eventId.trim()
      : "";

  if (!UUID_REGEX.test(eventId)) {
    return jsonResponse({ success: false, error: "Invalid eventId" }, 400);
  }

  if (!caller.roles.includes("admin_provinsi")) {
    const { data: ev } = await supabase
      .from("events")
      .select("kabupaten_kota_id")
      .eq("id", eventId)
      .maybeSingle();

    if (!ev || !caller.kabupatenKotaId || ev.kabupaten_kota_id !== caller.kabupatenKotaId) {
      return jsonResponse({ success: false, error: "Forbidden" }, 403);
    }
  }

  try {
    const result = await dispatchEventCompletionNotifications(supabase, eventId);
    if (result.notFound) return jsonResponse({ success: false, error: "Event tidak ditemukan" }, 404);
    if (result.notCompleted) return jsonResponse({ success: false, error: "Event belum berstatus SELESAI" }, 409);
    return jsonResponse({ success: true, ...result }, 200);
  } catch {
    return jsonResponse({ success: false, error: "Gagal memproses notifikasi penyelesaian event" }, 500);
  }
};