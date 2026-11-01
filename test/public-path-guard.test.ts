import { describe, expect, it } from "vitest";
import { publicPathShouldReject } from "@/lib/public-path-guard";

describe("publicPathShouldReject", () => {
  it("allows valid changelog paths", () => {
    expect(publicPathShouldReject("/acme/demo")).toBe(false);
    expect(publicPathShouldReject("/acme/demo/feed.xml")).toBe(false);
    expect(publicPathShouldReject("/api/v1/changelogs/acme/demo")).toBe(false);
  });

  it("rejects scanner probes before storage", () => {
    expect(publicPathShouldReject("/wp-admin/setup.php")).toBe(true);
    expect(publicPathShouldReject("/.git/config")).toBe(true);
    expect(publicPathShouldReject("/acme/.env")).toBe(true);
    expect(publicPathShouldReject("/foo/bar.php")).toBe(true);
  });

  it("rejects invalid slug segments", () => {
    expect(publicPathShouldReject("/../etc/passwd")).toBe(true);
    expect(publicPathShouldReject("/acme/../secret")).toBe(true);
  });
});
