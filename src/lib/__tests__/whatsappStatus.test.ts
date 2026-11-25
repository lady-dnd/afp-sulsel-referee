import { describe, expect, it } from "vitest";
import {
  getWhatsAppErrorHint,
  getWhatsAppStatusDisplay,
  normalizeDeliveryStatus,
  summarizeWhatsAppStatuses,
  type EventWhatsAppStatusItem,
} from "@/lib/whatsappStatus";

describe("whatsappStatus helpers", () => {
  it("normalizes provider statuses consistently", () => {
    expect(normalizeDeliveryStatus("sent")).toBe("sent");
    expect(normalizeDeliveryStatus("delivered")).toBe("sent");
    expect(normalizeDeliveryStatus("read")).toBe("sent");
    expect(normalizeDeliveryStatus("failed")).toBe("failed");
    expect(normalizeDeliveryStatus("skipped")).toBe("skipped");
    expect(normalizeDeliveryStatus("pending")).toBe("pending");
    expect(normalizeDeliveryStatus(null)).toBe("not_sent");
  });

  it("summarizes delivery counts and attention count accurately", () => {
    const items: EventWhatsAppStatusItem[] = [
      {
        id: "1",
        notificationType: "assignment",
        assignmentId: "a1",
        refereeId: "r1",
        refereeName: "Wasit A",
        role: "UTAMA",
        whatsappNumber: "628123456789",
        status: "sent",
        provider: "meta",
        messageId: "wamid.1",
        errorCode: null,
        sentAt: "2026-11-25T10:00:00Z",
        updatedAt: "2026-11-25T10:00:00Z",
      },
      {
        id: "2",
        notificationType: "assignment",
        assignmentId: "a2",
        refereeId: "r2",
        refereeName: "Wasit B",
        role: "CADANGAN",
        whatsappNumber: null,
        status: "skipped",
        provider: "meta",
        messageId: null,
        errorCode: "WHATSAPP_CONTACT_MISSING",
        sentAt: null,
        updatedAt: "2026-11-25T10:00:00Z",
      },
      {
        id: "3",
        notificationType: "completion",
        assignmentId: null,
        refereeId: "r1",
        refereeName: "Wasit A",
        role: "UTAMA",
        whatsappNumber: "628123456789",
        status: "failed",
        provider: "meta",
        messageId: null,
        errorCode: "WHATSAPP_DELIVERY_FAILED",
        sentAt: null,
        updatedAt: "2026-11-25T10:05:00Z",
      },
    ];

    const summary = summarizeWhatsAppStatuses(items);
    expect(summary).toEqual({
      total: 3,
      sent: 1,
      pending: 0,
      failed: 1,
      skipped: 1,
      needsAttention: 2,
    });
  });

  it("provides actionable Indonesian error hints and status labels", () => {
    expect(getWhatsAppStatusDisplay("failed")).toEqual({ label: "Gagal", variant: "error" });
    expect(getWhatsAppErrorHint("WHATSAPP_CONTACT_MISSING")).toContain("Nomor WhatsApp wasit belum diisi");
    expect(getWhatsAppErrorHint("WHATSAPP_NOT_CONFIGURED")).toContain("belum dikonfigurasi");
    expect(getWhatsAppErrorHint(null)).toBeNull();
  });
});