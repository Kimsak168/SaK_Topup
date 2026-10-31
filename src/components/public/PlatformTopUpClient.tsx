"use client";

import { useState, useMemo, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ArrowRight,
  ArrowLeft,
  Check,
  Search,
  X,
  ChevronDown,
  Sparkles,
  Users,
  Heart,
  Eye,
  MessageCircle,
  Share2,
  Zap,
  Loader2,
} from "lucide-react";
import AbaPayWayV2Modal, { AbaPayWayV2ModalData } from "./AbaPayWayV2Modal";

export interface SmmServiceItem {
  service: string;
  name: string;
  category: string;
  platform?: string;
  serviceType?: string;
  refill?: boolean;
  rate: number;
  min: number;
  max: number;
  description?: string;
}

interface PlatformTopUpClientProps {
  platform: string;
  platformName: string;
  initialServices: SmmServiceItem[];
  catalogTotal?: number;
  categories: string[];
  catalogError?: string;
}

const PLATFORM_IMAGES: Record<string, string> = {
  tiktok: "/images/platforms/tiktok-icon.svg",
  telegram: "/images/platforms/telegram-icon.svg",
  facebook: "/images/platforms/facebook-icon.svg",
  instagram: "/images/platforms/instagram-icon.svg",
  youtube: "/images/platforms/youtube-icon.svg",
};

const PLATFORM_GUIDES: Record<
  string,
  { label: string; placeholder: string; helper: string; guideTitle: string; guideText: string }
> = {
  tiktok: {
    label: "TikTok Profile or Video Link",
    placeholder: "https://www.tiktok.com/@username (or video URL)",
    helper: "For followers, paste your profile link. For likes and views, paste the video link.",
    guideTitle: "How to copy your TikTok link:",
    guideText:
      "Open TikTok, go to your profile, tap 'Share Profile', then select 'Copy Link'. For videos, tap the Share icon on the video and tap 'Copy Link'. Make sure your account is public.",
  },
  telegram: {
    label: "Telegram Channel, Group, or Post Link",
    placeholder: "https://t.me/yourchannel (or post URL)",
    helper: "",
    guideTitle: "How to copy your Telegram link:",
    guideText:
      "In Telegram, open your channel or group info, tap the invite link and choose 'Copy Link'. For post links, tap on the post and choose 'Copy Post Link'. Ensure your channel is public.",
  },
  facebook: {
    label: "Facebook Page, Profile, or Post Link",
    placeholder: "https://www.facebook.com/yourpage (or post URL)",
    helper: "Paste your public Facebook Page or Profile link, or the direct link to a public post/reel.",
    guideTitle: "How to copy your Facebook link:",
    guideText:
      "Open Facebook, go to your page or profile, tap (...) and select 'Copy link'. For posts, click Share on the post and select 'Copy link'. Make sure privacy is set to Public.",
  },
  instagram: {
    label: "Instagram Profile or Post Link",
    placeholder: "https://www.instagram.com/yourprofile (or post URL)",
    helper: "Paste your Instagram profile link for followers, or post/reel link for likes and views.",
    guideTitle: "How to copy your Instagram link:",
    guideText:
      "Open Instagram, go to your profile, tap 'Share profile' -> 'Copy link'. For posts or reels, tap the three dots or share button and choose 'Copy link'. Verify your account is Public.",
  },
  youtube: {
    label: "YouTube Channel or Video Link",
    placeholder: "https://www.youtube.com/@channel (or video URL)",
    helper: "Paste your YouTube channel URL for subscribers, or video URL for views and likes.",
    guideTitle: "How to copy your YouTube link:",
    guideText:
      "On YouTube, open your channel, tap the three dots in the top right corner, tap Share -> Copy Link. For videos, tap Share below the video player and choose Copy.",
  },
};

const SERVICE_TYPE_FILTERS = [
  { id: "all", label: "All Types", icon: Sparkles },
  { id: "followers", label: "Followers / Members", icon: Users },
  { id: "likes", label: "Likes & Reactions", icon: Heart },
  { id: "views", label: "Views", icon: Eye },
  { id: "comments", label: "Comments", icon: MessageCircle },
  { id: "shares", label: "Shares & Saves", icon: Share2 },
];

function getCustomerTotal(ratePerThousand: number, quantity: number) {
  if (!Number.isFinite(ratePerThousand) || ratePerThousand <= 0 || !Number.isInteger(quantity) || quantity <= 0) {
    return 0;
  }
  return Math.max(0.1, Math.ceil(((ratePerThousand * quantity) / 1000) * 100) / 100);
}

function isValidTargetUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return (url.protocol === "https:" || url.protocol === "http:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function PlatformTopUpClient({
  platform,
  platformName,
  initialServices,
  catalogTotal = initialServices.length,
  categories,
  catalogError,
}: PlatformTopUpClientProps) {
  const router = useRouter();
  const normPlatform = (platform || "tiktok").toLowerCase();
  const guide = PLATFORM_GUIDES[normPlatform] || {
    label: "Target URL / Link",
    placeholder: "https://example.com/target-link",
    helper: "Paste the full public URL to your profile, channel, post, or video.",
    guideTitle: "How to copy link:",
    guideText: "Copy and paste the full public URL from your browser or app.",
  };

  const coverImage = PLATFORM_IMAGES[normPlatform] || "/images/logo.png";

  // Account / Target Link state
  const [targetLink, setTargetLink] = useState("");
  const [showGuide, setShowGuide] = useState(false);

  // Filters state
  const [selectedType, setSelectedType] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [isServicePickerOpen, setIsServicePickerOpen] = useState(false);

  // Service & Package selection
  const [selectedService, setSelectedService] = useState<SmmServiceItem | null>(() => initialServices[0] || null);
  const [quantity, setQuantity] = useState<number>(() => initialServices[0]?.min || 1000);

  // Payment selection
  const [paymentMethod, setPaymentMethod] = useState<"aba_payway_v2">("aba_payway_v2");

  // Modal & submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPayWayModalOpen, setIsPayWayModalOpen] = useState(false);
  const [payWayModalData, setPayWayModalData] = useState<AbaPayWayV2ModalData | null>(null);

  // Filtered services
  const filteredServices = useMemo(() => {
    return initialServices.filter((s) => {
      if (selectedType !== "all" && s.serviceType !== selectedType) return false;
      if (selectedCategory !== "All" && s.category !== selectedCategory) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesName = s.name.toLowerCase().includes(query);
        const matchesCat = s.category.toLowerCase().includes(query);
        const matchesDesc = (s.description || "").toLowerCase().includes(query);
        if (!matchesName && !matchesCat && !matchesDesc) return false;
      }
      return true;
    });
  }, [initialServices, selectedType, selectedCategory, searchQuery]);

  // Keep selected service in sync or select first matching
  useEffect(() => {
    if (filteredServices.length === 0) {
      if (selectedService) setSelectedService(null);
      return;
    }

    if (!selectedService || !filteredServices.some((service) => service.service === selectedService.service)) {
      setSelectedService(filteredServices[0]);
      setQuantity(filteredServices[0].min);
    }
  }, [filteredServices, selectedService]);

  const handleSelectService = (item: SmmServiceItem) => {
    setSelectedService(item);
    setIsServicePickerOpen(false);
    if (!Number.isInteger(quantity) || quantity < item.min) {
      setQuantity(item.min);
    } else if (quantity > item.max) {
      setQuantity(item.max);
    }
    toast.success("Service selected", {
      id: "service-select",
      description: item.name,
      duration: 2500,
    });
  };

  // Quantity presets calculation
  const presets = useMemo(() => {
    if (!selectedService) return [1000, 2500, 5000, 10000];
    const candidateList = [500, 1000, 2000, 5000, 10000, 20000, 50000];
    const valid = candidateList.filter(
      (v) => v >= selectedService.min && v <= selectedService.max
    );
    if (valid.length >= 3) return valid.slice(0, 5);
    // Dynamic generation if candidates don't fit
    const base = selectedService.min;
    return [
      base,
      Math.min(selectedService.max, base * 2),
      Math.min(selectedService.max, base * 5),
      Math.min(selectedService.max, base * 10),
    ].filter((v, i, arr) => arr.indexOf(v) === i && v <= selectedService.max);
  }, [selectedService]);

  const isLinkValid = isValidTargetUrl(targetLink);
  const isQuantityValid = Boolean(
    selectedService &&
      Number.isInteger(quantity) &&
      quantity >= selectedService.min &&
      quantity <= selectedService.max
  );

  const estimatedTotal = useMemo(() => {
    if (!selectedService || !quantity) return 0;
    return getCustomerTotal(selectedService.rate, quantity);
  }, [selectedService, quantity]);

  // Checkout submission
  const handleCheckout = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedService) {
      toast.error("Please select a service");
      return;
    }
    if (!isLinkValid) {
      toast.error("Please enter a valid public link", {
        description: "Ensure the URL starts with https:// and is formatted correctly.",
      });
      return;
    }
    if (!isQuantityValid) {
      toast.error(
        `Quantity must be between ${selectedService.min.toLocaleString()} and ${selectedService.max.toLocaleString()}`
      );
      return;
    }

    try {
      setIsSubmitting(true);
      toast.loading("Creating your order...", { id: "checkout" });

      const res = await fetch("/api/smm/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: selectedService.service,
          link: targetLink.trim(),
          quantity,
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
          packageName: `${selectedService.name} (${quantity.toLocaleString()} units)`,
          gameName: `${platformName} Services`,
          paymentStatus: data.paymentStatus,
          merchantName: "Asura Store",
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
          description: "Scan with ABA Mobile or any KHQR banking app.",
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
    <div className="service-topup-page relative min-h-screen w-full overflow-x-clip py-3 sm:py-8 text-white">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 relative z-10 space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between">
          <Link
            href="/#all-platforms"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-cyan-300 hover:text-cyan-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to All Platforms</span>
          </Link>
          <span className="text-xs text-slate-400 font-mono">
            {catalogError ? "Catalogue unavailable" : `${catalogTotal.toLocaleString()} services available`}
          </span>
        </div>

        {/* Platform Hero Banner Card (matching Game Detail Header) */}
        <section className="service-page-hero">
          <div className="service-page-hero__inner">
            <div className="service-page-hero__icon">
              <Image
                src={coverImage}
                alt={platformName}
                fill
                priority
                sizes="112px"
                className="object-contain"
              />
            </div>
            <div className="service-page-hero__copy">
              <h1 className="service-page-hero__title">
                {platformName} Top-Up &amp; Growth Services
              </h1>
              <p className="service-page-hero__description">
                Choose a {platformName} service, enter your target link, and complete checkout securely with KHQR.
              </p>
            </div>
          </div>
        </section>

        {/* 2-Column Responsive Layout (matching GameTopUpClient) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start">
          {/* Left Column: Top-Up Steps (8 Cols) */}
          <div className="min-w-0 lg:col-span-8 space-y-5">
            {/* STEP 1: Account / Target Link Information */}
            <section
              data-topup-step="1"
              className="topup-step rounded-[16px] bg-[#0E0918] border border-violet-500/20 p-4 sm:p-5 space-y-4 shadow-lg"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="topup-step-title flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-violet-600 text-white text-xs font-black">
                    1
                  </span>
                  <h2 className="text-sm sm:text-base font-bold text-white">
                    Target Account Information / ព័ត៌មានតំណភ្ជាប់
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={() => setShowGuide(!showGuide)}
                  aria-expanded={showGuide}
                  className="flex items-center gap-1 text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                  <span>How to get link?</span>
                </button>
              </div>

              {/* Guide Callout */}
              {showGuide && (
                <div className="rounded-xl border border-violet-500/30 bg-violet-950/40 p-3.5 text-xs text-slate-300 space-y-1 animate-in fade-in">
                  <p className="font-bold text-cyan-300">{guide.guideTitle}</p>
                  <p className="leading-relaxed text-slate-300">{guide.guideText}</p>
                </div>
              )}

              <div>
                <label htmlFor="target-link-input" className="block text-xs font-semibold text-slate-300 mb-1.5">
                  {guide.label} <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <input
                    id="target-link-input"
                    type="url"
                    value={targetLink}
                    onChange={(e) => setTargetLink(e.target.value)}
                    placeholder={guide.placeholder}
                    className={`h-11 w-full rounded-xl border bg-slate-950/80 px-3.5 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none transition-all ${
                      targetLink && isLinkValid
                        ? "border-emerald-500/80 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/40"
                        : targetLink && !isLinkValid
                        ? "border-rose-500/80 focus:border-rose-400 focus:ring-1 focus:ring-rose-400/40"
                        : "border-slate-800 focus:border-violet-500"
                    }`}
                  />
                  {targetLink && isLinkValid && (
                    <CheckCircle2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" />
                  )}
                  {targetLink && !isLinkValid && (
                    <AlertCircle className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-rose-400" />
                  )}
                </div>
                {guide.helper ? (
                  <p className="mt-1.5 text-[11px] text-slate-400 leading-normal">
                    {guide.helper}
                  </p>
                ) : null}
              </div>
            </section>

            {/* STEP 2: Choose Service & Package */}
            <section
              data-topup-step="2"
              className="topup-step rounded-[16px] bg-[#0E0918] border border-violet-500/20 p-4 sm:p-5 space-y-4 shadow-lg"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="topup-step-title flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-violet-600 text-white text-xs font-black">
                    2
                  </span>
                  <h2 className="text-sm sm:text-base font-bold text-white">
                    Choose Service &amp; Package / ជ្រើសរើសសេវាកម្ម
                  </h2>
                </div>
                <span className="text-xs text-slate-400 font-mono">
                  {catalogError ? "Unavailable" : `${filteredServices.length} options`}
                </span>
              </div>

              {/* Sub-Filters: Service Types */}
              <div className="flex flex-wrap items-center gap-2 pb-1">
                {SERVICE_TYPE_FILTERS.map((f) => {
                  const Icon = f.icon;
                  const isActive = selectedType === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => {
                        setSelectedType(f.id);
                        setIsServicePickerOpen(true);
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer border ${
                        isActive
                          ? "bg-violet-600 text-white border-violet-400 shadow-md shadow-violet-500/25 font-bold"
                          : "bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{f.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Search & Category Filter */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                <div className="sm:col-span-7 relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                  <input
                    type="text"
                    aria-label="Search services"
                    value={searchQuery}
                    onFocus={() => setIsServicePickerOpen(true)}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setIsServicePickerOpen(true);
                    }}
                    placeholder="Search package (followers, likes, views)..."
                    className="w-full bg-slate-950/90 border border-slate-800 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-colors"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="sm:col-span-5 relative">
                  <select
                    value={selectedCategory}
                    onChange={(e) => {
                      setSelectedCategory(e.target.value);
                      setIsServicePickerOpen(true);
                    }}
                    aria-label="Filter by category"
                    className="w-full bg-slate-950/90 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-violet-500 appearance-none truncate cursor-pointer pr-8"
                  >
                    <option value="All">All Categories</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                </div>
              </div>

              {/* Service selector keeps the chosen package readable and opens a searchable list when needed. */}
              {catalogError ? (
                <div role="alert" className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-5 text-center space-y-3">
                  <AlertCircle className="mx-auto h-8 w-8 text-amber-300" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-amber-100">Service catalogue unavailable</p>
                    <p className="text-xs text-amber-200/80">{catalogError}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.refresh()}
                    className="inline-flex min-h-10 items-center justify-center rounded-xl border border-amber-300/40 px-4 text-xs font-bold text-amber-100 transition-colors hover:bg-amber-300/10"
                  >
                    Try again
                  </button>
                </div>
              ) : filteredServices.length === 0 ? (
                <div className="py-12 text-center text-slate-400 space-y-2 border border-dashed border-slate-800 rounded-2xl">
                  <AlertCircle className="w-8 h-8 mx-auto text-slate-600" />
                  <p className="text-sm font-semibold text-slate-300">No services match your filters</p>
                  <p className="text-xs text-slate-500">Try changing the category or search query.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold text-slate-700">Selected package</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {filteredServices.length.toLocaleString()} matching {filteredServices.length === 1 ? "service" : "services"}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-expanded={isServicePickerOpen}
                      aria-controls="smm-service-options"
                      onClick={() => setIsServicePickerOpen((open) => !open)}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-[#F0C6DA] bg-white px-3 text-xs font-bold text-[#8E4C70] transition-colors hover:bg-[#FDF2F8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B54779]"
                    >
                      {isServicePickerOpen ? "Close list" : "Change service"}
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isServicePickerOpen ? "rotate-180" : ""}`} />
                    </button>
                  </div>

                  {selectedService && (
                    <div className="rounded-2xl border border-[#F0C6DA] bg-[#FFF8FC] p-3.5 sm:p-4">
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <span className="inline-flex max-w-full items-center rounded-full border border-[#F0C6DA] bg-white px-2.5 py-1 text-[10px] font-bold text-[#8E4C70]">
                            <span className="truncate">{selectedService.category}</span>
                          </span>
                          <p className="mt-2 text-sm font-bold leading-snug text-[#3B2D39] [overflow-wrap:anywhere]">
                            {selectedService.name}
                          </p>
                          <p className="mt-1.5 text-[11px] text-[#766477]">
                            Min {selectedService.min.toLocaleString()} <span aria-hidden="true">·</span> Max {selectedService.max.toLocaleString()}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-base font-black tabular-nums text-[#A94776]">${selectedService.rate.toFixed(2)}</p>
                          <p className="text-[10px] text-[#766477]">per 1,000</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {isServicePickerOpen && (
                    <div
                      id="smm-service-options"
                      className="max-h-[25rem] space-y-2 overflow-y-auto overscroll-contain rounded-2xl border border-[#F6DDE9] bg-[#FFFCFE] p-2"
                    >
                      {filteredServices.map((service) => {
                        const isSelected = selectedService?.service === service.service;
                        return (
                          <button
                            key={service.service}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => handleSelectService(service)}
                            className={`grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B54779] ${
                              isSelected
                                ? "border-[#D99AB8] bg-[#FDF2F8]"
                                : "border-transparent bg-white hover:border-[#F0C6DA] hover:bg-[#FFF8FC]"
                            }`}
                          >
                            <span className="min-w-0">
                              <span className="block text-[10px] font-semibold text-[#8E4C70]">{service.category}</span>
                              <span className="mt-0.5 block text-xs font-bold leading-snug text-[#3B2D39] [overflow-wrap:anywhere]">
                                {service.name}
                              </span>
                              <span className="mt-1 block text-[10px] text-[#766477]">
                                {service.min.toLocaleString()}–{service.max.toLocaleString()} units
                              </span>
                            </span>
                            <span className="flex shrink-0 items-center gap-2 text-right">
                              <span>
                                <span className="block text-sm font-black tabular-nums text-[#A94776]">${service.rate.toFixed(2)}</span>
                                <span className="block text-[9px] text-[#766477]">per 1,000</span>
                              </span>
                              {isSelected ? <Check className="h-4 w-4 text-[#A94776]" /> : null}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Quantity Selection Panel for Selected Service */}
              {selectedService && (
                <div className="pt-4 border-t border-slate-800/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <label htmlFor="custom-quantity-input" className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Select Quantity ({selectedService.min.toLocaleString()} - {selectedService.max.toLocaleString()} units)</span>
                    </label>
                    <span className="text-xs font-mono font-bold text-cyan-300">
                      ${estimatedTotal.toFixed(2)} USD
                    </span>
                  </div>

                  {/* Preset Buttons */}
                  <div className="flex flex-wrap items-center gap-2">
                    {presets.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setQuantity(preset)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer border ${
                          quantity === preset
                            ? "bg-cyan-400 text-slate-950 border-cyan-300 shadow-sm shadow-cyan-400/30"
                            : "bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white"
                        }`}
                      >
                        +{preset.toLocaleString()}
                      </button>
                    ))}
                  </div>

                  {/* Custom Number Input */}
                  <div className="relative">
                    <input
                      id="custom-quantity-input"
                      type="number"
                      min={selectedService.min}
                      max={selectedService.max}
                      step={1}
                      value={quantity || ""}
                      onChange={(e) => setQuantity(Math.floor(Number(e.target.value)))}
                      placeholder={`Enter quantity between ${selectedService.min.toLocaleString()} and ${selectedService.max.toLocaleString()}`}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white font-mono placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 transition-colors"
                    />
                  </div>
                </div>
              )}
            </section>

            {/* STEP 3: Payment Method */}
            <section
              data-topup-step="3"
              className="topup-step rounded-[16px] bg-[#0E0918] border border-violet-500/20 p-4 sm:p-5 space-y-4 shadow-lg"
            >
              <div className="flex items-center justify-between">
                <div className="topup-step-title flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-violet-600 text-white text-xs font-black">
                    3
                  </span>
                  <h2 className="text-sm sm:text-base font-bold text-white">
                    Payment Method / វិធីសាស្ត្រទូទាត់
                  </h2>
                </div>
                <span className="text-xs text-slate-400">Scan &amp; Pay</span>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div
                  className="flex min-h-[72px] items-center justify-between gap-3 rounded-2xl border border-cyan-400 bg-cyan-950/20 p-3.5 text-left ring-1 ring-cyan-400/50 shadow-lg shadow-cyan-500/10"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative w-10 h-10 rounded-xl overflow-hidden bg-[#004B87] shrink-0 border border-cyan-400/30">
                      <Image src="/images/aba-logo.png" alt="ABA" fill sizes="40px" className="object-contain" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="payment-method-title text-xs sm:text-sm font-bold text-slate-900 dark:text-white">KHQR</span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300">
                          Instant
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400 block mt-0.5">
                        ABA Mobile &amp; All Cambodian Banks (KHQR)
                      </span>
                    </div>
                  </div>
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 bg-cyan-400 text-slate-950"
                  >
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </span>
                </div>
              </div>
            </section>
          </div>

          {/* Right Column: Order Summary Drawer / Sticky Card (matching GameTopUpClient) */}
          <div className="min-w-0 lg:col-span-4 lg:sticky lg:top-24 space-y-4">
            <div className="topup-order-summary service-order-summary rounded-[20px] bg-[#0E0918] border border-violet-500/20 p-5 space-y-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-violet-500/20 pb-3">
                <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Order Summary</span>
                </h3>
                <span className="text-[11px] text-emerald-400 font-bold px-2 py-0.5 rounded-full bg-emerald-500/10">
                  Secure Checkout
                </span>
              </div>

              {/* Summary Details */}
              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Platform</span>
                  <span className="font-bold text-white">{platformName}</span>
                </div>

                <div className="flex justify-between items-start gap-3">
                  <span className="text-slate-400 shrink-0">Service</span>
                  <span className="font-bold text-white text-right line-clamp-2">
                    {selectedService?.name || "None"}
                  </span>
                </div>

                <div className="flex justify-between items-start gap-3">
                  <span className="text-slate-400 shrink-0">Target URL</span>
                  <span className="font-mono text-cyan-300 text-right truncate max-w-[200px]">
                    {targetLink.trim() || <em className="text-slate-500 font-sans">Not entered</em>}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Quantity</span>
                  <span className="font-mono font-bold text-white">
                    {quantity.toLocaleString()} units
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Unit Rate</span>
                  <span className="font-mono text-slate-300">
                    {selectedService ? `$${selectedService.rate.toFixed(2)} / 1,000` : "—"}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Payment</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    KHQR (ABA PayWay)
                  </span>
                </div>
              </div>

              {/* Total Calculation */}
              <div className="border-t border-slate-800 pt-3 space-y-1">
                <div className="flex justify-between items-baseline">
                  <div>
                    <span className="text-xs font-bold text-white block">Total Amount:</span>
                    <span className="text-[10px] text-slate-400">Calculated in USD</span>
                  </div>
                  <span className="text-2xl font-black text-cyan-300 font-mono tracking-tight">
                    ${estimatedTotal.toFixed(2)} USD
                  </span>
                </div>
              </div>

              {/* Checkout Button */}
              <button
                type="button"
                onClick={handleCheckout}
                disabled={isSubmitting || !selectedService || !isLinkValid || !isQuantityValid}
                className="service-checkout-button w-full min-h-12 px-4 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processing Order...</span>
                  </>
                ) : (
                  <>
                    <span>Continue to Payment · ${estimatedTotal.toFixed(2)} USD</span>
                    <ArrowRight className="w-4 h-4 stroke-[3]" />
                  </>
                )}
              </button>

            </div>
          </div>
        </div>
      </div>

      {/* ABA PayWay V2 Modal */}
      <AbaPayWayV2Modal
        isOpen={isPayWayModalOpen}
        data={payWayModalData}
        onClose={() => setIsPayWayModalOpen(false)}
        onSuccess={({ orderNumber }) => {
          setIsPayWayModalOpen(false);
          toast.success("Payment verified! Your order is now being processed.");
          router.push(`/orders?orderNumber=${encodeURIComponent(orderNumber)}`);
        }}
      />
    </div>
  );
}
