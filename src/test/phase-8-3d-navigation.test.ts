import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(`${process.cwd()}/src/components/layout/MobileNav.tsx`, "utf8");

describe("F-002 and F-003 mobile navigation contracts", () => {
  it("targets the registered export route", () => {
    expect(source).toContain('label: "Export Database", path: "/export"');
    expect(source).not.toContain("/database-export");
  });

  it("exposes approval navigation to admin roles and excludes it from Panitia primary nav", () => {
    expect(source).toContain('path: "/approvals"');
    expect(source).toContain("isPanitia");
    const panitiaNavStart = source.indexOf("const panitiaMainNavItems");
    const panitiaNavEnd = source.indexOf("const adminMainNavItems");
    const panitiaBranch = panitiaNavStart >= 0 && panitiaNavEnd > panitiaNavStart
      ? source.slice(panitiaNavStart, panitiaNavEnd)
      : "";
    expect(panitiaBranch).not.toContain('path: "/approvals"');
  });
});
