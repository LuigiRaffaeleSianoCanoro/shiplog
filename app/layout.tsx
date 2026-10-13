import type { Metadata } from "next";
import { Big_Shoulders, Manrope } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const display = Big_Shoulders({ subsets: ["latin"], weight: ["900"], variable: "--font-display" });
const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-manrope" });

export const metadata: Metadata = {
  metadataBase: new URL("https://shiplog-luigi-canoros-projects.vercel.app"),
  title: "Shiplog — your merges, written up",
  description: "AI changelog and release notes for Cursor Origin.",
  openGraph: { title: "Shiplog — your merges, written up", description: "AI changelog and release notes for Cursor Origin.", images: ["/og.png"] },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
};
export const viewport = { themeColor: "#13235A" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${manrope.variable}`}>
      <body>
        <header className="top">
          <Link href="/" className="brand"><img src="/logo.svg" alt="" width={28} height={28} />SHIPLOG</Link>
          <nav><Link href="/setup" className="hide-sm">Setup</Link><Link href="/dashboard">Dashboard</Link><Link href="/privacy" className="hide-sm">Privacy</Link><a className="btn primary sm" href="/api/install/start">Install on Origin</a></nav>
        </header>
        {children}
      </body>
    </html>
  );
}
