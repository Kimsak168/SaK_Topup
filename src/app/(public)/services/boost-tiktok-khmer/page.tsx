import type { Metadata } from "next";
import KhmerSmmStorefront from "@/components/public/KhmerSmmStorefront";

export const metadata: Metadata = {
  title: "Boost TikTok Khmer | Asura Store",
  description: "Boost TikTok Khmer with curated likes, views, and followers packages for Khmer creators.",
};

export default function BoostTikTokKhmerPage() {
  return <KhmerSmmStorefront />;
}
