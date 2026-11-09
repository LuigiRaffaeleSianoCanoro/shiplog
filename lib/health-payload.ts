import { env } from "@/lib/env";
import { originConfigured } from "@/lib/origin";
import { isVercelBlobReadable } from "@/lib/store/blob-readable";

export type HealthStorage = "vercel-blob" | "supabase" | "memory";

export function healthStorageKind(): HealthStorage {
  if (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) return "vercel-blob";
  if (env.supabaseUrl) return "supabase";
  return "memory";
}

export async function buildHealthPayload() {
  const storage = healthStorageKind();
  let storageReadable = true;
  if (storage === "vercel-blob") storageReadable = await isVercelBlobReadable();
  const ok = storageReadable;
  return {
    status: ok ? 200 : 503,
    body: {
      ok,
      provider: env.llmProvider,
      byok: env.byokEnabled,
      origin: originConfigured(),
      storage,
      storageReadable,
    },
  };
}
