import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { id as localeId } from "date-fns/locale";
import {
  CalendarCheck2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Filter,
  MapPin,
  PlusCircle,
  Tag,
  X,
} from "lucide-react";
import { Link } from "@/lib/navigation";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { usePublicEvents, usePublicRegions } from "@/hooks/usePublicEvents";
import {
  buildDateEventMap,
  filterPublicEvents,
  getMonthAvailabilitySummary,
  getPublicEventStatusLabel,
  type PublicEvent,
} from "@/lib/publicCalendar";
import { getToday } from "@/lib/currentYear";
import { cn } from "@/lib/utils";

const STATUS_BADGE_CLASSES = {
  success: "bg-success/15 text-success border-success/30",
  warning: "bg-warning/15 text-warning-foreground border-warning/40",
  info: "bg-info/15 text-info border-info/30",
} as const;

function formatEventDateRange(event: PublicEvent) {
  const startStr = event.start_date ?? event.date;
  const endStr = event.end_date ?? startStr;
  if (startStr === endStr) {
    return format(parseISO(startStr), "d MMM yyyy", { locale: localeId });
  }
  return `${format(parseISO(startStr), "d MMM", { locale: localeId })} – ${format(parseISO(endStr), "d MMM yyyy", { locale: localeId })}`;
}

export function PublicEventCalendar() {
  const todayDate = useMemo(() => parseISO(getToday()), []);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(todayDate);
  const [currentMonth, setCurrentMonth] = useState<Date>(todayDate);
  const [regionFilter, setRegionFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: events = [], isLoading: eventsLoading, isError } = usePublicEvents();
  const { data: regions = [], isLoading: regionsLoading } = usePublicRegions();

  const filteredEvents = useMemo(
    () => filterPublicEvents(events, { regionId: regionFilter, statusFilter }),
    [events, regionFilter, statusFilter],
  );

  const dateEventMap = useMemo(() => buildDateEventMap(filteredEvents), [filteredEvents]);

  const summary = useMemo(
    () => getMonthAvailabilitySummary(filteredEvents, currentMonth),
    [filteredEvents, currentMonth],
  );

  const selectedDateKey = selectedDate ? format(selectedDate, "yyyy-MM-dd") : "";
  const eventsOnSelectedDate = selectedDateKey ? (dateEventMap.get(selectedDateKey) ?? []) : [];
  const selectedRegionName =
    regionFilter === "all"
      ? "Seluruh Sulawesi Selatan"
      : (regions.find((r) => r.id === regionFilter)?.name ?? "Wilayah Terpilih");

  const hasActiveFilters = regionFilter !== "all" || statusFilter !== "all";

  const handlePreviousMonth = () =>
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const handleNextMonth = () =>
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  const handleToday = () => {
    setCurrentMonth(todayDate);
    setSelectedDate(todayDate);
  };

  if (eventsLoading || regionsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full rounded-xl" />
        <div className="grid lg:grid-cols-12 gap-6">
          <Skeleton className="h-[420px] lg:col-span-7 rounded-xl" />
          <Skeleton className="h-[420px] lg:col-span-5 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filter & Month Summary Bar */}
      <div className="card-elevated p-4 sm:p-5 space-y-4">
        <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              <Filter className="h-4 w-4 text-primary" />
              <span>Filter Wilayah:</span>
            </div>
            <Select value={regionFilter} onValueChange={setRegionFilter}>
              <SelectTrigger className="w-full sm:w-[230px]" aria-label="Pilih Kabupaten/Kota">
                <SelectValue placeholder="Semua Kab/Kota" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Kab/Kota (Sulsel)</SelectItem>
                {regions.map((region) => (
                  <SelectItem key={region.id} value={region.id}>
                    {region.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px]" aria-label="Filter Status Event">
                <SelectValue placeholder="Semua Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Status Aktif</SelectItem>
                <SelectItem value="DISETUJUI">Disetujui</SelectItem>
                <SelectItem value="DIAJUKAN">Dalam Pengajuan</SelectItem>
                <SelectItem value="SELESAI">Selesai</SelectItem>
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setRegionFilter("all");
                  setStatusFilter("all");
                }}
                className="text-muted-foreground"
              >
                <X className="h-4 w-4 mr-1" />
                Reset
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            <Button variant="outline" size="sm" onClick={handleToday}>
              Hari Ini
            </Button>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={handlePreviousMonth}
                aria-label="Bulan sebelumnya"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={handleNextMonth}
                aria-label="Bulan berikutnya"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Month Vacancy Stats */}
        <div className="grid grid-cols-3 gap-3 pt-3 border-t">
          <div className="rounded-lg bg-success/10 border border-success/20 px-3 py-2.5">
            <p className="text-xs text-muted-foreground">Jadwal Kosong</p>
            <p className="text-lg sm:text-xl font-bold text-success">{summary.availableDays} hari</p>
          </div>
          <div className="rounded-lg bg-primary/10 border border-primary/20 px-3 py-2.5">
            <p className="text-xs text-muted-foreground">Tanggal Terisi</p>
            <p className="text-lg sm:text-xl font-bold text-primary">{summary.bookedDays} hari</p>
          </div>
          <div className="rounded-lg bg-secondary px-3 py-2.5">
            <p className="text-xs text-muted-foreground">Event Bulan Ini</p>
            <p className="text-lg sm:text-xl font-bold text-foreground">
              {summary.monthEvents.length} event
            </p>
          </div>
        </div>
      </div>

      {isError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          Gagal memuat data kalender event. Silakan muat ulang halaman.
        </div>
      )}

      {/* Calendar Grid + Selected Date Detail */}
      <div className="grid lg:grid-cols-12 gap-6 items-start">
        <Card className="lg:col-span-7">
          <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary" />
                {format(currentMonth, "MMMM yyyy", { locale: localeId })}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">{selectedRegionName}</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              month={currentMonth}
              onMonthChange={setCurrentMonth}
              locale={localeId}
              className="w-full p-0 [--cell-size:2.75rem] sm:[--cell-size:3.25rem]"
              classNames={{
                root: "w-full",
                months: "w-full",
                month: "w-full space-y-3",
                month_grid: "w-full border-collapse",
                nav: "hidden",
                month_caption: "hidden",
                weekdays: "grid grid-cols-7 w-full",
                weekday: "text-center text-xs font-medium text-muted-foreground py-1",
                week: "grid grid-cols-7 w-full gap-1 mt-1",
                day: "w-full p-0 text-center",
              }}
              components={{
                DayButton: ({ day, modifiers: dayModifiers, className, ...props }) => {
                  const key = format(day.date, "yyyy-MM-dd");
                  const dayEvents = dateEventMap.get(key) ?? [];
                  const hasApproved = dayEvents.some((e) => e.status === "DISETUJUI");
                  const hasPending = dayEvents.some((e) => e.status === "DIAJUKAN");
                  const isOutside = dayModifiers.outside;

                  return (
                    <CalendarDayButton
                      day={day}
                      modifiers={dayModifiers}
                      className={cn(
                        "relative h-11 sm:h-12 w-full flex flex-col items-center justify-center rounded-lg border transition-colors",
                        !isOutside && dayEvents.length === 0 && "border-transparent hover:bg-success/10",
                        !isOutside && hasApproved && "bg-primary/10 border-primary/30 font-semibold",
                        !isOutside &&
                          !hasApproved &&
                          hasPending &&
                          "bg-warning/15 border-warning/40 font-semibold",
                        !isOutside &&
                          !hasApproved &&
                          !hasPending &&
                          dayEvents.length > 0 &&
                          "bg-muted border-border",
                        className,
                      )}
                      {...props}
                    >
                      <span className="text-sm leading-none">{day.date.getDate()}</span>
                      {!isOutside && dayEvents.length > 0 ? (
                        <span className="mt-1 flex items-center gap-0.5">
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              hasApproved
                                ? "bg-primary"
                                : hasPending
                                  ? "bg-warning"
                                  : "bg-muted-foreground",
                            )}
                          />
                          {dayEvents.length > 1 && (
                            <span className="text-[10px] leading-none text-muted-foreground">
                              {dayEvents.length}
                            </span>
                          )}
                        </span>
                      ) : (
                        !isOutside && <span className="mt-1 h-1.5 w-1.5 rounded-full bg-success/50" />
                      )}
                    </CalendarDayButton>
                  );
                },
              }}
            />

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-3 border-t text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-success/60" />
                Jadwal Kosong
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                Terisi (Disetujui)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-warning" />
                Dalam Pengajuan
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground" />
                Selesai
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Selected Date Availability & Event Detail */}
        <Card className="lg:col-span-5">
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-base">
              {selectedDate
                ? format(selectedDate, "EEEE, d MMMM yyyy", { locale: localeId })
                : "Pilih Tanggal"}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Wilayah: <span className="font-medium text-foreground">{selectedRegionName}</span>
            </p>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            {eventsOnSelectedDate.length === 0 ? (
              <div className="rounded-xl border border-success/30 bg-success/10 p-5 text-center space-y-3">
                <div className="icon-circle mx-auto bg-success/20 text-success">
                  <CalendarCheck2 className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <p className="font-semibold text-foreground">Jadwal Kosong / Tersedia</p>
                  <p className="text-sm text-muted-foreground">
                    Belum ada event terjadwal di {selectedRegionName} pada tanggal ini.
                  </p>
                </div>
                <div className="pt-1 flex flex-col sm:flex-row gap-2 justify-center">
                  <Button asChild size="sm">
                    <Link to="/events/submit">
                      <PlusCircle className="h-4 w-4 mr-1.5" />
                      Ajukan Event
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/signup">Daftar Akun Panitia</Link>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground">
                  {eventsOnSelectedDate.length} event terjadwal pada tanggal ini:
                </p>
                {eventsOnSelectedDate.map((event) => {
                  const statusInfo = getPublicEventStatusLabel(event.status);
                  return (
                    <div
                      key={event.id}
                      className="rounded-lg border p-3.5 space-y-2 bg-card hover:border-primary/40 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-sm text-foreground leading-snug">
                          {event.name}
                        </h3>
                        <Badge
                          variant="outline"
                          className={cn("shrink-0 text-[11px]", STATUS_BADGE_CLASSES[statusInfo.variant])}
                        >
                          {statusInfo.label}
                        </Badge>
                      </div>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <p className="flex items-center gap-1.5">
                          <CalendarDays className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span>{formatEventDateRange(event)}</span>
                        </p>
                        {(event.location || event.kabupaten_kota?.name) && (
                          <p className="flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                            <span>
                              {[event.location, event.kabupaten_kota?.name]
                                .filter(Boolean)
                                .join(" • ")}
                            </span>
                          </p>
                        )}
                        {event.category && (
                          <p className="flex items-center gap-1.5">
                            <Tag className="h-3.5 w-3.5 text-primary shrink-0" />
                            <span>{event.category}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Monthly Event Agenda */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Agenda Event — {format(currentMonth, "MMMM yyyy", { locale: localeId })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {summary.monthEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Belum ada event terdaftar pada bulan ini untuk {selectedRegionName}. Seluruh tanggal
              tersedia untuk pengajuan event baru.
            </p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {summary.monthEvents.map((event) => {
                const statusInfo = getPublicEventStatusLabel(event.status);
                return (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => setSelectedDate(parseISO(event.start_date ?? event.date))}
                    className="text-left rounded-lg border p-3.5 hover:border-primary/50 hover:bg-secondary/40 transition-colors space-y-1.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-sm text-foreground line-clamp-1">
                        {event.name}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn("shrink-0 text-[10px]", STATUS_BADGE_CLASSES[statusInfo.variant])}
                      >
                        {statusInfo.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{formatEventDateRange(event)}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3 shrink-0 text-primary" />
                      <span className="truncate">
                        {event.kabupaten_kota?.name ?? event.location ?? "Sulawesi Selatan"}
                      </span>
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}