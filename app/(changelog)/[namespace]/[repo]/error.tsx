"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

/** Shown when the changelog can't be read (storage outage or any render failure). Next answers 500, never a cached 200. */
export default function ChangelogError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // reset() alone re-renders the payload the browser already has; refresh() asks the server again.
  const retry = () => startTransition(() => { router.refresh(); reset(); });
  return (
    <>
      <header className="ch-header">
        <Link href="/" className="ch-brand">
          <img src="/brand/logo-mono-white.svg" alt="" width={22} height={22} />
          Shiplog
        </Link>
      </header>
      <main className="ch-wrap">
        <h1 className="ch-title">Changelog temporarily unavailable</h1>
        <p className="ch-sub">We can't read this changelog right now. Please try again in a few minutes.</p>
        <p className="ch-sub">If you run this site, check that the Vercel Blob store is still connected to the project.</p>
        <button type="button" className="ch-retry" onClick={retry} disabled={pending}>
          {pending ? "Trying again…" : "Try again"}
        </button>
      </main>
    </>
  );
}
