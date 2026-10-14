# Progress & decision log

## 2026-10-14 — Roadmap item 1: repo hygiene
- Decision: license Shiplog under Apache-2.0 (LICENSE added at repo root).
- Decision: ignore `*.tsbuildinfo` build artifacts via .gitignore.
- Note: PR targets `main`, which has no package.json yet; the `"license": "Apache-2.0"` field in package.json and untracking `tsconfig.tsbuildinfo` (`git rm --cached`) belong on `feat/mvp` and land with it.
- Self-merged with Luigi's approval after diff review and secret scan.
