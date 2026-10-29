import { Metadata } from "next";
import { getPublicSmmCatalog } from "@/lib/services/smmCatalogService";
import { PlatformTopUpClient } from "@/components/public/PlatformTopUpClient";

export const dynamic = "force-dynamic";

const PLATFORM_NAMES: Record<string, string> = {
  tiktok: "TikTok",
  telegram: "Telegram",
  facebook: "Facebook",
  instagram: "Instagram",
  youtube: "YouTube",
};

interface PlatformPageProps {
  params: Promise<{ platform: string }>;
}

export async function generateMetadata({ params }: PlatformPageProps): Promise<Metadata> {
  const { platform } = await params;
  const name = PLATFORM_NAMES[platform.toLowerCase()] || (platform.charAt(0).toUpperCase() + platform.slice(1));
  return {
    title: `Top Up ${name} Services — Followers, Likes & Views — SakSuuu`,
    description: `Browse ${name} engagement services, choose a package, and pay securely with KHQR checkout.`,
  };
}

export default async function PlatformServicePage({ params }: PlatformPageProps) {
  const { platform } = await params;
  const normPlatform = platform.toLowerCase();
  const platformName = PLATFORM_NAMES[normPlatform] || (normPlatform.charAt(0).toUpperCase() + normPlatform.slice(1));

  const catalogResult = await getPublicSmmCatalog({
    page: 1,
    limit: 250,
    platform: normPlatform,
    type: "all",
    category: "All",
    search: "",
    sort: "recommended",
  }).catch(() => null);

  const rawServices = catalogResult?.services || [];
  const services = rawServices
    .filter((s): s is typeof s & { min: number; max: number } =>
      typeof s.min === "number" && typeof s.max === "number" && s.min > 0 && s.max >= s.min
    )
    .map((s) => ({
      service: s.service,
      name: s.name,
      category: s.category,
      platform: s.platform,
      serviceType: s.serviceType,
      rate: s.rate,
      min: s.min,
      max: s.max,
      ...(typeof s.refill === "boolean" ? { refill: s.refill } : {}),
      ...(s.description ? { description: s.description } : {}),
    }));

  return (
    <PlatformTopUpClient
      platform={normPlatform}
      platformName={platformName}
      initialServices={services}
      catalogTotal={catalogResult?.total || services.length}
      categories={catalogResult?.categories || ["All"]}
    />
  );
}
