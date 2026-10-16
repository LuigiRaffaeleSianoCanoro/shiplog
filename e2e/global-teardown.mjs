import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));

import { execSync } from "node:child_process";

function killPid(pid) {
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

function killPort(port) {
  try {
    execSync(`fuser -k ${port}/tcp`, { stdio: "ignore" });
  } catch {
    /* ignore */
  }
  try {
    const out = execSync(`lsof -ti:${port} 2>/dev/null || true`, { encoding: "utf8" }).trim();
    for (const pid of out.split(/\s+/).filter(Boolean)) killPid(Number(pid));
  } catch {
    /* ignore */
  }
}

export default async function globalTeardown() {
  try {
    const { mockPid, appPid, mockPort, appPort } = JSON.parse(readFileSync(join(__dir, ".runtime/pids.json"), "utf8"));
    killPid(mockPid);
    killPid(appPid);
    if (mockPort) killPort(mockPort);
    if (appPort) killPort(appPort);
  } catch {
    /* no pid file */
  }
}
