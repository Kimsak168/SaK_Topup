"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { AlertCircle, ArrowLeft, ArrowRight, Check, Loader2, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { AbaPayWayV2ModalData } from "@/components/public/AbaPayWayV2Modal";
import type { KhmerSmmProduct } from "@/lib/khmerSmmTypes";

const AbaPayWayV2Modal = dynamic(() => import("@/components/public/AbaPayWayV2Modal"), {
  loading: () => <div role="status" className="fixed inset-0 z-50 grid place-items-center bg-black/70 text-white">Preparing secure payment…</div>,
});

function isPublicProduct(value: unknown): value is KhmerSmmProduct {
  if (!value || typeof value !== "object") return false;
  const product = value as Record<string, unknown>;
  return typeof product.id === "string" && Boolean(product.id.trim()) &&
    typeof product.name === "string" && Boolean(product.name.trim()) &&
    typeof product.kind === "string" &&
    typeof product.quantity === "number" && Number.isSafeInteger(product.quantity) && product.quantity > 0 &&
    typeof product.customerPrice === "number" && Number.isFinite(product.customerPrice) && product.customerPrice > 0 &&
    product.currency === "USD";
}

function isValidTargetUrl(value: string) {
  try {
    const target = new URL(value.trim());
    const hostname = target.hostname.toLowerCase();
    const isTikTokHost = hostname === "tiktok.com" || hostname.endsWith(".tiktok.com");
    return ["https:", "http:"].includes(target.protocol) && isTikTokHost && value.trim().length <= 2048;
  } catch {
    return false;
  }
}

export default function KhmerSmmStorefront() {
  const router = useRouter();
  const [products, setProducts] = useState<KhmerSmmProduct[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [link, setLink] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"aba_payway_v2" | "khqr">("aba_payway_v2");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPayWayModalOpen, setIsPayWayModalOpen] = useState(false);
  const [payWayModalData, setPayWayModalData] = useState<AbaPayWayV2ModalData | null>(null);

  const loadProducts = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setLoadError(false);
    try {
      const response = await fetch("/api/smm-khmer/products", { cache: "no-store", signal });
      const data = await response.json();
      if (!response.ok || !data.success || data.currency !== "USD" || !Array.isArray(data.products)) {
        throw new Error(data.error || "TikTok Khmer packages are unavailable.");
      }
      const cleanProducts = data.products.filter(isPublicProduct) as KhmerSmmProduct[];
      if (cleanProducts.length !== data.products.length) throw new Error("The TikTok Khmer catalog returned an invalid product.");
      setProducts(cleanProducts);
      setSelectedId((current) => cleanProducts.some((product) => product.id === current) ? current : cleanProducts[0]?.id || "");
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setLoadError(true);
      toast.error(error instanceof Error ? error.message : "TikTok Khmer packages are unavailable.");
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadProducts(controller.signal);
    return () => controller.abort();
  }, [loadProducts]);

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedId) || null,
    [products, selectedId],
  );
  const validLink = isValidTargetUrl(link);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProduct) {
      toast.error("Choose a TikTok Khmer package.");
      return;
    }
    if (!validLink) {
      toast.error("Enter a valid public TikTok link.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/smm/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          catalog: "khmer",
          serviceId: selectedProduct.id,
          link: link.trim(),
          quantity: selectedProduct.quantity,
          paymentMethod,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Could not create the checkout.");

      if (paymentMethod === "aba_payway_v2" && data.qrData) {
        setPayWayModalData({
          orderNumber: data.orderNumber,
          transactionId: data.transactionId,
          amount: data.amount,
          currency: "USD",
          packageName: selectedProduct.name,
          gameName: "TikTok Khmer",
          paymentStatus: data.paymentStatus,
          merchantName: "SakSuuu Growth",
          qrString: data.qrData.qrString,
          qrImage: data.qrData.qrImage,
          qrPngUrl: data.qrData.qrPngUrl,
          deepLink: data.qrData.deepLink,
          payUrl: data.qrData.payUrl,
          expireInSec: data.qrData.expireInSec,
        });
        setIsPayWayModalOpen(true);
      } else if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        router.push(`/orders?orderNumber=${encodeURIComponent(data.orderNumber)}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the checkout.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen px-3 pb-28 pt-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <Link href="/services" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-violet-200 hover:text-white">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" /> All social services
        </Link>

        <section className="mb-8 rounded-3xl border border-violet-400/20 bg-gradient-to-br from-violet-950/60 via-slate-950/80 to-cyan-950/30 p-5 shadow-xl sm:p-8">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-300/20 bg-violet-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-violet-200">
            <Sparkles aria-hidden="true" className="h-3.5 w-3.5" /> TikTok Khmer packages
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">TikTok Khmer growth packages</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
            Choose a fixed package, add your public TikTok link, then pay through the usual checkout.
            Supplier fulfillment starts after payment is verified.
          </p>
          <div className="mt-5 inline-flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-200">
            <ShieldCheck aria-hidden="true" className="h-4 w-4" /> Secure customer checkout
          </div>
        </section>

        {isLoading ? (
          <div className="flex min-h-48 items-center justify-center gap-3 text-sm text-slate-300" role="status">
            <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" /> Loading curated products…
          </div>
        ) : loadError ? (
          <div className="rounded-2xl border border-rose-400/20 bg-rose-950/20 p-8 text-center">
            <AlertCircle aria-hidden="true" className="mx-auto h-9 w-9 text-rose-300" />
            <p className="mt-3 font-bold text-white">Products are temporarily unavailable</p>
            <button type="button" onClick={() => void loadProducts()} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10">
              <RefreshCw aria-hidden="true" className="h-4 w-4" /> Try again
            </button>
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-8 text-center text-slate-300">
            No curated products are available right now.
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
            <section aria-labelledby="khmer-products-title">
              <div className="mb-4 flex items-end justify-between gap-3">
                <div>
                  <h2 id="khmer-products-title" className="text-xl font-bold text-white">Choose a package</h2>
                  <p className="mt-1 text-xs text-slate-400">Fixed quantities · Prices in USD</p>
                </div>
                <span className="text-xs text-slate-400">{products.length} products</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {products.map((product) => {
                  const isSelected = product.id === selectedId;
                  return (
                    <button
                      key={product.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => setSelectedId(product.id)}
                      className={`rounded-2xl border p-4 text-left transition-colors ${isSelected ? "border-violet-400 bg-violet-950/40 ring-1 ring-violet-400/40" : "border-white/10 bg-slate-950/70 hover:border-white/25"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="rounded-full bg-cyan-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-cyan-200">{product.kind}</span>
                        <span className={`grid h-5 w-5 place-items-center rounded-full border ${isSelected ? "border-violet-300 bg-violet-400 text-slate-950" : "border-slate-600 text-transparent"}`}>
                          {isSelected && <Check aria-hidden="true" className="h-3.5 w-3.5" />}
                        </span>
                      </div>
                      <p className="mt-3 min-h-10 text-sm font-bold leading-5 text-white">{product.name}</p>
                      <div className="mt-4 flex items-end justify-between gap-3">
                        <span className="text-xs text-slate-400">{product.quantity.toLocaleString()} units</span>
                        <span className="text-xl font-black text-cyan-200">${product.customerPrice.toFixed(2)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <form onSubmit={handleSubmit} className="h-fit space-y-5 rounded-3xl border border-slate-800 bg-slate-950/90 p-5 shadow-2xl sm:p-6 lg:sticky lg:top-24">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h2 className="text-lg font-bold text-white">Order and payment</h2>
                <span className="text-[10px] font-bold uppercase tracking-wider text-violet-300">Secure checkout</span>
              </div>

              {selectedProduct ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">{selectedProduct.kind}</p>
                  <p className="mt-1 text-sm font-bold text-white">{selectedProduct.name}</p>
                  <div className="mt-3 flex justify-between text-xs text-slate-400">
                    <span>Fixed quantity</span><span className="font-mono text-white">{selectedProduct.quantity.toLocaleString()}</span>
                  </div>
                  <div className="mt-3 flex items-baseline justify-between border-t border-slate-800 pt-3">
                    <span className="text-xs font-semibold text-slate-300">Total</span>
                    <span className="text-2xl font-black text-violet-300">${selectedProduct.customerPrice.toFixed(2)} USD</span>
                  </div>
                </div>
              ) : null}

              <label className="block space-y-2">
                <span className="text-xs font-bold text-slate-200">Public TikTok link</span>
                <input
                  value={link}
                  onChange={(event) => setLink(event.target.value)}
                  type="url"
                  maxLength={2048}
                  placeholder="https://www.tiktok.com/@username/video/..."
                  required
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20"
                />
                <span className="block text-[11px] leading-5 text-slate-500">Use the public profile, post, or video URL that matches the selected package.</span>
              </label>

              <fieldset className="space-y-2">
                <legend className="mb-2 text-xs font-bold text-slate-200">Payment method</legend>
                {([
                  ["aba_payway_v2", "ABA PayWay KHQR"],
                  ["khqr", "KHQR checkout"],
                ] as const).map(([value, label]) => (
                  <label key={value} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 text-sm ${paymentMethod === value ? "border-violet-400/60 bg-violet-500/10 text-white" : "border-slate-800 bg-slate-900/60 text-slate-300"}`}>
                    <input type="radio" name="khmer-payment-method" value={value} checked={paymentMethod === value} onChange={() => setPaymentMethod(value)} className="accent-violet-400" />
                    <span>{label}</span>
                  </label>
                ))}
              </fieldset>

              <button
                type="submit"
                disabled={isSubmitting || !selectedProduct || !validLink}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500 to-cyan-500 px-4 py-4 text-sm font-black text-slate-950 shadow-lg shadow-violet-500/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500"
              >
                {isSubmitting ? <><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> Creating checkout…</> : <>Continue to payment <ArrowRight aria-hidden="true" className="h-4 w-4" /></>}
              </button>
              <p className="text-center text-[11px] leading-5 text-slate-500">The supplier receives the order only after payment is verified.</p>
            </form>
          </div>
        )}
      </div>

      {isPayWayModalOpen && <AbaPayWayV2Modal
        isOpen={isPayWayModalOpen}
        data={payWayModalData}
        onClose={() => setIsPayWayModalOpen(false)}
        onSuccess={({ orderNumber }) => {
          setIsPayWayModalOpen(false);
          toast.success("Payment verified! Your order is now being processed.");
          router.push(`/orders?orderNumber=${encodeURIComponent(orderNumber)}`);
        }}
      />}
    </div>
  );
}
