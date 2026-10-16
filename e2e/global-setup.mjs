import { execSync, spawn } from "node:child_process";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const runtimeDir = join(__dir, ".runtime");
const mockPort = Number(process.env.E2E_MOCK_PORT ?? 4567);
const appPort = Number(process.env.E2E_APP_PORT ?? 3099);

function killPid(pid) {
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    /* gone */
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

function waitForUrl(url, ms = 120_000) {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const r = await fetch(url, { cache: "no-store" });
        if (r.ok || r.status === 404) {
          resolve();
          return;
        }
      } catch {
        /* retry */
      }
      if (Date.now() - t0 > ms) reject(new Error(`timeout waiting for ${url}`));
      else setTimeout(tick, 400);
    };
    tick();
  });
}

export default async function globalSetup() {
  try {
    const prev = JSON.parse(readFileSync(join(runtimeDir, "pids.json"), "utf8"));
    killPid(prev.mockPid);
    killPid(prev.appPid);
  } catch {
    /* fresh */
  }
  rmSync(runtimeDir, { recursive: true, force: true });
  mkdirSync(runtimeDir, { recursive: true });

  const origin = generateKeyPairSync("ed25519");
  const originJwk = { ...origin.publicKey.export({ format: "jwk" }), kid: "e2e-origin-1" };
  const originPrivateKeyPem = origin.privateKey.export({ format: "pem", type: "pkcs8" }).toString();

  const github = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const githubPrivateKeyPem = github.privateKey.export({ format: "pem", type: "pkcs8" }).toString();

  const encKey = randomBytes(32).toString("base64");
  const originAppId = "app_e2e";
  const githubAppId = "424242";
  const githubWebhookSecret = "e2e-github-webhook-secret";
  const cronSecret = "e2e-cron-secret";
  const dashboardToken = "e2e-dashboard-token";
  const installerUserId = "user_e2e_installer";

  writeFileSync(join(runtimeDir, "keys.json"), JSON.stringify({ originJwk, installerUserId }, null, 2));

  const mockUrl = `http://127.0.0.1:${mockPort}`;
  const baseUrl = `http://127.0.0.1:${appPort}`;
  const dataFile = join(runtimeDir, "shiplog.json");

  const appEnv = {
    NODE_ENV: "production",
    PORT: String(appPort),
    ORIGIN_APP_ID: originAppId,
    ORIGIN_APP_PRIVATE_KEY: originPrivateKeyPem,
    ORIGIN_JWKS_URL: `${mockUrl}/keys`,
    ORIGIN_API_BASE: `${mockUrl}/v1/origin`,
    GITHUB_APP_ID: githubAppId,
    GITHUB_APP_PRIVATE_KEY: githubPrivateKeyPem,
    GITHUB_WEBHOOK_SECRET: githubWebhookSecret,
    GITHUB_API_BASE: `${mockUrl}/github`,
    NEON_AI_GATEWAY_BASE_URL: `${mockUrl}/neon`,
    NEON_AI_GATEWAY_TOKEN: "e2e-neon-token",
    SHIPLOG_LLM_PROVIDER: "neon",
    SHIPLOG_BYOK_ENABLED: "false",
    SHIPLOG_KEY_ENC: encKey,
    SHIPLOG_DATA_FILE: dataFile,
    CRON_SECRET: cronSecret,
    SHIPLOG_DASHBOARD_TOKEN: dashboardToken,
    SHIPLOG_ALLOW_HTTP_NOTIFY: "true",
  };

  writeFileSync(
    join(runtimeDir, "config.json"),
    JSON.stringify(
      {
        baseUrl,
        mockUrl,
        originAppId,
        githubWebhookSecret,
        cronSecret,
        dashboardToken,
        installerUserId,
        originPrivateKeyPem,
        originJwk,
        appPort,
        mockPort,
      },
      null,
      2,
    ),
  );

  killPort(mockPort);
  killPort(appPort);

  const mockProc = spawn(process.execPath, [join(__dir, "mock-server.mjs")], {
    env: { ...process.env, E2E_MOCK_PORT: String(mockPort) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  mockProc.stderr?.on("data", (d) => process.stderr.write(d));
  await waitForUrl(`${mockUrl}/keys`);

  if (process.env.E2E_SKIP_BUILD !== "1") {
    execSync("npm run build", {
      cwd: join(__dir, ".."),
      env: { ...process.env, ...appEnv },
      stdio: "inherit",
    });
  }

  const appProc = spawn("npx", ["next", "start", "-p", String(appPort)], {
    cwd: join(__dir, ".."),
    env: { ...process.env, ...appEnv },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  let appReady = false;
  appProc.stderr?.on("data", (d) => {
    process.stderr.write(d);
    if (String(d).includes("Ready")) appReady = true;
  });
  appProc.stdout?.on("data", (d) => {
    process.stderr.write(d);
    if (String(d).includes("Ready")) appReady = true;
  });
  await waitForUrl(`${baseUrl}/api/health`);
  if (!appReady && appProc.exitCode != null) {
    throw new Error(`next start exited before ready (code ${appProc.exitCode})`);
  }

  writeFileSync(
    join(runtimeDir, "pids.json"),
    JSON.stringify({ mockPid: mockProc.pid, appPid: appProc.pid, mockPort, appPort }),
  );
}
