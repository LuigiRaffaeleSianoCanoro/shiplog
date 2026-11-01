"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider, usePostHog } from "posthog-js/react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";

function posthogKey(): string {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";
  return key && !/^REPLACE/i.test(key) ? key : "";
}

let posthogInitialized = false;

function initPostHog(): void {
  if (typeof window === "undefined" || posthogInitialized) return;
  const key = posthogKey();
  if (!key) return;
  posthogInitialized = true;
  posthog.init(key, {
    api_host: "/ingest",
    ui_host: "https://us.posthog.com",
    person_profiles: "identified_only",
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: true,
    respect_dnt: true,
    disable_session_recording: true,
    loaded: (ph) => {
      ph.register({ app: "shiplog" });
    },
  });
}

function PostHogPageView(): null {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ph = usePostHog();

  useEffect(() => {
    if (!ph || !pathname) return;
    let url = window.origin + pathname;
    const q = searchParams?.toString();
    if (q) url += `?${q}`;
    ph.capture("$pageview", { $current_url: url });
  }, [pathname, searchParams, ph]);

  return null;
}

export function PostHogProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    initPostHog();
  }, []);

  const key = posthogKey();
  if (!key) return children;

  return (
    <PHProvider client={posthog}>
      <PostHogPageView />
      {children}
    </PHProvider>
  );
}
