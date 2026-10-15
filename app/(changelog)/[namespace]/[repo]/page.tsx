import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SECTIONS } from "@/lib/changelog";
import { buildPublicMeta, publicPageTitle, resolvePublicChangelog } from "@/lib/public-changelog";
import { requestOrigin } from "@/lib/request-origin";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ namespace: string; repo: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { namespace, repo } = await params;
  const data = await resolvePublicChangelog(namespace, repo, getStore());
  if (!data) return { title: "Not found" };
  const title = publicPageTitle(namespace, repo);
  const origin = await requestOrigin();
  const pageUrl = buildPublicMeta(origin, namespace, repo).pageUrl;
  return {
    title,
    description: `Public changelog for ${data.repoSlug}`,
    alternates: {
      types: {
        "application/rss+xml": `${pageUrl}/feed.xml`,
        "application/json": `${pageUrl}/feed.json`,
      },
    },
  };
}

export default async function PublicChangelogPage({ params }: Props) {
  const { namespace, repo } = await params;
  const data = await resolvePublicChangelog(namespace, repo, getStore());
  if (!data) notFound();
  const origin = await requestOrigin();
  const pageUrl = buildPublicMeta(origin, namespace, repo).pageUrl;
  const releases = data.document.releases.filter(
    (r) => r.version !== "Unreleased" || SECTIONS.some((s) => r.sections[s].length),
  );

  return (
    <>
      <header className="ch-header">
        <Link href="/" className="ch-brand">
          <img src="/brand/logo-mono-white.svg" alt="" width={22} height={22} />
          Shiplog
        </Link>
        <nav className="ch-nav" aria-label="Feeds">
          <Link href={`${pageUrl}/feed.xml`}>RSS</Link>
          <Link href={`${pageUrl}/feed.json`}>JSON</Link>
        </nav>
      </header>
      <main className="ch-wrap">
        <h1 className="ch-title">{repo}</h1>
        <p className="ch-sub">{namespace}/{repo}</p>
        {releases.length === 0 ? (
          <p className="ch-sub">No releases yet. Merges will show up here once Shiplog writes the changelog.</p>
        ) : (
          releases.map((rel) => (
            <article className="ch-release" key={rel.version}>
              <h2>{rel.version === "Unreleased" ? "Unreleased" : `v${rel.version}`}</h2>
              {rel.date ? <p className="ch-date">{rel.date}</p> : null}
              {rel.summary ? <p className="ch-summary">{rel.summary}</p> : null}
              {SECTIONS.map((section) =>
                rel.sections[section].length ? (
                  <div key={section}>
                    <h3>{section}</h3>
                    <ul>
                      {rel.sections[section].map((bullet) => (
                        <li key={bullet}>{bullet}</li>
                      ))}
                    </ul>
                  </div>
                ) : null,
              )}
            </article>
          ))
        )}
        <Link href="/" className="ch-badge">
          Powered by <strong>Shiplog</strong>
        </Link>
      </main>
    </>
  );
}
