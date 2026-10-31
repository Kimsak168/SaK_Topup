"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ShieldCheck,
  CheckCircle2,
  ArrowLeft,
  Check,
  Sparkles,
  Zap,
  Loader2,
  KeyRound,
  Lock,
} from "lucide-react";
import AbaPayWayV2Modal, { AbaPayWayV2ModalData } from "./AbaPayWayV2Modal";
import type { DigitalGroup, DigitalProduct } from "@/lib/services/digitalShopService";

interface DigitalTopUpClientProps {
  group: DigitalGroup;
  initialProductCode?: string;
}

export function DigitalTopUpClient({ group, initialProductCode }: DigitalTopUpClientProps) {
  const router = useRouter();

  const [selectedProductCode, setSelectedProductCode] = useState<string>(() => {
    if (initialProductCode && group.products.some((p) => p.product_code === initialProductCode)) {
      return initialProductCode;
    }
    const firstAvailable = group.products.find((p) => p.available);
    return firstAvailable ? firstAvailable.product_code : group.products[0]?.product_code || "";
  });
  const [contact, setContact] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<"aba_payway_v2">("aba_payway_v2");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // ABA PayWay Modal State
  const [isPayWayModalOpen, setIsPayWayModalOpen] = useState(false);
  const [payWayModalData, setPayWayModalData] = useState<AbaPayWayV2ModalData | null>(null);

  const selectedProduct = useMemo<DigitalProduct | undefined>(() => {
    return group.products.find((p) => p.product_code === selectedProductCode);
  }, [group.products, selectedProductCode]);

  const isContactValid = contact.trim().length >= 3;
  const totalPrice = selectedProduct ? selectedProduct.price : 0;

  const handleCheckout = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!selectedProduct) {
      toast.error("Please select a package");
      return;
    }

    if (!isContactValid) {
      toast.error("Please enter your Telegram username, email, or phone number", {
        description: "We need this to deliver your account or activation code.",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      toast.loading("Preparing your order...", { id: "checkout" });

      const res = await fetch("/api/digital-shop/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productCode: selectedProduct.product_code,
          contact: contact.trim(),
          paymentMethod,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to create order");
      }

      toast.dismiss("checkout");

      if (data.qrData) {
        setPayWayModalData({
          orderNumber: data.orderNumber,
          transactionId: data.transactionId,
          amount: data.amount,
          currency: "USD",
          packageName: selectedProduct.name,
          gameName: group.name,
          paymentStatus: "pending",
          merchantName: "SakSuuu Digital",
          qrString: data.qrData.qrString,
          qrImage: data.qrData.qrImage,
          qrPngUrl: data.qrData.qrPngUrl,
          deepLink: data.qrData.deepLink,
          payUrl: data.qrData.payUrl,
          expireInSec: data.qrData.expireInSec,
        });
        setIsPayWayModalOpen(true);
        toast.success("KHQR generated", {
          id: "checkout",
          description: "Scan with ABA Mobile or any banking app.",
        });
      } else {
        toast.success("Order created!", { description: `Order #${data.orderNumber}` });
        router.push(`/orders?orderNumber=${encodeURIComponent(data.orderNumber)}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error placing order";
      toast.error(msg, { id: "checkout" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full overflow-x-clip py-3 sm:py-8 text-white">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 relative z-10 space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between">
          <Link
            href="/#digital-shop"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-purple-400 hover:text-purple-300 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>ត្រឡប់ទៅកម្មវិធីទាំងអស់ (Back to Digital Shop)</span>
          </Link>
          <span className="text-xs text-slate-400 font-mono">
            {group.products.length} កញ្ចប់មានស្តុក
          </span>
        </div>

        {/* Hero Header Card */}
        <section className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-purple-500/20 bg-gradient-to-r from-[#140D26] via-[#100B1A] to-[#0A0713] p-4 sm:p-6 shadow-2xl backdrop-blur-xl">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6">
            <div className="relative w-20 h-20 sm:w-28 sm:h-28 shrink-0 rounded-2xl overflow-hidden border-2 border-purple-400/30 shadow-xl bg-slate-950">
              <Image
                src={group.image}
                alt={group.name}
                fill
                priority
                sizes="112px"
                className="object-cover"
              />
            </div>
            <div className="flex-1 text-center sm:text-left space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-400/10 border border-purple-400/30 text-purple-300 text-[11px] font-bold uppercase tracking-wider">
                <Sparkles className="w-3 h-3" />
                <span>Instant Digital Delivery</span>
              </div>
              <h1 className="text-xl sm:text-3xl font-black text-white tracking-tight">
                {group.khmerName || group.name}
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 max-w-2xl leading-relaxed">
                {group.description}
              </p>
              <div className="pt-1 flex flex-wrap items-center justify-center sm:justify-start gap-3 text-[11px] text-slate-300 font-medium">
                <span className="inline-flex items-center gap-1 text-emerald-400">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>24/7 Automated Dispatch</span>
                </span>
                <span className="inline-flex items-center gap-1 text-cyan-400">
                  <Zap className="w-3.5 h-3.5" />
                  <span>Instant Code / License</span>
                </span>
                <span className="inline-flex items-center gap-1 text-purple-300">
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Full Warranty Coverage</span>
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* 2-Column Responsive Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start">
          {/* Left Column: Top-Up Steps (8 Cols) */}
          <div className="min-w-0 lg:col-span-8 space-y-5">
            {/* STEP 1: Delivery Information */}
            <section className="topup-step rounded-[16px] bg-[#0E0918] border border-purple-500/20 p-4 sm:p-5 space-y-4 shadow-lg">
              <div className="topup-step-title flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-purple-600 text-white text-xs font-black">
                  1
                </span>
                <h2 className="text-sm sm:text-base font-bold text-white">
                  ព័ត៌មានសម្រាប់ទទួលកូដ ឬ គណនី (Delivery Info)
                </h2>
              </div>

              <div className="space-y-2">
                <label htmlFor="contact-input" className="block text-xs font-semibold text-slate-300">
                  Telegram Username, Email ឬ លេខទូរស័ព្ទ <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <input
                    id="contact-input"
                    type="text"
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    placeholder="e.g. @username, your@email.com ឬ 012345678"
                    className="w-full h-11 px-3.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 text-xs sm:text-sm focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400 font-mono transition-all"
                  />
                  {isContactValid && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  )}
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  យើងនឹងផ្ញើព័ត៌មានគណនី, License Key ឬ តំណភ្ជាប់ Invite ទៅកាន់គណនីនេះភ្លាមៗក្រោយបង់ប្រាក់។
                </p>
              </div>
            </section>

            {/* STEP 2: Choose Product Package */}
            <section className="topup-step rounded-[16px] bg-[#0E0918] border border-purple-500/20 p-4 sm:p-5 space-y-4 shadow-lg">
              <div className="topup-step-title flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-purple-600 text-white text-xs font-black">
                    2
                  </span>
                  <h2 className="text-sm sm:text-base font-bold text-white">
                    ជ្រើសរើសកញ្ចប់ទំនិញ (Select Package)
                  </h2>
                </div>
                <span className="text-xs text-purple-300 font-mono">
                  {group.products.length} Packages
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {group.products.map((p) => {
                  const isSelected = p.product_code === selectedProductCode;
                  return (
                    <button
                      key={p.product_code}
                      type="button"
                      onClick={() => setSelectedProductCode(p.product_code)}
                      className={`relative text-left p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                        isSelected
                          ? "bg-purple-950/40 border-purple-500 ring-1 ring-purple-500/50 shadow-lg shadow-purple-500/20"
                          : "bg-slate-950/80 border-slate-800/90 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="text-xs sm:text-sm font-bold text-white line-clamp-2">
                            {p.name}
                          </h3>
                          {p.description && (
                            <p className="mt-1 text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                              {p.description.split("\n")[0]}
                            </p>
                          )}
                        </div>
                        <div
                          className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                            isSelected
                              ? "bg-purple-500 border-purple-400 text-white"
                              : "border-slate-700 bg-slate-900"
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-xs">
                        <span className="text-[10px] text-emerald-400 font-medium">
                          {p.stock || "Instant Code"}
                        </span>
                        <span className="font-bold text-purple-300 font-mono text-sm">
                          ${p.price.toFixed(2)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* STEP 3: Payment Method */}
            <section className="topup-step rounded-[16px] bg-[#0E0918] border border-purple-500/20 p-4 sm:p-5 space-y-4 shadow-lg">
              <div className="topup-step-title flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-purple-600 text-white text-xs font-black">
                  3
                </span>
                <h2 className="text-sm sm:text-base font-bold text-white">
                  វិធីសាស្ត្រទូទាត់ (Payment Method)
                </h2>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div
                  className="p-3.5 min-h-[72px] rounded-xl border border-[#004B87] bg-[#004B87]/20 ring-1 ring-[#004B87] shadow-lg shadow-[#004B87]/20 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-[#004B87]">
                      <Image src="/images/aba-logo.png" alt="ABA" fill sizes="40px" className="object-cover" />
                    </div>
                    <div>
                      <span className="payment-method-title text-sm font-bold text-slate-900 dark:text-white block">KHQR</span>
                      <span className="text-[11px] text-slate-400">ABA Mobile &amp; All Cambodian Banks (KHQR)</span>
                    </div>
                  </div>
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#004B87] text-white">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                </div>
              </div>
            </section>
          </div>

          {/* Right Column: Order Summary (4 Cols, Sticky) */}
          <div className="min-w-0 lg:col-span-4 lg:sticky lg:top-24 space-y-4">
            <div className="rounded-[16px] bg-[#0E0918] border border-purple-500/20 p-5 space-y-4 shadow-xl">
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <span>សេចក្តីសង្ខេបការបញ្ជាទិញ (Summary)</span>
              </h3>

              <div className="space-y-3 pt-2 text-xs border-t border-slate-800">
                <div className="flex justify-between items-start gap-2">
                  <span className="text-slate-400">មុខទំនិញ:</span>
                  <span className="text-white font-semibold text-right line-clamp-2">
                    {selectedProduct ? selectedProduct.name : "—"}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-slate-400">ព័ត៌មានទទួល:</span>
                  <span className="text-purple-300 font-mono font-medium truncate max-w-[160px]">
                    {contact || "មិនទាន់បញ្ចូល"}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-slate-400">ការដឹកជញ្ជូន:</span>
                  <span className="text-emerald-400 font-semibold">ទទួលភ្លាមៗ (Instant)</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-slate-400">វិធីសាស្ត្រទូទាត់:</span>
                  <span className="text-cyan-400 font-semibold uppercase">
                    KHQR (ABA PayWay)
                  </span>
                </div>

                <div className="border-t border-slate-800 pt-3 flex justify-between items-baseline">
                  <span className="text-sm font-bold text-white">តម្លៃសរុប:</span>
                  <span className="text-2xl font-black text-purple-400 font-mono">
                    ${totalPrice.toFixed(2)}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleCheckout()}
                disabled={isSubmitting || !selectedProduct}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-sm shadow-lg shadow-purple-500/25 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>កំពុងបង្កើត QR...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>បង់ប្រាក់ឥឡូវនេះ (Pay Now)</span>
                  </>
                )}
              </button>

              <div className="space-y-1.5 pt-2 text-[10px] text-slate-400">
                <div className="flex items-center gap-1.5 text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>បង់ប្រាក់មានសុវត្ថិភាពខ្ពស់តាមរយៈ ABA KHQR</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
                  <span>ធានាជូនពេញលេញតាមលក្ខខណ្ឌផលិតផលនីមួយៗ</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ABA PayWay Modal */}
      <AbaPayWayV2Modal
        isOpen={isPayWayModalOpen}
        data={payWayModalData}
        onClose={() => setIsPayWayModalOpen(false)}
        onSuccess={({ orderNumber }) => {
          setIsPayWayModalOpen(false);
          toast.success("Payment verified! Your order is being processed.");
          router.push(`/orders?orderNumber=${encodeURIComponent(orderNumber)}`);
        }}
      />
    </div>
  );
}
