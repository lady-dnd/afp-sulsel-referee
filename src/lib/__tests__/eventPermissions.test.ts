import { describe, expect, it } from "vitest";
import {
  canAccessAssignRefereesForEvent,
  canApproveEvent,
  canAssignRefereesToEvent,
  canEditEvent,
  getInitialEventStatusForRole,
} from "../eventPermissions";

const MAKASSAR = "kab-makassar";
const GOWA = "kab-gowa";

describe("eventPermissions", () => {
  it("allows Admin Provinsi to approve and assign referees across all kabupaten", () => {
    const pendingGowa = { status: "DIAJUKAN", kabupaten_kota_id: GOWA, created_by: "panitia-1" };
    const approvedGowa = { status: "DISETUJUI", kabupaten_kota_id: GOWA, created_by: "panitia-1" };

    expect(canApproveEvent("admin_provinsi", MAKASSAR, pendingGowa)).toBe(true);
    expect(canAssignRefereesToEvent("admin_provinsi", MAKASSAR, approvedGowa)).toBe(true);
    expect(canAccessAssignRefereesForEvent("admin_provinsi", null, approvedGowa)).toBe(true);
    expect(getInitialEventStatusForRole("admin_provinsi")).toBe("DISETUJUI");
  });

  it("restricts Admin Kab/Kota approval and referee assignment strictly to their own kabupaten", () => {
    const pendingMakassar = { status: "DIAJUKAN", kabupaten_kota_id: MAKASSAR, created_by: "panitia-1" };
    const pendingGowa = { status: "DIAJUKAN", kabupaten_kota_id: GOWA, created_by: "panitia-2" };
    const approvedMakassar = { status: "DISETUJUI", kabupaten_kota_id: MAKASSAR, created_by: "panitia-1" };
    const approvedGowa = { status: "DISETUJUI", kabupaten_kota_id: GOWA, created_by: "panitia-2" };

    expect(canApproveEvent("admin_kab_kota", MAKASSAR, pendingMakassar)).toBe(true);
    expect(canApproveEvent("admin_kab_kota", MAKASSAR, pendingGowa)).toBe(false);

    expect(canAssignRefereesToEvent("admin_kab_kota", MAKASSAR, approvedMakassar)).toBe(true);
    expect(canAssignRefereesToEvent("admin_kab_kota", MAKASSAR, approvedGowa)).toBe(false);
    expect(canAccessAssignRefereesForEvent("admin_kab_kota", MAKASSAR, approvedGowa)).toBe(false);
    expect(getInitialEventStatusForRole("admin_kab_kota")).toBe("DIAJUKAN");
  });

  it("prevents Panitia from approving events or assigning referees, and limits edits to own pending events", () => {
    const ownPending = { status: "DIAJUKAN", kabupaten_kota_id: MAKASSAR, created_by: "panitia-1" };
    const ownApproved = { status: "DISETUJUI", kabupaten_kota_id: MAKASSAR, created_by: "panitia-1" };
    const otherPending = { status: "DIAJUKAN", kabupaten_kota_id: MAKASSAR, created_by: "panitia-2" };

    expect(canApproveEvent("panitia", MAKASSAR, ownPending)).toBe(false);
    expect(canAssignRefereesToEvent("panitia", MAKASSAR, ownApproved)).toBe(false);
    expect(canAccessAssignRefereesForEvent("panitia", MAKASSAR, ownApproved)).toBe(false);

    expect(canEditEvent("panitia", "panitia-1", MAKASSAR, ownPending)).toBe(true);
    expect(canEditEvent("panitia", "panitia-1", MAKASSAR, ownApproved)).toBe(false);
    expect(canEditEvent("panitia", "panitia-1", MAKASSAR, otherPending)).toBe(false);
    expect(getInitialEventStatusForRole("panitia")).toBe("DIAJUKAN");
  });
});