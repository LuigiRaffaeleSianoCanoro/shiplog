export const AnalyticsEvents = {
  installationCreated: "installation_created",
  installationDeleted: "installation_deleted",
  changelogGenerated: "changelog_generated",
  changelogPublished: "changelog_published",
  publicChangelogViewed: "public_changelog_viewed",
  feedRead: "feed_read",
  apiRead: "api_read",
  cronRun: "cron_run",
} as const;

export type AnalyticsEventName = (typeof AnalyticsEvents)[keyof typeof AnalyticsEvents];
