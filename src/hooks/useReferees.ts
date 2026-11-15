import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Referee {
  id: string;
  full_name: string;
  birth_date: string | null;
  kabupaten_kota_id: string | null;
  kabupaten_kota_name: string | null;
  license_level: string | null;
  license_expiry: string | null;
  profile_photo_url: string | null;
  is_active: boolean;
  is_profile_complete: boolean;
  afk_origin: string | null;
  created_at: string;
}

export interface RefereeFilters {
  licenseLevel?: string;
  isActive?: boolean;
  kabupatenKotaId?: string;
  search?: string;
   expiringInDays?: number;
  page?: number;
  pageSize?: number;
}

export function useReferees(filters?: RefereeFilters) {
  const page = filters?.page || 1;
  const pageSize = filters?.pageSize || 50;
  const offset = (page - 1) * pageSize;

   // If expiring filter is set, we need to fetch all and filter client-side
   // because get_referees doesn't support date filtering yet
   const shouldFilterExpiring = filters?.expiringInDays !== undefined;

  return useQuery({
    queryKey: ["referees", filters],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_referees", {
        _license_level: filters?.licenseLevel || null,
        _is_active: filters?.isActive ?? null,
        _kabupaten_kota_id: filters?.kabupatenKotaId || null,
        _search: filters?.search || null,
         _limit: shouldFilterExpiring ? null : pageSize,
         _offset: shouldFilterExpiring ? 0 : offset,
      });

      if (error) throw error;
       
       let referees = data as Referee[];
       
       // Filter by expiring licenses if needed
       if (shouldFilterExpiring && filters.expiringInDays) {
         const daysThreshold = filters.expiringInDays;
         const today = new Date();
         const futureDate = new Date();
         futureDate.setDate(today.getDate() + daysThreshold);
         
         referees = referees.filter(ref => {
           if (!ref.license_expiry) return false;
           const expiryDate = new Date(ref.license_expiry);
           return expiryDate >= today && expiryDate <= futureDate;
         });
         
         // Apply pagination manually for filtered results
         referees = referees.slice(offset, offset + pageSize);
       }
       
       return referees;
    },
  });
}

export function useRefereesCount(filters?: Omit<RefereeFilters, 'page' | 'pageSize'>) {
   const shouldFilterExpiring = filters?.expiringInDays !== undefined;
   
  return useQuery({
    queryKey: ["referees-count", filters],
    queryFn: async () => {
       if (shouldFilterExpiring) {
         // Need to fetch all and count filtered results
         const { data, error } = await supabase.rpc("get_referees", {
           _license_level: filters?.licenseLevel || null,
           _is_active: filters?.isActive ?? null,
           _kabupaten_kota_id: filters?.kabupatenKotaId || null,
           _search: filters?.search || null,
           _limit: null,
           _offset: 0,
         });
         
         if (error) throw error;
         
         const daysThreshold = filters.expiringInDays!;
         const today = new Date();
         const futureDate = new Date();
         futureDate.setDate(today.getDate() + daysThreshold);
         
         const filtered = (data as Referee[]).filter(ref => {
           if (!ref.license_expiry) return false;
           const expiryDate = new Date(ref.license_expiry);
           return expiryDate >= today && expiryDate <= futureDate;
         });
         
         return filtered.length;
       } else {
         const { data, error } = await supabase.rpc("count_referees", {
           _license_level: filters?.licenseLevel || null,
           _is_active: filters?.isActive ?? null,
           _kabupaten_kota_id: filters?.kabupatenKotaId || null,
           _search: filters?.search || null,
         });
   
         if (error) throw error;
         return data as number;
       }
    },
  });
}

// Export referees to CSV
export function exportRefereesToCSV(referees: Referee[], filename: string = 'referees-export.csv') {
  const headers = [
    'Nama Lengkap',
    'Lisensi',
    'Kabupaten/Kota',
    'AFK Origin',
    'Status',
    'Tanggal Bergabung',
    'Tanggal Lahir',
    'Tanggal Expired Lisensi',
  ];

  const rows = referees.map(ref => [
    ref.full_name,
    ref.license_level || '-',
    ref.kabupaten_kota_name || '-',
    ref.afk_origin || '-',
    ref.is_active ? 'Aktif' : 'Non-Aktif',
    ref.created_at ? new Date(ref.created_at).toLocaleDateString('id-ID') : '-',
    ref.birth_date ? new Date(ref.birth_date).toLocaleDateString('id-ID') : '-',
    ref.license_expiry ? new Date(ref.license_expiry).toLocaleDateString('id-ID') : '-',
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function useReferee(id: string) {
  return useQuery({
    queryKey: ["referees", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select(`
          *,
          kabupaten_kota:kabupaten_kota_id (id, name)
        `)
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;
      
      if (!data) return null;

      // Check if user has wasit role
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", id)
        .eq("role", "wasit")
        .maybeSingle();

      if (!roleData) return null;

      return {
        ...data,
        kabupaten_kota_name: data.kabupaten_kota?.name || null,
      };
    },
    enabled: !!id,
  });
}

export function useRefereeStats() {
  return useQuery({
    queryKey: ["referee-stats"],
    queryFn: async () => {
      // Get all referees
      const { data: referees, error } = await supabase.rpc("get_referees", {
        _license_level: null,
        _is_active: null,
        _kabupaten_kota_id: null,
        _search: null,
      });

      if (error) throw error;

      const total = referees?.length || 0;
      const active = referees?.filter((r: Referee) => r.is_active).length || 0;
      const inactive = total - active;

      // Count by license
      const level_1 = referees?.filter((r: Referee) => r.license_level === "Level_1").length || 0;
      const level_2 = referees?.filter((r: Referee) => r.license_level === "Level_2").length || 0;
      const level_3 = referees?.filter((r: Referee) => r.license_level === "Level_3").length || 0;

      return {
        total,
        active,
        inactive,
        level_1,
        level_2,
        level_3,
      };
    },
  });
}

export function useUpdateReferee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: {
      id: string;
      full_name?: string;
      birth_date?: string;
      kabupaten_kota_id?: string;
      license_level?: string;
      license_expiry?: string;
      afk_origin?: string;
      occupation?: string;
      is_active?: boolean;
    }) => {
      const { data, error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["referees"] });
      queryClient.invalidateQueries({ queryKey: ["referees", data.id] });
      queryClient.invalidateQueries({ queryKey: ["referee-stats"] });
      toast.success("Data wasit berhasil diperbarui");
    },
    onError: (error) => {
      toast.error("Gagal memperbarui data wasit: " + error.message);
    },
  });
}

export function useToggleRefereeStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { data, error } = await supabase
        .from("profiles")
        .update({ is_active: isActive })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["referees"] });
      queryClient.invalidateQueries({ queryKey: ["referees", data.id] });
      queryClient.invalidateQueries({ queryKey: ["referee-stats"] });
      toast.success(variables.isActive ? "Wasit diaktifkan" : "Wasit dinonaktifkan");
    },
    onError: (error) => {
      toast.error("Gagal mengubah status wasit: " + error.message);
    },
  });
}

// License level options
export const LICENSE_LEVELS = [
  { value: "level_1", label: "Level 1" },
  { value: "level_2", label: "Level 2" },
  { value: "level_3", label: "Level 3" },
];

export function getLicenseBadgeColor(level: string | null) {
  switch (level) {
    case "level_1":
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "level_2":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "level_3":
      return "bg-green-100 text-green-800 border-green-200";    
    default:
      return "bg-gray-100 text-gray-600 border-gray-200";
  }
}
