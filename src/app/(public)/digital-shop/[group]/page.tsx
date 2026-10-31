import { notFound } from "next/navigation";
import { Metadata } from "next";
import { getDigitalGroup } from "@/lib/services/digitalShopService";
import { DigitalTopUpClient } from "@/components/public/DigitalTopUpClient";

interface PageProps {
  params: Promise<{ group: string }>;
  searchParams: Promise<{ product?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { group: groupParam } = await params;
  const group = await getDigitalGroup(groupParam);

  if (!group) {
    return {
      title: "Digital Product Not Found | SakSuuu",
    };
  }

  return {
    title: `${group.khmerName || group.name} — ទិញភ្លាមៗ 24/7 | SakSuuu Digital Shop`,
    description: group.description,
  };
}

export const dynamic = "force-dynamic";

export default async function DigitalGroupPage({ params, searchParams }: PageProps) {
  const { group: groupParam } = await params;
  const { product: initialProductCode } = await searchParams;
  const group = await getDigitalGroup(groupParam);

  if (!group) {
    notFound();
  }

  return <DigitalTopUpClient group={group} initialProductCode={initialProductCode} />;
}
