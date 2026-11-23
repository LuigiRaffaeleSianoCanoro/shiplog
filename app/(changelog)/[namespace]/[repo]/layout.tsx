import "./changelog.css";

/** Fonts come from root `app/layout.tsx` (`--font-display`, `--font-manrope`) — no second Google fetch. */
export default function ChangelogLayout({ children }: { children: React.ReactNode }) {
  return <div className="changelog-root">{children}</div>;
}
