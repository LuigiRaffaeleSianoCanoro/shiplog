export class StoreAuthError extends Error {
  readonly code = "store_unavailable" as const;

  constructor(readonly pathnamePrefix: string) {
    super("Vercel Blob store is not readable with the configured credentials");
    this.name = "StoreAuthError";
  }
}

export function isStoreAuthError(err: unknown): err is StoreAuthError {
  return err instanceof StoreAuthError;
}
