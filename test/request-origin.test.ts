import { afterEach, describe, expect, it } from "vitest";
import { publicSiteOrigin } from "@/lib/request-origin";

const saved = { ...process.env };

afterEach(() => {
  process.env = { ...saved };
});

describe("publicSiteOrigin", () => {
  it("prefers SHIPLOG_INSTALL_ORIGIN", () => {
    process.env.SHIPLOG_INSTALL_ORIGIN = "https://shiplog.help/";
    expect(publicSiteOrigin()).toBe("https://shiplog.help");
  });

  it("uses preview host when install origin is unset", () => {
    delete process.env.SHIPLOG_INSTALL_ORIGIN;
    process.env.VERCEL_URL = "shiplog-preview.vercel.app";
    expect(publicSiteOrigin()).toBe("https://shiplog-preview.vercel.app");
  });

  it("falls back when no env is set", () => {
    delete process.env.SHIPLOG_INSTALL_ORIGIN;
    delete process.env.VERCEL_URL;
    expect(publicSiteOrigin("https://fallback.test")).toBe("https://fallback.test");
  });
});