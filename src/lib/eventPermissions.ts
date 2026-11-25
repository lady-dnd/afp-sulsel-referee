import type { AppRole } from "@/repositories/auth/auth-types";

export interface EventPermissionTarget {
  status: string | null | undefined;
  kabupaten_kota_id?: string | null;
  created_by?: string | null;
}

export function isRegionalEventMatch(
  userKabupatenKotaId: string | null | undefined,
  eventKabupatenKotaId: string | null | undefined,
): boolean {
  return Boolean(userKabupatenKotaId && eventKabupatenKotaId && userKabupatenKotaId === eventKabupatenKotaId);
}

export function canApproveEvent(
  role: AppRole | null,
  userKabupatenKotaId: string | null | undefined,
  event: EventPermissionTarget,
): boolean {
  if (event.status !== "DIAJUKAN") return false;
  if (role === "admin_provinsi") return true;
  if (role === "admin_kab_kota") {
    return isRegionalEventMatch(userKabupatenKotaId, event.kabupaten_kota_id);
  }
  return false;
}

export function canAccessAssignRefereesForEvent(
  role: AppRole | null,
  userKabupatenKotaId: string | null | undefined,
  event: Pick<EventPermissionTarget, "kabupaten_kota_id">,
): boolean {
  if (role === "admin_provinsi") return true;
  if (role === "admin_kab_kota") {
    return isRegionalEventMatch(userKabupatenKotaId, event.kabupaten_kota_id);
  }
  return false;
}

export function canAssignRefereesToEvent(
  role: AppRole | null,
  userKabupatenKotaId: string | null | undefined,
  event: EventPermissionTarget,
): boolean {
  if (event.status !== "DISETUJUI") return false;
  return canAccessAssignRefereesForEvent(role, userKabupatenKotaId, event);
}

export function canEditEvent(
  role: AppRole | null,
  userId: string | null | undefined,
  userKabupatenKotaId: string | null | undefined,
  event: EventPermissionTarget,
): boolean {
  if (role === "admin_provinsi") return true;
  if (event.status !== "DIAJUKAN") return false;
  if (role === "admin_kab_kota" && isRegionalEventMatch(userKabupatenKotaId, event.kabupaten_kota_id)) {
    return true;
  }
  return Boolean(userId && event.created_by === userId);
}

export function getInitialEventStatusForRole(role: AppRole | null): "DIAJUKAN" | "DISETUJUI" {
  return role === "admin_provinsi" ? "DISETUJUI" : "DIAJUKAN";
}