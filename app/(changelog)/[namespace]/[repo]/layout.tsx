import { Inter, Oswald } from "next/font/google";
import "./changelog.css";

const display = Oswald({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-changelog-display" });
const body = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-changelog-body" });

export default function ChangelogLayout({ children }: { children: React.ReactNode }) {
  return <div className={`changelog-root ${display.variable} ${body.variable}`}>{children}</div>;
}
