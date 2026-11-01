import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/*/.git", "/*/.env", "/*/wp-", "/*.php"],
    },
    sitemap: undefined,
  };
}
