import Link from "next/link";
import { getCachedDigitalProducts } from "@/lib/services/digitalShopService";
import { DigitalProductCard } from "./DigitalProductCard";
import { ArrowRight, Sparkles } from "lucide-react";

export async function HomeDigitalShop() {
  const allProducts = await getCachedDigitalProducts().catch(() => []);
  if (!allProducts || allProducts.length === 0) return null;

  // Select popular in-stock products across categories to showcase on the homepage
  // Ensure diverse brand showcase: Canva, CapCut, ChatGPT, Spotify, Office, VPN, etc.
  const inStock = allProducts.filter((p) => p.available);
  const seenBrands = new Set<string>();
  const featured: typeof inStock = [];

  for (const p of inStock) {
    if (!seenBrands.has(p.productSlug)) {
      seenBrands.add(p.productSlug);
      featured.push(p);
      if (featured.length >= 10) break;
    }
  }

  // Fill up if fewer than 10 distinct brands found
  if (featured.length < 10) {
    for (const p of inStock) {
      if (!featured.some((f) => f.product_code === p.product_code)) {
        featured.push(p);
        if (featured.length >= 10) break;
      }
    }
  }

  return (
    <section
      id="digital-shop"
      className="mt-12 sm:mt-20 mb-8 sm:mb-12 scroll-mt-28 text-slate-100"
      aria-labelledby="home-digital-shop-title"
    >
      <div className="storefront-catalogue-heading mb-5 sm:mb-7 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300 text-[11px] font-bold uppercase tracking-wider mb-2">
            <Sparkles className="size-3" />
            <span>Digital Subscriptions &amp; Accounts</span>
          </div>
          <h2 id="home-digital-shop-title" className="text-xl sm:text-2xl font-bold text-white">
            កម្មវិធី &amp; គណនីឌីជីថល (Digital Shop)
          </h2>
          <p className="mt-1.5 text-xs sm:text-sm text-slate-400 leading-relaxed max-w-2xl">
            ទិញគណនី Canva Pro, CapCut, ChatGPT Plus, Microsoft 365, Spotify និង VPN តម្លៃធូរថ្លៃ ទទួលកូដភ្លាមៗ 24/7 តាម KHQR។
          </p>
        </div>

        <Link
          href="/digital-shop"
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-purple-400 hover:text-purple-300 transition-colors whitespace-nowrap self-start sm:self-end"
        >
          <span>មើលទាំងអស់ ({allProducts.length})</span>
          <ArrowRight className="size-4" />
        </Link>
      </div>

      <div className="storefront-grid">
        {featured.map((p) => (
          <DigitalProductCard key={p.product_code} product={p} />
        ))}
      </div>
    </section>
  );
}

