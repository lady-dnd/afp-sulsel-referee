import { useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, ExternalLink, Loader2, MessageSquare, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useEventWhatsAppStatus, useRetryEventWhatsApp } from "@/hooks/useEventWhatsAppStatus";
import {
  getWhatsAppErrorHint,
  getWhatsAppStatusDisplay,
  type EventWhatsAppStatusItem,
} from "@/lib/whatsappStatus";

interface EventWhatsAppStatusTabProps {
  eventId: string;
  eventName: string;
  enabled: boolean;
}

type FilterMode = "all" | "attention" | "sent";

function buildManualWaLink(item: EventWhatsAppStatusItem, eventName: string): string | null {
  if (!item.whatsappNumber) return null;
  const digits = item.whatsappNumber.replace(/\D/g, "");
  if (!digits) return null;
  const normalized = digits.startsWith("08") ? `62${digits.slice(1)}` : digits;
  const text =
    item.notificationType === "completion"
      ? `Halo ${item.refereeName}, event "${eventName}" telah selesai. Silakan buka aplikasi AFP Sulsel pada menu Honor untuk mengajukan honorarium Anda.`
      : `Halo ${item.refereeName}, Anda mendapatkan penugasan wasit untuk event "${eventName}". Silakan buka aplikasi AFP Sulsel untuk konfirmasi penugasan.`;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(text)}`;
}

export function EventWhatsAppStatusTab({ eventId, eventName, enabled }: EventWhatsAppStatusTabProps) {
  const [filter, setFilter] = useState<FilterMode>("all");
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const { data, isLoading, error, refetch } = useEventWhatsAppStatus(eventId, enabled);
  const retryMutation = useRetryEventWhatsApp();

  const handleRetry = async (item: EventWhatsAppStatusItem) => {
    setRetryingId(item.id);
    try {
      await retryMutation.mutateAsync({
        eventId,
        notificationType: item.notificationType,
        assignmentId: item.assignmentId,
        refereeId: item.refereeId,
      });
    } finally {
      setRetryingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/30 bg-destructive/5" role="alert">
        <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
          <p className="text-sm text-destructive">Status notifikasi WhatsApp gagal dimuat.</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Coba Lagi
          </Button>
        </CardContent>
      </Card>
    );
  }

  const summary = data?.summary ?? { total: 0, sent: 0, pending: 0, failed: 0, skipped: 0, needsAttention: 0 };
  const items = data?.items ?? [];

  const filteredItems = items.filter((item) => {
    if (filter === "attention") return item.status === "failed" || item.status === "skipped" || item.status === "not_sent";
    if (filter === "sent") return item.status === "sent";
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Terkirim</p>
            <p className="text-lg font-bold text-success">{summary.sent}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Gagal / Dilewati</p>
            <p className="text-lg font-bold text-destructive">{summary.needsAttention}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Menunggu</p>
            <p className="text-lg font-bold text-warning">{summary.pending}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>
            Semua ({summary.total})
          </Button>
          <Button size="sm" variant={filter === "attention" ? "destructive" : "outline"} onClick={() => setFilter("attention")}>
            Perlu Tindak Lanjut ({summary.needsAttention})
          </Button>
          <Button size="sm" variant={filter === "sent" ? "default" : "outline"} onClick={() => setFilter("sent")}>
            Terkirim ({summary.sent})
          </Button>
        </div>
        <Button size="sm" variant="ghost" onClick={() => void refetch()} disabled={isLoading}>
          <RefreshCw className="h-4 w-4 mr-1" />
          Segarkan
        </Button>
      </div>

      {filteredItems.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">
              {items.length === 0
                ? "Belum ada pengiriman notifikasi WhatsApp untuk event ini."
                : "Tidak ada notifikasi pada filter yang dipilih."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => {
            const statusUi = getWhatsAppStatusDisplay(item.status);
            const errorHint = getWhatsAppErrorHint(item.errorCode);
            const canRetry = item.status === "failed" || item.status === "skipped" || item.status === "not_sent";
            const manualLink = buildManualWaLink(item, eventName);
            const isRowRetrying = retryingId === item.id && retryMutation.isPending;

            return (
              <Card key={item.id} className={item.status === "failed" ? "border-destructive/40" : undefined}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{item.refereeName}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.notificationType === "completion" ? "Event Selesai & Input Honor" : "Penugasan Wasit"}
                        {item.whatsappNumber ? ` • ${item.whatsappNumber}` : " • Nomor WA belum diisi"}
                      </p>
                    </div>
                    <StatusBadge status={statusUi.variant}>{statusUi.label}</StatusBadge>
                  </div>

                  {errorHint && (
                    <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-2.5 text-xs text-destructive">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>{errorHint}</span>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      {item.status === "sent" ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                      ) : (
                        <Clock className="h-3.5 w-3.5" />
                      )}
                      {item.sentAt
                        ? `Terkirim ${format(new Date(item.sentAt), "d MMM yyyy HH:mm", { locale: id })}`
                        : item.updatedAt
                          ? `Diperbarui ${format(new Date(item.updatedAt), "d MMM yyyy HH:mm", { locale: id })}`
                          : "Belum pernah dikirim"}
                    </span>

                    <div className="flex items-center gap-2">
                      {manualLink && canRetry && (
                        <Button size="sm" variant="outline" asChild>
                          <a href={manualLink} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3.5 w-3.5 mr-1" />
                            WA Manual
                          </a>
                        </Button>
                      )}
                      {canRetry && (
                        <Button
                          size="sm"
                          variant={item.status === "failed" ? "destructive" : "secondary"}
                          disabled={retryMutation.isPending}
                          onClick={() => void handleRetry(item)}
                        >
                          {isRowRetrying ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5 mr-1" />
                          )}
                          Kirim Ulang
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}