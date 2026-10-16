import { describe, expect, it } from "vitest";
import { GITHUB_SPONSORS_URL } from "@/lib/sponsors";

describe("sponsors", () => {
  it("points at the maintainer GitHub Sponsors profile only", () => {
    expect(GITHUB_SPONSORS_URL).toBe("https://github.com/sponsors/LuigiRaffaeleSianoCanoro");
    expect(GITHUB_SPONSORS_URL).not.toContain("|");
  });
});
