import { format } from "date-fns";

export interface BookedDateRange {
  event_id: string;
  event_name: string;
  start_date: string;
  end_date: string;
  status: string;
}

export function toDateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function isDateBooked(
  date: Date,
  bookedRanges: BookedDateRange[],
): BookedDateRange | null {
  const key = toDateKey(date);
  for (const range of bookedRanges) {
    if (key >= range.start_date && key <= range.end_date) {
      return range;
    }
  }
  return null;
}

export function findRangeConflict(
  startDate: Date | undefined,
  endDate: Date | undefined,
  bookedRanges: BookedDateRange[],
): BookedDateRange | null {
  if (!startDate || !endDate) return null;
  const startKey = toDateKey(startDate);
  const endKey = toDateKey(endDate);
  if (endKey < startKey) return null;

  for (const range of bookedRanges) {
    if (startKey <= range.end_date && endKey >= range.start_date) {
      return range;
    }
  }
  return null;
}

export function mapBookingErrorMessage(error: unknown): string | null {
  const message =
    error && typeof error === "object" && "message" in error && typeof error.message === "string"
      ? error.message
      : "";

  if (message.includes("EVENT_DATE_CONFLICT:")) {
    return message.split("EVENT_DATE_CONFLICT:")[1]?.trim() || "Tanggal yang dipilih sudah dipesan oleh event lain di wilayah ini.";
  }

  if (message.includes("INVALID_EVENT_DATE_RANGE:")) {
    return message.split("INVALID_EVENT_DATE_RANGE:")[1]?.trim() || "Tanggal selesai tidak boleh lebih awal dari tanggal mulai.";
  }

  const code =
    error && typeof error === "object" && "code" in error && typeof error.code === "string"
      ? error.code
      : "";

  if (code === "23P01") {
    return "Tanggal yang dipilih sudah dipesan oleh event lain di Kabupaten/Kota ini. Silakan pilih tanggal lain.";
  }

  return null;
}