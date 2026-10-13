import type { Metadata } from "next";
import { Inter, Oswald } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const oswald = Oswald({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-oswald" });

export const metadata: Metadata = { title: "Shiplog — your merges, written up", description: "AI changelog and release notes for Cursor Origin." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${oswald.variable}`}>
      <body>
        <header className="top">
          <Link href="/" className="brand"><img src="/logo.svg" alt="" />SHIP<span className="lime">LOG</span></Link>
          <nav><Link href="/setup">Setup</Link><Link href="/dashboard">Dashboard</Link><Link href="/privacy">Privacy</Link></nav>
        </header>
        {children}
      </body>
    </html>
  );
}
