import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// One page, but a sitemap is what search engines look for first.
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: SITE_URL, changeFrequency: "hourly", priority: 1 }];
}
