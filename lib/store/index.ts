import { env } from "../env";
import { BlobStore } from "./blob";
import { MemoryStore } from "./memory";
import { SupabaseStore } from "./supabase";
import type { Store } from "./types";

let store: Store | null = null;

function memoryStorePath(): string {
  return process.env.SHIPLOG_DATA_FILE ?? ".data/shiplog.json";
}

/** Production: Vercel Blob (private). Optional: Supabase. Dev/test only: local JSON file. */
export function getStore(): Store {
  if (store instanceof MemoryStore && store.filePath() !== memoryStorePath()) {
    store = null;
  }
  if (store) return store;
  if (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) store = new BlobStore();
  else if (env.supabaseUrl && env.supabaseServiceKey) store = new SupabaseStore(env.supabaseUrl, env.supabaseServiceKey);
  else if (process.env.VERCEL) throw new Error("No persistent store configured (connect the Vercel Blob store)");
  else store = new MemoryStore(memoryStorePath());
  return store;
}
export function setStore(s: Store) { store = s; }
export type * from "./types";
