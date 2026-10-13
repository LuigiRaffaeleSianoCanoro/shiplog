import { env } from "../env";
import { MemoryStore } from "./memory";
import { SupabaseStore } from "./supabase";
import type { Store } from "./types";

let store: Store | null = null;
export function getStore(): Store {
  if (store) return store;
  store = env.supabaseUrl && env.supabaseServiceKey
    ? new SupabaseStore(env.supabaseUrl, env.supabaseServiceKey)
    : new MemoryStore(process.env.SHIPLOG_DATA_FILE ?? ".data/shiplog.json");
  return store;
}
export function setStore(s: Store) { store = s; }
export type * from "./types";
