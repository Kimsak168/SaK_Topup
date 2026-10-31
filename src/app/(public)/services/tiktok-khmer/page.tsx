import type { Metadata } from "next";
import KhmerSmmStorefront from "@/components/public/KhmerSmmStorefront";

export const metadata: Metadata = {
  title: "TikTok Khmer Packages | SakSuuu",
  description: "Choose curated TikTok likes, views, and follower packages for Khmer creators.",
};

export default function TikTokKhmerPage() {
  return <KhmerSmmStorefront />;
}
