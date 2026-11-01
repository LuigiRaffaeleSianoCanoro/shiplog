import type { Instrumentation } from "next";

export async function register(): Promise<void> {
  // Server-side analytics is initialized lazily in lib/analytics/server.ts.
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const err = error instanceof Error ? error : new Error(String(error));
  const { captureServerException, flushServerAnalytics } = await import("@/lib/analytics/server");
  await captureServerException(err, {
    route: context.routePath,
    method: request.method,
    path: request.path,
  });
  await flushServerAnalytics();
};
