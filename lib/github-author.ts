export type GhUser = { login?: string; id?: number | string; type?: string } | null | undefined;

/** Origin-shaped author so `exclude.authors` works on GitHub too: Bot accounts become apps ("dependabot[bot]" becomes "dependabot"). */
export function prAuthor(u: GhUser) {
  const login = u?.login ?? "";
  if (!login) return undefined;
  if (u?.type === "Bot") return { app: { slug: login.replace(/\[bot\]$/i, "") } };
  return { user: { id: String(u?.id ?? ""), username: login } };
}
