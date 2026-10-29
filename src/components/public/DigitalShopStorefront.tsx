"use client";

import { memo, useState, useMemo } from "react";
import type { DigitalProduct } from "@/lib/services/digitalShopService";
import { DigitalProductCard } from "./DigitalProductCard";

interface DigitalShopStorefrontProps {
  products: DigitalProduct[];
  totalProducts?: number;
}

const CATEGORY_TABS = [
  { id: "all", label: "ទាំងអស់ (All)" },
  { id: "chatgpt", label: "ChatGPT" },
  { id: "youtube", label: "YouTube" },
  { id: "capcut", label: "CapCut" },
  { id: "office", label: "Office 365" },
  { id: "canva", label: "Canva" },
  { id: "telegram", label: "Telegram" },
  { id: "utilities", label: "Other / ផ្សេងៗ" },
];

export const DigitalShopStorefront = memo(function DigitalShopStorefront({
  products,
  totalProducts = 0,
}: DigitalShopStorefrontProps) {
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    if (activeCategory === "all") return products;
    return products.filter((p) => p.groupCode === activeCategory);
  }, [products, activeCategory]);

  if (!products || products.length === 0) return null;

  return (
    <section
      id="digital-shop"
      aria-labelledby="digital-shop-title"
      className="mt-12 sm:mt-20 mb-14 sm:mb-24 scroll-mt-28"
    >
      <div className="storefront-catalogue-heading flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-4">
        <div>
          <h2
            id="digital-shop-title"
            className="text-xl sm:text-2xl font-bold tracking-tight text-white sm:text-3xl"
          >
            កម្មវិធី &amp; គណនីឌីជីថល (Digital Shop)
          </h2>
          <p className="mt-2 text-xs sm:text-sm text-slate-400 leading-relaxed">
            ទិញគណនី និងកម្មវិធី Digital (ChatGPT, YouTube Premium, CapCut, Office 365, Canva...) ទទួលកូដភ្លាមៗ 24/7។
          </p>
        </div>
        <span className="storefront-game-count flex-shrink-0 text-xs sm:text-sm text-slate-400 font-mono">
          {filteredProducts.length} / {totalProducts || products.length} មុខទំនិញ
        </span>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-3 mb-4 scrollbar-none">
        {CATEGORY_TABS.map((tab) => {
          const isActive = activeCategory === tab.id;
          const count =
            tab.id === "all"
              ? products.length
              : products.filter((p) => p.groupCode === tab.id).length;

          if (tab.id !== "all" && count === 0) return null;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveCategory(tab.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                isActive
                  ? "bg-purple-600 text-white shadow-md shadow-purple-600/30 ring-1 ring-purple-400"
                  : "bg-slate-900/80 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800"
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  isActive ? "bg-purple-700 text-purple-200" : "bg-slate-800 text-slate-400"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Products Grid */}
      <div className="storefront-grid">
        {filteredProducts.map((p) => (
          <DigitalProductCard key={p.product_code} product={p} />
        ))}
      </div>
    </section>
  );
});
