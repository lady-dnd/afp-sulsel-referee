import { describe, expect, it } from "vitest";
import {
  buildDateEventMap,
  expandEventDateKeys,
  filterPublicEvents,
  getMonthAvailabilitySummary,
  type PublicEvent,
} from "../publicCalendar";

const sampleEvents: PublicEvent[] = [
  {
    id: "e1",
    name: "Liga Futsal Makassar",
    date: "2026-11-10",
    start_date: "2026-11-10",
    end_date: "2026-11-12",
    location: "GOR Sudiang",
    category: "Liga",
    status: "DISETUJUI",
    kabupaten_kota_id: "r-makassar",
    kabupaten_kota: { id: "r-makassar", name: "Makassar" },
  },
  {
    id: "e2",
    name: "Turnamen Gowa Cup",
    date: "2026-11-20",
    start_date: "2026-11-20",
    end_date: "2026-11-20",
    location: "GOR Sungguminasa",
    category: "Turnamen",
    status: "DIAJUKAN",
    kabupaten_kota_id: "r-gowa",
    kabupaten_kota: { id: "r-gowa", name: "Gowa" },
  },
];

describe("publicCalendar helpers", () => {
  it("expands multi-day event ranges into consecutive yyyy-MM-dd keys", () => {
    expect(expandEventDateKeys(sampleEvents[0]!)).toEqual([
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
    ]);
  });

  it("filters events by region and status", () => {
    const makassarOnly = filterPublicEvents(sampleEvents, {
      regionId: "r-makassar",
      statusFilter: "all",
    });
    expect(makassarOnly).toHaveLength(1);
    expect(makassarOnly[0]?.id).toBe("e1");

    const pendingOnly = filterPublicEvents(sampleEvents, {
      regionId: "all",
      statusFilter: "DIAJUKAN",
    });
    expect(pendingOnly).toHaveLength(1);
    expect(pendingOnly[0]?.id).toBe("e2");
  });

  it("calculates booked and available days accurately for a month", () => {
    const makassarEvents = filterPublicEvents(sampleEvents, {
      regionId: "r-makassar",
      statusFilter: "all",
    });
    const summary = getMonthAvailabilitySummary(makassarEvents, new Date(2026, 10, 1));
    expect(summary.totalDays).toBe(30);
    expect(summary.bookedDays).toBe(3);
    expect(summary.availableDays).toBe(27);
    expect(summary.monthEvents).toHaveLength(1);
  });

  it("maps multiple events to their respective date keys", () => {
    const map = buildDateEventMap(sampleEvents);
    expect(map.get("2026-11-11")?.map((e) => e.id)).toEqual(["e1"]);
    expect(map.get("2026-11-20")?.map((e) => e.id)).toEqual(["e2"]);
    expect(map.get("2026-11-15")).toBeUndefined();
  });
});