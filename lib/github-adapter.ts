import type { Envelope } from "./jobs";

const instId = (body: { installation?: { id?: number | string } }) =>
  body.installation?.id != null ? String(body.installation.id) : "";

function ghRepo(repo: { name?: string; owner?: { login?: string } }) {
  const slug = repo.owner?.login ?? "";
  const name = repo.name ?? "";
  return { name, owner: { slug }, fullName: slug && name ? `${slug}/${name}` : undefined };
}

function ghPr(repo: ReturnType<typeof ghRepo>, pr: { number?: number; title?: string; body?: string | null; html_url?: string }) {
  return {
    number: String(pr.number ?? ""),
    title: pr.title ?? "",
    body: pr.body ?? "",
    webUrl: pr.html_url ?? "",
    repository: repo,
  };
}

/** Map a GitHub App webhook delivery into the shared Origin-shaped envelope for `handleEvent`. */
export function githubToEnvelope(event: string, body: any): Envelope | null {
  const installationId = instId(body);
  if (event === "ping") return null;

  if (event === "installation") {
    const actionMap: Record<string, string> = {
      created: "installation.created",
      deleted: "installation.deleted",
      suspend: "installation.suspended",
      unsuspend: "installation.unsuspended",
      new_permissions_accepted: "installation.updated",
    };
    const type = actionMap[body.action as string];
    if (!type || !installationId) return null;
    const login = body.installation?.account?.login ?? "";
    return {
      installationId,
      event: {
        type,
        payload: {
          installation: { account: { slug: login }, namespace: { slug: login } },
        },
      },
    };
  }

  if (!installationId) return null;
  const repo = ghRepo(body.repository ?? {});

  if (event === "pull_request" && body.action === "closed" && body.pull_request?.merged) {
    const pr = ghPr(repo, body.pull_request);
    return {
      installationId,
      event: { type: "pull_request.merged", payload: { pullRequest: pr, repository: repo } },
    };
  }

  if (event === "issue_comment" && body.issue?.pull_request) {
    return {
      installationId,
      event: {
        type: "pull_request.comment.created",
        payload: {
          pullRequest: { number: String(body.issue.number), repository: repo },
          comment: {
            body: body.comment?.body ?? "",
            author: {
              user: {
                id: String(body.comment?.user?.id ?? ""),
                login: body.comment?.user?.login ?? "",
                type: body.comment?.user?.type,
              },
            },
          },
        },
      },
    };
  }

  if (event === "pull_request_review_comment") {
    return {
      installationId,
      event: {
        type: "pull_request.comment.created",
        payload: {
          pullRequest: { number: String(body.pull_request?.number ?? ""), repository: repo },
          comment: {
            body: body.comment?.body ?? "",
            author: {
              user: {
                id: String(body.comment?.user?.id ?? ""),
                login: body.comment?.user?.login ?? "",
                type: body.comment?.user?.type,
              },
            },
          },
        },
      },
    };
  }

  if (event === "push" && typeof body.ref === "string" && body.ref.startsWith("refs/tags/")) {
    return {
      installationId,
      event: {
        type: "repository.pushed",
        payload: {
          repository: repo,
          refUpdates: [
            {
              ref: body.ref,
              before: body.before ?? "0".repeat(40),
              after: body.after ?? "a".repeat(40),
              created: body.created ?? true,
            },
          ],
        },
      },
    };
  }

  return null;
}
