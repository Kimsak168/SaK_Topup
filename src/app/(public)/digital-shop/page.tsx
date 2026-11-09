import { Metadata } from "next";
import { getDigitalShopCatalogue } from "@/lib/services/digitalShopService";
import { DigitalShopStorefront } from "@/components/public/DigitalShopStorefront";
import { Sparkles, ShieldCheck, Zap, KeyRound } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

export const metadata: Metadata = {
  title: "កម្មវិធី & គណនីឌីជីថល (Digital Shop) — Canva, CapCut, ChatGPT | Asura Store",
  description:
    "ទិញគណនី Premium និង Software Digital ស្របច្បាប់ (Canva Pro, CapCut Pro, ChatGPT, Office 365, Spotify, VPN) តម្លៃធូរថ្លៃបំផុត ទទួលកូដភ្លាមៗ 24/7 តាម KHQR។",
};

export const revalidate = 180;

export default async function DigitalShopPage() {
  const { groups, allProducts, totalProducts } = await getDigitalShopCatalogue();

  return (
    <div className="min-h-screen py-8 sm:py-12 px-4 sm:px-6 max-w-6xl mx-auto space-y-10 sm:space-y-14">
      {/* 1. Hero Showcase Banner */}
      <section className="relative overflow-hidden rounded-3xl border border-purple-500/30 bg-gradient-to-br from-[#120B24] via-[#0E091A] to-[#0A0713] p-6 sm:p-10 shadow-2xl">
        <div className="pointer-events-none absolute -top-24 -left-24 size-72 rounded-full bg-purple-600/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-24 size-72 rounded-full bg-pink-600/20 blur-3xl" />

        <div className="relative z-10 max-w-2xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/15 border border-purple-400/30 text-purple-300 text-xs font-bold tracking-wide">
            <Sparkles className="size-3.5" />
            <span>ASURA DIGITAL ASSETS SHOP</span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight leading-tight">
            កម្មវិធី &amp; គណនីឌីជីថល (Digital Shop)
          </h1>

          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            ទិញគណនី Premium ស្របច្បាប់ — Canva Pro, CapCut Pro, ChatGPT, Microsoft 365, Spotify និង VPN ល្បឿនលឿន។ បង់ប្រាក់តាម KHQR ទទួលគណនី ឬ Invite ភ្លាមៗ 24/7!
          </p>

          <div className="pt-2 flex flex-wrap items-center gap-3 sm:gap-4 text-xs font-medium text-slate-300">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <Zap className="size-4" />
              <span>Instant Auto Delivery</span>
            </span>
            <span className="flex items-center gap-1.5 text-cyan-400">
              <ShieldCheck className="size-4" />
              <span>Full Warranty Guarantee</span>
            </span>
            <span className="flex items-center gap-1.5 text-amber-400">
              <KeyRound className="size-4" />
              <span>100% Genuine Licenses</span>
            </span>
          </div>
        </div>
      </section>

      {/* 2. Top Groups Quick Grid */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg sm:text-xl font-bold text-white">
            ប្រភេទពេញនិយម (Popular Categories)
          </h2>
          <span className="text-xs font-mono text-purple-400">
            {groups.length} Categories
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {groups.map((group) => (
            <Link
              key={group.id}
              href={`/digital-shop/${group.id}`}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60 p-4 transition-all hover:border-purple-500/50 hover:bg-slate-900/80 hover:shadow-lg hover:shadow-purple-500/10 flex flex-col justify-between gap-3"
            >
              <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-slate-900">
                <Image
                  src={group.image}
                  alt={group.name}
                  fill
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                />
                {group.badge && (
                  <span className="absolute top-2 right-2 rounded-md bg-purple-600/90 backdrop-blur-sm px-2 py-0.5 text-[10px] font-bold text-white shadow">
                    {group.badge}
                  </span>
                )}
              </div>

              <div>
                <h3 className="text-sm font-bold text-white group-hover:text-purple-300 transition-colors line-clamp-1">
                  {group.khmerName || group.name}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                  {group.productsCount} packages available
                </p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs font-bold text-purple-400 font-mono">
                    From ${group.minPrice.toFixed(2)}
                  </span>
                  <span className="text-[10px] font-semibold text-slate-400 group-hover:text-white transition-colors">
                    ជ្រើសរើស →
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* 3. Full Digital Products Catalogue Grid */}
      <DigitalShopStorefront products={allProducts} totalProducts={totalProducts} />
    </div>
  );
}
