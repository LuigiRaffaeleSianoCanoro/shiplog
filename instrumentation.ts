import type { Instrumentation } from "next";

export async function register(): Promise<void> {
  // Server analytics lives in lib/analytics (Node routes only).
}

function posthogKey(): string {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";
  return key && !/^REPLACE/i.test(key) ? key : "";
}

function posthogHost(): string {
  return (process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com").replace(/\/+$/, "");
}

/** Edge-safe exception capture (no posthog-node / axios — instrumentation shares the middleware worker graph on Vercel). */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const key = posthogKey();
  if (!key) return;
  const err = error instanceof Error ? error : new Error(String(error));
  try {
    await fetch(`${posthogHost()}/capture/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        event: "$exception",
        distinct_id: "server",
        properties: {
          $exception_message: err.message,
          $exception_type: err.name,
          route: context.routePath,
          method: request.method,
          path: request.path,
        },
      }),
    });
  } catch {
    /* analytics must never throw */
  }
};
