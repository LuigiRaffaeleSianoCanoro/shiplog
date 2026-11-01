import "server-only";

import { PostHog } from "posthog-node";
import { AnalyticsEvents } from "./events";

export interface AnalyticsSink {
  capture: (event: string, properties?: Record<string, unknown>) => void;
  captureException: (error: Error, properties?: Record<string, unknown>) => void;
  flush: () => Promise<void>;
  shutdown: () => Promise<void>;
}

let client: PostHog | null | undefined;
let testSink: AnalyticsSink | null = null;

function posthogHost(): string {
  return (process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com").replace(/\/+$/, "");
}

function posthogKey(): string {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";
  return key && !/^REPLACE/i.test(key) ? key : "";
}

export function setAnalyticsSinkForTests(sink: AnalyticsSink | null): void {
  testSink = sink;
}

export function resetAnalyticsForTests(): void {
  testSink = null;
  client = undefined;
}

function getClient(): PostHog | null {
  if (client !== undefined) return client;
  const key = posthogKey();
  if (!key) {
    client = null;
    return client;
  }
  client = new PostHog(key, {
    host: posthogHost(),
    flushAt: 1,
    flushInterval: 0,
  });
  return client;
}

function activeSink(): AnalyticsSink | null {
  if (testSink) return testSink;
  const ph = getClient();
  if (!ph) return null;
  return {
    capture: (event, properties) => ph.capture({ distinctId: serverDistinctId(properties), event, properties }),
    captureException: (error, properties) => {
      ph.captureException(error, serverDistinctId(properties), properties);
    },
    flush: () => ph.flush(),
    shutdown: () => ph.shutdown(),
  };
}

function serverDistinctId(properties?: Record<string, unknown>): string {
  const inst = properties?.installation_id;
  if (typeof inst === "string" && inst) return `installation:${inst}`;
  return "server";
}

export async function captureServerEvent(event: string, properties?: Record<string, unknown>): Promise<void> {
  const sink = activeSink();
  if (!sink) return;
  sink.capture(event, properties);
}

export async function captureServerException(error: Error, properties?: Record<string, unknown>): Promise<void> {
  const sink = activeSink();
  if (!sink) return;
  sink.captureException(error, properties);
}

export async function flushServerAnalytics(): Promise<void> {
  const sink = activeSink();
  if (!sink) return;
  await sink.flush();
}

export async function shutdownServerAnalytics(): Promise<void> {
  if (testSink) return;
  const ph = getClient();
  if (!ph) return;
  await ph.shutdown();
}

export { AnalyticsEvents };
