import type { Metadata } from "next";
import { Manrope, Oswald } from "next/font/google";
import "./globals.css";

const display = Oswald({ subsets: ["latin"], weight: ["700"], variable: "--font-display" });
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
      <body>{children}</body>
    </html>
  );
}
