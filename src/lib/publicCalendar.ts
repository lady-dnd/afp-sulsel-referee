import {
  eachDayOfInterval,
  endOfMonth,
  format,
  isValid,
  parseISO,
  startOfMonth,
} from "date-fns";

export type PublicEventStatus = "DIAJUKAN" | "DISETUJUI" | "SELESAI";

export interface PublicRegion {
  id: string;
  name: string;
}

export interface PublicEvent {
  id: string;
  name: string;
  date: string;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  category: string | null;
  status: PublicEventStatus;
  kabupaten_kota_id: string | null;
  kabupaten_kota: PublicRegion | null;
}

export const PUBLIC_EVENT_STATUSES: readonly PublicEventStatus[] = [
  "DISETUJUI",
  "DIAJUKAN",
  "SELESAI",
];

export function getEventDateRange(event: Pick<PublicEvent, "date" | "start_date" | "end_date">) {
  const startStr = event.start_date ?? event.date;
  const endStr = event.end_date ?? startStr;
  const start = parseISO(startStr);
  const end = parseISO(endStr);
  if (!isValid(start)) return null;
  if (!isValid(end) || end < start) return { start, end: start };
  return { start, end };
}

export function expandEventDateKeys(
  event: Pick<PublicEvent, "date" | "start_date" | "end_date">,
): string[] {
  const range = getEventDateRange(event);
  if (!range) return [];
  return eachDayOfInterval(range).map((day) => format(day, "yyyy-MM-dd"));
}

export function filterPublicEvents(
  events: PublicEvent[],
  filters: { regionId: string; statusFilter: string },
): PublicEvent[] {
  return events.filter((event) => {
    if (!PUBLIC_EVENT_STATUSES.includes(event.status)) return false;
    const matchRegion =
      filters.regionId === "all" || event.kabupaten_kota_id === filters.regionId;
    const matchStatus =
      filters.statusFilter === "all" || event.status === filters.statusFilter;
    return matchRegion && matchStatus;
  });
}

export function buildDateEventMap(events: PublicEvent[]): Map<string, PublicEvent[]> {
  const map = new Map<string, PublicEvent[]>();
  for (const event of events) {
    for (const key of expandEventDateKeys(event)) {
      const existing = map.get(key);
      if (existing) {
        existing.push(event);
      } else {
        map.set(key, [event]);
      }
    }
  }
  return map;
}

export function getMonthAvailabilitySummary(events: PublicEvent[], monthDate: Date) {
  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);
  const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const dateMap = buildDateEventMap(events);

  let bookedDays = 0;
  for (const day of allDays) {
    const key = format(day, "yyyy-MM-dd");
    if ((dateMap.get(key)?.length ?? 0) > 0) {
      bookedDays += 1;
    }
  }

  const monthEvents = events.filter((event) => {
    const range = getEventDateRange(event);
    if (!range) return false;
    return range.start <= monthEnd && range.end >= monthStart;
  });

  return {
    totalDays: allDays.length,
    bookedDays,
    availableDays: allDays.length - bookedDays,
    monthEvents,
  };
}

export function getPublicEventStatusLabel(status: PublicEventStatus): {
  label: string;
  variant: "success" | "warning" | "info";
} {
  switch (status) {
    case "DISETUJUI":
      return { label: "Disetujui", variant: "success" };
    case "DIAJUKAN":
      return { label: "Dalam Pengajuan", variant: "warning" };
    case "SELESAI":
      return { label: "Selesai", variant: "info" };
  }
}