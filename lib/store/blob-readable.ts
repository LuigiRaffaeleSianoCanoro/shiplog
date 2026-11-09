import { list } from "@vercel/blob";

const PREFIX = "shiplog/v1/";
const TIMEOUT_MS = 2000;
const CACHE_MS = 60_000;

let cached: { at: number; readable: boolean } | null = null;

export async function isVercelBlobReadable(): Promise<boolean> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS) return cached.readable;
  try {
    await Promise.race([
      list({ prefix: PREFIX, limit: 1 }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("blob list timeout")), TIMEOUT_MS);
      }),
    ]);
    cached = { at: now, readable: true };
    return true;
  } catch {
    cached = { at: now, readable: false };
    return false;
  }
}
