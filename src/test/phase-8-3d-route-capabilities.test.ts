import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const assignRouteSource = readFileSync(`${root}/src/routes/events.$id.assign-referees.tsx`, "utf8");
const eventDetailSource = readFileSync(`${root}/src/routes/events.$id.index.tsx`, "utf8");

describe("F-001 assignment capability contract", () => {
  it("keeps the assignment route behind the existing admin guard", () => {
    const routeStart = assignRouteSource.indexOf('createFileRoute("/events/$id/assign-referees")');
    const routeBlock = assignRouteSource.slice(routeStart);

    expect(routeStart).toBeGreaterThanOrEqual(0);
    expect(routeBlock).toContain("requireAdmin");
  });

  it("does not expose the assignment CTA to non-admin event roles", () => {
    expect(eventDetailSource).toContain('const canAssignReferees = isAdmin() && event.status === "DISETUJUI";');
  });
});
