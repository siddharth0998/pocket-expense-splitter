import type { MetadataRoute } from "next";

const SITE_URL = "https://splitvero.com";

const routes = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/free-expense-splitter", changeFrequency: "weekly", priority: 0.8 },
  { path: "/roommate-expense-splitter", changeFrequency: "weekly", priority: 0.8 },
  { path: "/trip-expense-splitter", changeFrequency: "weekly", priority: 0.8 },
  { path: "/split-rent-calculator", changeFrequency: "weekly", priority: 0.8 },
  { path: "/unequal-expense-splitter", changeFrequency: "weekly", priority: 0.8 },
  { path: "/split-bills-with-friends", changeFrequency: "weekly", priority: 0.8 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map((route) => ({
    url: `${SITE_URL}${route.path === "/" ? "" : route.path}`,
    lastModified: new Date("2026-06-23"),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
