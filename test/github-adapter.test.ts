import { describe, expect, it } from "vitest";
import { githubToEnvelope } from "@/lib/github-adapter";

const repo = { name: "demo", owner: { login: "acme" } };

describe("GitHub webhook adapter", () => {
  it("maps merged pull_request to pull_request.merged", () => {
    const env = githubToEnvelope("pull_request", {
      action: "closed",
      installation: { id: 42 },
      repository: repo,
      pull_request: { merged: true, number: 7, title: "feat: x", body: "", html_url: "https://github.com/acme/demo/pull/7" },
    });
    expect(env?.installationId).toBe("42");
    expect(env?.event.type).toBe("pull_request.merged");
    expect(env?.event.payload.pullRequest.number).toBe("7");
    expect(env?.event.payload.pullRequest.repository.owner.slug).toBe("acme");
  });

  it("maps tag push to repository.pushed", () => {
    const env = githubToEnvelope("push", {
      installation: { id: 9 },
      repository: repo,
      ref: "refs/tags/v1.2.3",
      before: "0".repeat(40),
      after: "a".repeat(40),
      created: true,
    });
    expect(env?.event.type).toBe("repository.pushed");
    expect(env?.event.payload.refUpdates[0].ref).toBe("refs/tags/v1.2.3");
  });

  it("maps issue_comment on a PR to pull_request.comment.created", () => {
    const env = githubToEnvelope("issue_comment", {
      installation: { id: 1 },
      repository: repo,
      issue: { number: 5, pull_request: {} },
      comment: { body: "/shiplog skip", user: { id: 99 } },
    });
    expect(env?.event.type).toBe("pull_request.comment.created");
    expect(env?.event.payload.comment.body).toContain("/shiplog");
  });

  it("maps installation deleted", () => {
    const env = githubToEnvelope("installation", {
      action: "deleted",
      installation: { id: 55, account: { login: "acme" } },
    });
    expect(env?.event.type).toBe("installation.deleted");
  });

  it("ignores ping", () => {
    expect(githubToEnvelope("ping", {})).toBeNull();
  });
});
