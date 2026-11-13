import type { MetadataRoute } from "next";
import { getClientGames } from "@/lib/services/gameService";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://www.asuratopup.store";
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/services`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/contact`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];

  try {
    const games = await getClientGames().catch(() => []);
    const gameRoutes: MetadataRoute.Sitemap = (games || []).map((game) => ({
      url: `${baseUrl}/games/${game.code}`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
    }));
    return [...staticRoutes, ...gameRoutes];
  } catch {
    return staticRoutes;
  }
}

