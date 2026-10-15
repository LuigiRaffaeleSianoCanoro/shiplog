import Link from "next/link";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="top">
        <Link href="/" className="brand"><img src="/logo.svg" alt="" width={28} height={28} />SHIPLOG</Link>
        <nav><Link href="/setup" className="hide-sm">Setup</Link><Link href="/dashboard">Dashboard</Link><Link href="/privacy" className="hide-sm">Privacy</Link><a className="btn primary sm" href="/api/install/start">Install on Origin</a></nav>
      </header>
      {children}
    </>
  );
}
