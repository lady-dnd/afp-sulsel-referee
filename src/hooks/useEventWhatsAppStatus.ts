import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invokeServerTask } from "@/lib/server-tasks";
import { toast } from "sonner";
import type {
  EventWhatsAppNotificationType,
  EventWhatsAppStatusItem,
  EventWhatsAppStatusSummary,
} from "@/lib/whatsappStatus";

export interface EventWhatsAppStatusResponse {
  success: boolean;
  eventId: string;
  summary: EventWhatsAppStatusSummary;
  items: EventWhatsAppStatusItem[];
}

export function useEventWhatsAppStatus(eventId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["event-whatsapp-status", eventId],
    queryFn: async () => {
      const { data, error } = await invokeServerTask("event-whatsapp-status", {
        body: { eventId, action: "list" },
      });
      if (error) throw new Error(error.message || "Gagal memuat status notifikasi WhatsApp");
      return data as EventWhatsAppStatusResponse;
    },
    enabled: Boolean(eventId) && enabled,
  });
}

export function useRetryEventWhatsApp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      eventId: string;
      notificationType: EventWhatsAppNotificationType;
      assignmentId?: string | null;
      refereeId?: string;
    }) => {
      const { data, error } = await invokeServerTask("event-whatsapp-status", {
        body: {
          eventId: params.eventId,
          action: "retry",
          notificationType: params.notificationType,
          ...(params.assignmentId ? { assignmentId: params.assignmentId } : {}),
          ...(params.refereeId ? { refereeId: params.refereeId } : {}),
        },
      });
      if (error) throw new Error(error.message || "Gagal mengirim ulang notifikasi WhatsApp");
      return data as EventWhatsAppStatusResponse;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["event-whatsapp-status", data.eventId], data);
      toast.success("Proses kirim ulang notifikasi WhatsApp selesai diperbarui");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Gagal mengirim ulang notifikasi WhatsApp");
    },
  });
}