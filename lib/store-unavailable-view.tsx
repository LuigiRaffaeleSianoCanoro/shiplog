import Link from "next/link";

export function StoreUnavailableView() {
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
        <p className="ch-sub">
          We cannot read changelog storage right now. Please try again in a few minutes.
        </p>
        <p className="ch-sub">
          If you operate this site, check that the Vercel Blob store is connected to this project.
        </p>
      </main>
    </>
  );
}
