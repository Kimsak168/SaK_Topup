"use client";

import { memo } from "react";
import Link from "next/link";
import Image from "next/image";
import type { DigitalProduct } from "@/lib/services/digitalShopService";

export const DigitalProductCard = memo(function DigitalProductCard({
  product,
}: {
  product: DigitalProduct;
}) {
  const href = `/digital-shop/${product.groupCode}?product=${encodeURIComponent(product.product_code)}`;

  return (
    <Link
      href={href}
      prefetch={false}
      aria-label={`Buy ${product.name}`}
      title={product.name}
      className="game-card group relative flex h-full min-w-0 flex-col overflow-hidden rounded-[14px] border-0 bg-white outline-none transition-[translate,box-shadow] duration-200 ease-out focus-visible:ring-2 focus-visible:ring-[#C084FC] focus-visible:ring-offset-2 motion-safe:pointer-fine:hover:-translate-y-[2px] motion-reduce:transition-none sm:rounded-[16px]"
    >
      <div className="relative aspect-square w-full shrink-0 overflow-hidden bg-[#0D0916]">
        <Image
          src={product.image}
          alt={product.name}
          fill
          sizes="(max-width: 339px) 50vw, (max-width: 767px) 33vw, (max-width: 1023px) 25vw, (max-width: 1599px) 20vw, 280px"
          loading="lazy"
          className="game-card-image relative z-10 object-cover object-center transition-[scale,opacity] duration-300 ease-out motion-safe:pointer-fine:group-hover:scale-[1.03] motion-reduce:transition-none"
        />
        <span className="absolute top-2 right-2 z-20 rounded-md bg-gradient-to-r from-purple-600 to-indigo-600 px-1.5 py-0.5 text-[9px] sm:text-[10px] font-bold text-white shadow-md backdrop-blur-sm">
          ${product.price.toFixed(2)}
        </span>
        {product.stock && (
          <span className="absolute bottom-2 left-2 z-20 rounded bg-slate-950/80 px-1.5 py-0.5 text-[9px] font-medium text-emerald-400 backdrop-blur-sm border border-emerald-500/20">
            {product.stock}
          </span>
        )}
      </div>

      <div className="game-card-title flex min-h-14 min-w-0 shrink-0 flex-col items-center justify-center gap-1 bg-white px-2 py-1.5 sm:min-h-[68px] sm:px-3">
        <h3 className="line-clamp-1 w-full min-w-0 text-center text-[12px] leading-4 font-semibold wrap-anywhere text-[#172033] sm:text-[14px] sm:leading-5">
          {product.name}
        </h3>
        <span className="game-card-cta">
          ${product.price.toFixed(2)} · ទិញភ្លាមៗ{" "}
          <span aria-hidden="true">→</span>
        </span>
      </div>
    </Link>
  );
});
