/** Name -> lazy loader for every ported server task. Names match the original function names. */
type Handler = (req: Request) => Promise<Response> | Response;
type Loader = () => Promise<{ handler: Handler }>;

export const serverTasks: Record<string, Loader> = {
  "admin-reports": () => import("./admin-reports"),
  "auto-complete-events": () => import("./auto-complete-events"),
  "create-user": () => import("./create-user"),
  "create-users-bulk": () => import("./create-users-bulk"),
  "delete-user": () => import("./delete-user"),
  "export-database": () => import("./export-database"),
  "generate-report-pdf": () => import("./generate-report-pdf"),
  "import-database": () => import("./import-database"),
  "notification-orchestrator": () => import("./notification-orchestrator"),
  "reset-user-password": () => import("./reset-user-password"),
  "seed-database": () => import("./seed-database"),
  "send-assignment-notification": () => import("./send-assignment-notification"),
  "send-event-notification": () => import("./send-event-notification"),
  "send-event-reminders": () => import("./send-event-reminders"),
  "send-license-reminder": () => import("./send-license-reminder"),
  "send-profile-reminder": () => import("./send-profile-reminder"),
  "send-whatsapp": () => import("./send-whatsapp"),
  "test-email-config": () => import("./test-email-config"),
  "test-whatsapp-config": () => import("./test-whatsapp-config"),
  "update-application-settings": () => import("./update-application-settings"),
  "update-user-email": () => import("./update-user-email"),
  "upsert-whatsapp-config": () => import("./upsert-whatsapp-config"),
};

/** Public webhook receivers; reached only through /api/public/* routes. */
export const webhookTasks: Record<string, Loader> = {
  "kirisan-webhook": () => import("./kirisan-webhook"),
  "meta-whatsapp-webhook": () => import("./meta-whatsapp-webhook"),
};

export async function runServerTask(name: string, request: Request): Promise<Response> {
  const load = serverTasks[name];
  if (!load) {
    return Response.json({ error: `Unknown server task: ${name}` }, { status: 404 });
  }
  const mod = await load();
  return mod.handler(request);
}
