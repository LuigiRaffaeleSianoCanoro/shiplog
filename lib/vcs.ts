import { getStore } from "./store";
import type { InstallProvider } from "./store/types";
import {
  commentOnPr as originCommentOnPr,
  commitChangelogFile as originCommitChangelogFile,
  getInstallationInfo as originGetInstallationInfo,
  getRepoFile as originGetRepoFile,
  listInstallationRepos as originListInstallationRepos,
  listMergedPullRequests as originListMergedPullRequests,
  listPrComments as originListPrComments,
  listPrFiles as originListPrFiles,
  listSemverTags as originListSemverTags,
  originConfigured,
  repoPermission as originRepoPermission,
  type InstallationInfo,
  type PrComment,
} from "./origin";
import {
  githubCommentOnPr,
  githubCommitChangelogFile,
  githubConfigured,
  githubGetRepoFile,
  githubListInstallationRepos,
  githubListMergedPullRequests,
  githubListPrComments,
  githubListPrFiles,
  githubListSemverTags,
  githubRepoPermission,
} from "./github-api";
import { getGithubInstallationInfo } from "./github";
import type { HistoricalPr, HistoricalTag } from "./history";

export async function installProvider(installationId: string): Promise<InstallProvider> {
  return (await getStore().getInstallation(installationId))?.provider ?? "origin";
}

/** Whether server credentials exist for the installation's ingress provider. */
export function vcsConfigured(provider: InstallProvider): boolean {
  return provider === "github" ? githubConfigured() : originConfigured();
}

export async function getInstallationInfo(installationId: string, provider?: InstallProvider): Promise<InstallationInfo> {
  const p = provider ?? (await installProvider(installationId));
  if (p === "github") {
    const info = await getGithubInstallationInfo(installationId);
    return { installerId: info.installerId, namespace: info.namespace, namespaceType: info.namespaceType };
  }
  return originGetInstallationInfo(installationId);
}

export async function repoPermission(
  installationId: string,
  repo: string,
  userId: string,
  login?: string,
): Promise<string | null> {
  const p = await installProvider(installationId);
  if (p === "github") return githubRepoPermission(installationId, repo, userId, login);
  return originRepoPermission(installationId, repo, userId);
}

export async function commentOnPr(installationId: string, repo: string, prNumber: string, body: string) {
  const p = await installProvider(installationId);
  if (p === "github") return githubCommentOnPr(installationId, repo, prNumber, body);
  return originCommentOnPr(installationId, repo, prNumber, body);
}

export async function getRepoFile(installationId: string, repo: string, path: string): Promise<string | null> {
  const p = await installProvider(installationId);
  if (p === "github") return githubGetRepoFile(installationId, repo, path);
  return originGetRepoFile(installationId, repo, path);
}

export async function listPrFiles(installationId: string, repo: string, prNumber: string): Promise<string[]> {
  const p = await installProvider(installationId);
  if (p === "github") return githubListPrFiles(installationId, repo, prNumber);
  return originListPrFiles(installationId, repo, prNumber);
}

export async function listPrComments(installationId: string, repo: string, prNumber: string): Promise<PrComment[]> {
  const p = await installProvider(installationId);
  if (p === "github") return githubListPrComments(installationId, repo, prNumber);
  return originListPrComments(installationId, repo, prNumber);
}

export async function listInstallationRepos(installationId: string): Promise<string[]> {
  const p = await installProvider(installationId);
  if (p === "github") return githubListInstallationRepos(installationId);
  return originListInstallationRepos(installationId);
}

export async function listMergedPullRequests(installationId: string, repo: string, max?: number): Promise<HistoricalPr[]> {
  const p = await installProvider(installationId);
  if (p === "github") return githubListMergedPullRequests(installationId, repo, max);
  return originListMergedPullRequests(installationId, repo, max);
}

export async function listSemverTags(installationId: string, repo: string, maxTags?: number): Promise<HistoricalTag[]> {
  const p = await installProvider(installationId);
  if (p === "github") return githubListSemverTags(installationId, repo, maxTags);
  return originListSemverTags(installationId, repo, maxTags);
}

export async function commitChangelogFile(installationId: string, repo: string, path: string, content: string, message: string) {
  const p = await installProvider(installationId);
  if (p === "github") return githubCommitChangelogFile(installationId, repo, path, content, message);
  return originCommitChangelogFile(installationId, repo, path, content, message);
}

/** Label for outbox / dashboard when a comment was delivered to the provider API. */
export async function vcsDeliveryLabel(installationId: string): Promise<string> {
  return (await installProvider(installationId)) === "github" ? "GitHub" : "Origin";
}
