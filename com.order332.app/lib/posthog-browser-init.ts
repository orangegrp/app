/** Options merged into `posthog.init` (second argument). */
export function getPostHogBrowserInitOptions() {
  return {
    api_host: "/ingest",
    ui_host: "https://eu.posthog.com",
    defaults: "2026-01-30" as const,
    capture_exceptions: true,
    debug: process.env.NODE_ENV === "development",
  }
}
