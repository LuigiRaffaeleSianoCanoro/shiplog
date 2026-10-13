import { describe, expect, it } from "vitest";
process.env.ORIGIN_APP_ID = "app_test";
const { installUrl } = await import("@/lib/install");
describe("install URL", () => {
  it("requests contents + PR scopes with client_id, redirect, state, include_granted_scopes", () => {
    const u = new URL(installUrl("https://x.test", "s1"));
    expect(u.origin + u.pathname).toBe("https://cursor.com/codebase/apps/install");
    expect(u.searchParams.get("client_id")).toBe("app_test");
    expect(u.searchParams.get("scope")!.split(" ")).toEqual(expect.arrayContaining(["repository:contents:read", "repository:contents:write", "repository:pull_requests:reviews:write"]));
    expect(u.searchParams.get("redirect_uri")).toBe("https://x.test/api/install/callback");
    expect(u.searchParams.get("state")).toBe("s1");
    expect(u.searchParams.get("include_granted_scopes")).toBe("true");
  });
});
