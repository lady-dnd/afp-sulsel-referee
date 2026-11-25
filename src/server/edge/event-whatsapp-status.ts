import { Deno, createClient } from "@/server/edge-runtime";
import { hasAnyRole, resolveCaller } from "./_shared/authorization";
import { dispatchEventCompletionNotifications } from "./send-event-completion-notification";
import {
  normalizeDeliveryStatus,
  summarizeWhatsAppStatuses,
  type EventWhatsAppStatusItem,
} from "@/lib/whatsappStatus";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function loadEventWhatsAppItems(
  supabase: ReturnType<typeof createClient>,
  eventId: string,
): Promise<EventWhatsAppStatusItem[]> {
  const [{ data: assignments, error: assignErr }, { data: completionRows, error: compErr }] = await Promise.all([
    supabase
      .from("event_assignments")
      .select("id, referee_id, role, status, referee:profiles!referee_id(id, full_name)")
      .eq("event_id", eventId)
      .is("deleted_at", null)
      .not("status", "in", "(cancelled,declined)"),
    supabase
      .from("event_completion_notifications")
      .select("id, referee_id, status, provider, provider_message_id, error_code, sent_at, updated_at, referee:profiles!referee_id(id, full_name)")
      .eq("event_id", eventId)
      .eq("channel", "whatsapp"),
  ]);

  if (assignErr) throw assignErr;
  if (compErr) throw compErr;

  const assignmentList = assignments ?? [];
  const completionList = completionRows ?? [];

  const assignmentIds = assignmentList.map((a) => a.id);
  const refereeIds = Array.from(
    new Set([
      ...assignmentList.map((a) => a.referee_id),
      ...completionList.map((c) => c.referee_id),
    ]),
  );

  const [{ data: assignNotifs }, { data: contacts }] = await Promise.all([
    assignmentIds.length > 0
      ? supabase
          .from("assignment_notifications")
          .select("id, assignment_id, whatsapp_status, whatsapp_provider, whatsapp_message_id, whatsapp_error_code, whatsapp_sent_at, updated_at")
          .in("assignment_id", assignmentIds)
      : Promise.resolve({ data: [] as any[] }),
    refereeIds.length > 0
      ? supabase
          .from("referee_contacts")
          .select("referee_id, whatsapp_number")
          .in("referee_id", refereeIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const assignNotifMap = new Map((assignNotifs ?? []).map((n) => [n.assignment_id, n]));
  const contactMap = new Map((contacts ?? []).map((c) => [c.referee_id, c.whatsapp_number as string]));
  const roleMap = new Map(assignmentList.map((a) => [a.referee_id, a.role as string | null]));

  const items: EventWhatsAppStatusItem[] = [];

  for (const assignment of assignmentList) {
    const notif = assignNotifMap.get(assignment.id);
    const referee = assignment.referee as { full_name?: string } | null;
    items.push({
      id: `assignment:${assignment.id}`,
      notificationType: "assignment",
      assignmentId: assignment.id,
      refereeId: assignment.referee_id,
      refereeName: referee?.full_name || "Wasit",
      role: assignment.role ?? null,
      whatsappNumber: contactMap.get(assignment.referee_id) ?? null,
      status: notif ? normalizeDeliveryStatus(notif.whatsapp_status) : "not_sent",
      provider: notif?.whatsapp_provider ?? null,
      messageId: notif?.whatsapp_message_id ?? null,
      errorCode: notif?.whatsapp_error_code ?? null,
      sentAt: notif?.whatsapp_sent_at ?? null,
      updatedAt: notif?.updated_at ?? null,
    });
  }

  for (const row of completionList) {
    const referee = row.referee as { full_name?: string } | null;
    items.push({
      id: `completion:${row.id}`,
      notificationType: "completion",
      assignmentId: null,
      refereeId: row.referee_id,
      refereeName: referee?.full_name || "Wasit",
      role: roleMap.get(row.referee_id) ?? null,
      whatsappNumber: contactMap.get(row.referee_id) ?? null,
      status: normalizeDeliveryStatus(row.status),
      provider: row.provider ?? null,
      messageId: row.provider_message_id ?? null,
      errorCode: row.error_code ?? null,
      sentAt: row.sent_at ?? null,
      updatedAt: row.updated_at ?? null,
    });
  }

  // Sort failed & skipped first so admins see problems immediately
  const priority: Record<string, number> = { failed: 0, skipped: 1, not_sent: 2, pending: 3, sent: 4 };
  items.sort((a, b) => (priority[a.status] ?? 9) - (priority[b.status] ?? 9));
  return items;
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

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ success: false, error: "Invalid request body" }, 400);
  }

  const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";
  const action = typeof body.action === "string" ? body.action.trim() : "list";
  if (!UUID_REGEX.test(eventId)) {
    return jsonResponse({ success: false, error: "Invalid eventId" }, 400);
  }

  const { data: event } = await supabase
    .from("events")
    .select("id, kabupaten_kota_id")
    .eq("id", eventId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!event) {
    return jsonResponse({ success: false, error: "Event tidak ditemukan" }, 404);
  }

  if (!caller.roles.includes("admin_provinsi")) {
    if (!caller.kabupatenKotaId || event.kabupaten_kota_id !== caller.kabupatenKotaId) {
      return jsonResponse({ success: false, error: "Forbidden" }, 403);
    }
  }

  try {
    if (action === "retry") {
      const notificationType = body.notificationType;
      if (notificationType === "assignment") {
        const assignmentId = typeof body.assignmentId === "string" ? body.assignmentId.trim() : "";
        if (!UUID_REGEX.test(assignmentId)) {
          return jsonResponse({ success: false, error: "Invalid assignmentId" }, 400);
        }

        const { data: ownedAssignment } = await supabase
          .from("event_assignments")
          .select("id")
          .eq("id", assignmentId)
          .eq("event_id", eventId)
          .maybeSingle();

        if (!ownedAssignment) {
          return jsonResponse({ success: false, error: "Penugasan tidak ditemukan pada event ini" }, 404);
        }

        await supabase
          .from("notification_channel_claims")
          .delete()
          .eq("assignment_id", assignmentId)
          .eq("channel", "whatsapp");

        await supabase
          .from("assignment_notifications")
          .upsert(
            {
              assignment_id: assignmentId,
              whatsapp_status: "pending",
              whatsapp_error_code: null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "assignment_id" },
          );

        const authHeader = req.headers.get("Authorization") ?? "";
        await supabase.functions.invoke("notification-orchestrator", {
          body: { assignmentId },
          headers: authHeader ? { Authorization: authHeader } : {},
        });
      } else if (notificationType === "completion") {
        const refereeId = typeof body.refereeId === "string" ? body.refereeId.trim() : "";
        if (!UUID_REGEX.test(refereeId)) {
          return jsonResponse({ success: false, error: "Invalid refereeId" }, 400);
        }

        await supabase
          .from("event_completion_notifications")
          .update({
            status: "pending",
            claim_id: null,
            claimed_at: null,
            expires_at: null,
            error_code: null,
            updated_at: new Date().toISOString(),
          })
          .eq("event_id", eventId)
          .eq("referee_id", refereeId)
          .eq("channel", "whatsapp");

        await dispatchEventCompletionNotifications(supabase, eventId);
      } else {
        return jsonResponse({ success: false, error: "Invalid notificationType" }, 400);
      }
    }

    const items = await loadEventWhatsAppItems(supabase, eventId);
    const summary = summarizeWhatsAppStatuses(items);
    return jsonResponse({ success: true, eventId, summary, items }, 200);
  } catch {
    return jsonResponse({ success: false, error: "Gagal memuat status notifikasi WhatsApp" }, 500);
  }
};