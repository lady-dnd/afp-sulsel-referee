import { describe, expect, it } from "vitest";
import { findRangeConflict, isDateBooked, mapBookingErrorMessage, type BookedDateRange } from "@/lib/eventBooking";

const bookedRanges: BookedDateRange[] = [
  {
    event_id: "ev-1",
    event_name: "Piala Walikota Makassar",
    start_date: "2026-12-10",
    end_date: "2026-12-12",
    status: "DISETUJUI",
  },
  {
    event_id: "ev-2",
    event_name: "Turnamen Pelajar Gowa",
    start_date: "2026-12-20",
    end_date: "2026-12-20",
    status: "DIAJUKAN",
  },
];

describe("eventBooking regional date lock", () => {
  it("marks dates inside a booked event range as booked and leaves adjacent dates open", () => {
    expect(isDateBooked(new Date(2026, 11, 9), bookedRanges)).toBeNull();
    expect(isDateBooked(new Date(2026, 11, 10), bookedRanges)?.event_id).toBe("ev-1");
    expect(isDateBooked(new Date(2026, 11, 11), bookedRanges)?.event_id).toBe("ev-1");
    expect(isDateBooked(new Date(2026, 11, 12), bookedRanges)?.event_id).toBe("ev-1");
    expect(isDateBooked(new Date(2026, 11, 13), bookedRanges)).toBeNull();
  });

  it("detects multi-day ranges that span across a booked date", () => {
    const conflict = findRangeConflict(new Date(2026, 11, 8), new Date(2026, 11, 15), bookedRanges);
    expect(conflict?.event_id).toBe("ev-1");

    const boundaryConflict = findRangeConflict(new Date(2026, 11, 18), new Date(2026, 11, 20), bookedRanges);
    expect(boundaryConflict?.event_id).toBe("ev-2");

    const openRange = findRangeConflict(new Date(2026, 11, 14), new Date(2026, 11, 19), bookedRanges);
    expect(openRange).toBeNull();
  });

  it("maps database overlap errors to user-friendly Indonesian messages", () => {
    expect(
      mapBookingErrorMessage({
        code: "23P01",
        message: 'EVENT_DATE_CONFLICT: Tanggal bentrok dengan event "Piala Walikota" (10-12-2026 s/d 12-12-2026) di wilayah yang sama.',
      }),
    ).toContain("Piala Walikota");

    expect(mapBookingErrorMessage({ code: "23P01", message: "exclusion violation" })).toContain(
      "sudah dipesan",
    );
    expect(mapBookingErrorMessage({ message: "other error" })).toBeNull();
  });
});