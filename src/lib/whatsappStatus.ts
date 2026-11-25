export type WhatsAppDeliveryStatus = "sent" | "pending" | "failed" | "skipped" | "not_sent";
export type EventWhatsAppNotificationType = "assignment" | "completion";

export interface EventWhatsAppStatusItem {
  id: string;
  notificationType: EventWhatsAppNotificationType;
  assignmentId: string | null;
  refereeId: string;
  refereeName: string;
  role: string | null;
  whatsappNumber: string | null;
  status: WhatsAppDeliveryStatus;
  provider: string | null;
  messageId: string | null;
  errorCode: string | null;
  sentAt: string | null;
  updatedAt: string | null;
}

export interface EventWhatsAppStatusSummary {
  total: number;
  sent: number;
  pending: number;
  failed: number;
  skipped: number;
  needsAttention: number;
}

export function normalizeDeliveryStatus(raw: string | null | undefined): WhatsAppDeliveryStatus {
  const value = (raw || "").trim().toLowerCase();
  if (value === "sent" || value === "delivered" || value === "read") return "sent";
  if (value === "failed") return "failed";
  if (value === "skipped") return "skipped";
  if (value === "pending") return "pending";
  return "not_sent";
}

export function summarizeWhatsAppStatuses(items: EventWhatsAppStatusItem[]): EventWhatsAppStatusSummary {
  let sent = 0;
  let pending = 0;
  let failed = 0;
  let skipped = 0;

  for (const item of items) {
    if (item.status === "sent") sent += 1;
    else if (item.status === "pending") pending += 1;
    else if (item.status === "failed") failed += 1;
    else skipped += 1;
  }

  return {
    total: items.length,
    sent,
    pending,
    failed,
    skipped,
    needsAttention: failed + skipped,
  };
}

export function getWhatsAppStatusDisplay(status: WhatsAppDeliveryStatus): {
  label: string;
  variant: "success" | "warning" | "error" | "neutral";
} {
  switch (status) {
    case "sent":
      return { label: "Terkirim", variant: "success" };
    case "pending":
      return { label: "Menunggu", variant: "warning" };
    case "failed":
      return { label: "Gagal", variant: "error" };
    case "skipped":
      return { label: "Dilewati", variant: "warning" };
    default:
      return { label: "Belum Dikirim", variant: "neutral" };
  }
}

export function getWhatsAppErrorHint(errorCode: string | null | undefined): string | null {
  if (!errorCode) return null;
  switch (errorCode) {
    case "WHATSAPP_CONTACT_MISSING":
      return "Nomor WhatsApp wasit belum diisi atau format tidak valid. Minta wasit melengkapi profilnya.";
    case "WHATSAPP_NOT_CONFIGURED":
      return "Kredensial Meta WhatsApp belum dikonfigurasi di sistem.";
    case "WHATSAPP_DELIVERY_FAILED":
      return "Pengiriman ditolak oleh penyedia WhatsApp. Periksa template/nomor lalu coba kirim ulang.";
    case "WHATSAPP_NETWORK_ERROR":
      return "Gangguan jaringan saat menghubungi penyedia WhatsApp. Silakan kirim ulang.";
    default:
      return `Kode kendala: ${errorCode}`;
  }
}