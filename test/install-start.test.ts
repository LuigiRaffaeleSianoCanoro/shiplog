import { describe, expect, it } from "vitest";
process.env.ORIGIN_APP_ID = "app_test";
process.env.SHIPLOG_INSTALL_ORIGIN = "https://reg.test/";
const { GET } = await import("@/app/api/install/start/route");
describe("install start canonical host", () => {
  it("bounces other hosts to the registered install origin", () => {
    const r = GET(new Request("https://shiplog.help/api/install/start"));
    expect(r.status).toBe(307);
    expect(r.headers.get("location")).toBe("https://reg.test/api/install/start");
  });
  it("on the registered host, redirect_uri uses that host and sets state", () => {
    const r = GET(new Request("https://reg.test/api/install/start"));
    const u = new URL(r.headers.get("location")!);
    expect(u.searchParams.get("redirect_uri")).toBe("https://reg.test/api/install/callback");
    expect(r.headers.get("set-cookie")).toContain("shiplog_state=" + u.searchParams.get("state"));
  });
});
