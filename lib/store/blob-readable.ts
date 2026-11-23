import { get, list } from "@vercel/blob";

const PREFIX = "shiplog/v1/";
const TIMEOUT_MS = 2000;
const CACHE_MS = 60_000;

let cached: { at: number; readable: boolean } | null = null;

/** Public pages fail on get(), not list(), so the probe reads one listed blob. */
async function probe(): Promise<void> {
  const { blobs } = await list({ prefix: PREFIX, limit: 1 });
  const first = blobs[0];
  if (!first) return;
  const r = await get(first.pathname, { access: "private", useCache: false });
  await r?.stream?.cancel();
}

export async function isVercelBlobReadable(): Promise<boolean> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS) return cached.readable;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      probe(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("blob probe timeout")), TIMEOUT_MS);
      }),
    ]);
    cached = { at: now, readable: true };
  } catch {
    cached = { at: now, readable: false };
  } finally {
    clearTimeout(timer);
  }
  return cached.readable;
}
