import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  PUBLIC_EVENT_STATUSES,
  type PublicEvent,
  type PublicRegion,
} from "@/lib/publicCalendar";

export function usePublicEvents() {
  return useQuery({
    queryKey: ["public-events"],
    queryFn: async (): Promise<PublicEvent[]> => {
      const { data, error } = await supabase
        .from("events")
        .select(
          `
          id,
          name,
          date,
          start_date,
          end_date,
          location,
          category,
          status,
          kabupaten_kota_id,
          kabupaten_kota:kabupaten_kota_id (id, name)
        `,
        )
        .is("deleted_at", null)
        .in("status", [...PUBLIC_EVENT_STATUSES])
        .order("start_date", { ascending: true });

      if (error) throw error;

      return (data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        date: row.date,
        start_date: row.start_date,
        end_date: row.end_date,
        location: row.location,
        category: row.category,
        status: (row.status ?? "DIAJUKAN") as PublicEvent["status"],
        kabupaten_kota_id: row.kabupaten_kota_id,
        kabupaten_kota: Array.isArray(row.kabupaten_kota)
          ? (row.kabupaten_kota[0] ?? null)
          : (row.kabupaten_kota ?? null),
      }));
    },
    staleTime: 60_000,
  });
}

export function usePublicRegions() {
  return useQuery({
    queryKey: ["public-kabupaten-kota"],
    queryFn: async (): Promise<PublicRegion[]> => {
      const { data, error } = await supabase
        .from("kabupaten_kota")
        .select("id, name")
        .order("name", { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
    staleTime: 10 * 60_000,
  });
}