"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
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
  ChevronDown,
  Zap,
  Loader2,
  Search,
  X,
  ClipboardPaste,
  Users,
  Heart,
  Eye,
  Share2,
  MessageCircle,
  Sparkles,
  Minus,
  Plus,
  Shield,
  Clock,
  Gauge,
} from "lucide-react";
import type { AbaPayWayV2ModalData } from "./AbaPayWayV2Modal";

const AbaPayWayV2Modal = dynamic(() => import("./AbaPayWayV2Modal"), {
  loading: () => (
    <div role="status" className="fixed inset-0 z-50 grid place-items-center bg-black/70 text-white">
      Preparing secure payment...
    </div>
  ),
});

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

type ServiceTypeKey = "followers" | "likes" | "views" | "shares" | "comments" | "other";
type SortOption = "recommended" | "price-low" | "price-high";

interface ParsedServiceDisplay {
  cleanTitle: string;
  quality: string | null;
  speed: string | null;
  startTime: string | null;
  refillLabel: string | null;
  hasRefill: boolean;
  extraNotes: string[];
  searchableText: string;
}

const PLATFORM_SWITCHER = [
  { slug: "tiktok", name: "TikTok", icon: "/images/platforms/tiktok-icon.svg" },
  { slug: "telegram", name: "Telegram", icon: "/images/platforms/telegram-icon.svg" },
  { slug: "facebook", name: "Facebook", icon: "/images/platforms/facebook-icon.svg" },
  { slug: "instagram", name: "Instagram", icon: "/images/platforms/instagram-icon.svg" },
  { slug: "youtube", name: "YouTube", icon: "/images/platforms/youtube-icon.svg" },
];

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
    helper: "Paste your profile link for followers, or your video link for likes and views.",
    guideTitle: "How to copy your TikTok link:",
    guideText:
      "Open TikTok, go to your profile, tap Share Profile -> Copy Link. For videos, tap the Share icon and choose Copy Link. Make sure your account is public.",
  },
  telegram: {
    label: "Telegram Channel, Group, or Post Link",
    placeholder: "https://t.me/yourchannel (or post URL)",
    helper: "Paste your public Telegram channel/group invite link, or a post link for views and reactions.",
    guideTitle: "How to copy your Telegram link:",
    guideText:
      "In Telegram, open your channel or group info, tap the invite link -> Copy Link. For post views/reactions, tap the post -> Copy Post Link. Ensure your channel is public.",
  },
  facebook: {
    label: "Facebook Page, Profile, or Post Link",
    placeholder: "https://www.facebook.com/yourpage (or post URL)",
    helper: "Paste your public Facebook Page or Profile link, or a direct link to a public post or reel.",
    guideTitle: "How to copy your Facebook link:",
    guideText:
      "Open Facebook, go to your page or profile, tap (...) -> Copy link. For posts, click Share -> Copy link. Ensure privacy is set to Public.",
  },
  instagram: {
    label: "Instagram Profile or Post Link",
    placeholder: "https://www.instagram.com/yourprofile (or post URL)",
    helper: "Paste your Instagram profile link for followers, or post/reel link for likes and views.",
    guideTitle: "How to copy your Instagram link:",
    guideText:
      "Open Instagram, go to your profile, tap Share profile -> Copy link. For posts or reels, tap the share icon -> Copy link. Verify your account is Public.",
  },
  youtube: {
    label: "YouTube Channel or Video Link",
    placeholder: "https://www.youtube.com/@channel (or video URL)",
    helper: "Paste your YouTube channel URL for subscribers, or video/shorts URL for views and likes.",
    guideTitle: "How to copy your YouTube link:",
    guideText:
      "On YouTube, open your channel, tap the menu -> Share -> Copy Link. For videos, tap Share below the video player -> Copy link.",
  },
};

const TYPE_PRIORITY: Record<ServiceTypeKey, number> = {
  followers: 0,
  likes: 1,
  views: 2,
  shares: 3,
  comments: 4,
  other: 5,
};

const CATEGORY_SHORT_LABELS: Record<string, string> = {
  "Followers / Members / Subscribers": "Followers",
  "Likes / Reactions": "Likes & Reactions",
  "Shares / Saves": "Shares & Saves",
  "Other Services": "Other",
};

const QUANTITY_PRESET_POOL = [100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000];
const INITIAL_VISIBLE_PACKAGES = 24;

function cleanUnicodeText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function getCustomerTotal(ratePerThousand: number, quantity: number) {
  if (!Number.isFinite(ratePerThousand) || ratePerThousand <= 0 || !Number.isInteger(quantity) || quantity <= 0) {
    return 0;
  }
  return Math.max(0.1, Math.ceil(((ratePerThousand * quantity) / 1000) * 100) / 100);
}

function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function isValidTargetUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return (url.protocol === "https:" || url.protocol === "http:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function getServiceTypeKey(service: SmmServiceItem): ServiceTypeKey {
  const raw = (service.serviceType || "").toLowerCase();
  if (raw === "followers" || raw === "likes" || raw === "views" || raw === "shares" || raw === "comments") {
    return raw;
  }
  const cat = cleanUnicodeText(`${service.category} ${service.name}`).toLowerCase();
  if (cat.includes("follower") || cat.includes("member") || cat.includes("subscriber")) return "followers";
  if (cat.includes("like") || cat.includes("reaction")) return "likes";
  if (cat.includes("view") || cat.includes("watch")) return "views";
  if (cat.includes("share") || cat.includes("save") || cat.includes("repost")) return "shares";
  if (cat.includes("comment")) return "comments";
  return "other";
}

function parseSmmServiceDisplay(service: SmmServiceItem): ParsedServiceDisplay {
  const normalized = cleanUnicodeText(service.name);
  const rawSegments = normalized
    .split(/\s*[~|]\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

  let cleanTitle = (rawSegments[0] || normalized)
    .replace(/\s*-\s+/g, " ")
    .replace(/^\[([^\]]+)\]\s*/, "$1 ")
    .replace(/\s+/g, " ")
    .trim();

  let quality: string | null = null;
  let speed: string | null = null;
  let startTime: string | null = null;
  let refillLabel: string | null = null;
  let hasExplicitNoRefill = false;
  let hasRefillKeyword = Boolean(service.refill);
  const extraNotes: string[] = [];

  for (const seg of rawSegments.slice(1)) {
    const cleaned = seg.replace(/^\[|\]$/g, "").trim();
    if (!cleaned) continue;
    const lower = cleaned.toLowerCase();

    if (/^max\s*[\d.,]+[kmb]?$/i.test(cleaned) || /^min\s*[\d.,]+[kmb]?$/i.test(cleaned)) {
      continue;
    }
    if (lower.includes("no refill")) {
      hasExplicitNoRefill = true;
      continue;
    }
    if (lower.includes("refill") || lower.includes("lifetime")) {
      hasRefillKeyword = true;
      const daysMatch = cleaned.match(/(\d+\s*[dhm]|\d+\s*days?|lifetime)/i);
      refillLabel = daysMatch
        ? `${daysMatch[1].toUpperCase().replace(/\s+/g, "")} Refill`
        : "Refill Guarantee";
      continue;
    }
    if (/\d+\s*[kmb]?\/day/i.test(lower)) {
      speed = cleaned.replace(/days/i, "Day").replace(/day/i, "day");
      continue;
    }
    if (/^(instant|fast|slow|\d+\s*-\s*\d+\s*(min|mins|hour|hours|hr|hrs))$/i.test(lower)) {
      startTime = cleaned.replace(/Hours?/i, "hrs");
      continue;
    }
    if (
      !quality &&
      (lower.includes("real") ||
        lower.includes("hq") ||
        lower.includes("bot") ||
        lower.includes("organic") ||
        lower.includes("premium") ||
        lower.includes("app") ||
        lower.includes("high quality") ||
        lower.includes("profile"))
    ) {
      quality = cleaned.replace(/100%\s*/i, "");
      continue;
    }
    if (cleaned.length <= 36) {
      extraNotes.push(cleaned);
    }
  }

  const hasRefill = Boolean(service.refill) || (hasRefillKeyword && !hasExplicitNoRefill);
  if (hasRefill && !refillLabel) {
    refillLabel = "Refill Guarantee";
  }

  // Fallback cleanup if the supplier formatted the title without ~ separators
  cleanTitle = cleanTitle
    .replace(/\bNO\s*REFILL\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  const searchableText = [
    normalized,
    cleanTitle,
    quality || "",
    speed || "",
    startTime || "",
    refillLabel || "",
    service.category,
    service.service,
  ]
    .join(" ")
    .toLowerCase();

  return {
    cleanTitle: cleanTitle || normalized,
    quality,
    speed,
    startTime,
    refillLabel,
    hasRefill,
    extraNotes,
    searchableText,
  };
}

function getCategoryOrderKey(category: string): number {
  const lower = category.toLowerCase();
  if (lower.includes("follower") || lower.includes("member") || lower.includes("subscriber")) return 0;
  if (lower.includes("like") || lower.includes("reaction")) return 1;
  if (lower.includes("view")) return 2;
  if (lower.includes("share") || lower.includes("save")) return 3;
  if (lower.includes("comment")) return 4;
  return 5;
}

function getSensibleDefaultQuantity(service: SmmServiceItem | null): number {
  if (!service) return 1000;
  if (1000 >= service.min && 1000 <= service.max && getCustomerTotal(service.rate, 1000) <= 3.5) {
    return 1000;
  }
  if (500 >= service.min && 500 <= service.max && getCustomerTotal(service.rate, 500) <= 3.5) {
    return 500;
  }
  if (100 >= service.min && 100 <= service.max) {
    return 100;
  }
  return service.min;
}

function ServiceTypeIcon({ typeKey, className }: { typeKey: ServiceTypeKey; className?: string }) {
  switch (typeKey) {
    case "followers":
      return <Users className={className} />;
    case "likes":
      return <Heart className={className} />;
    case "views":
      return <Eye className={className} />;
    case "shares":
      return <Share2 className={className} />;
    case "comments":
      return <MessageCircle className={className} />;
    default:
      return <Sparkles className={className} />;
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
  const linkInputRef = useRef<HTMLInputElement>(null);
  const normPlatform = (platform || "tiktok").toLowerCase();
  const guide = PLATFORM_GUIDES[normPlatform] || {
    label: "Target URL / Link",
    placeholder: "https://example.com/target-link",
    helper: "Paste the full public URL to your profile, channel, post, or video.",
    guideTitle: "How to copy link:",
    guideText: "Copy and paste the full public URL from your browser or app.",
  };

  const coverImage = PLATFORM_IMAGES[normPlatform] || "/images/logo.webp";

  // Pre-parse & smart-sort services so Followers -> Likes -> Views -> Shares -> Comments appear first
  const enrichedServices = useMemo(() => {
    return initialServices
      .map((item) => {
        const parsed = parseSmmServiceDisplay(item);
        const typeKey = getServiceTypeKey(item);
        return { item, parsed, typeKey };
      })
      .sort((a, b) => {
        const typeDiff = TYPE_PRIORITY[a.typeKey] - TYPE_PRIORITY[b.typeKey];
        if (typeDiff !== 0) return typeDiff;
        const qualityScore = (p: ParsedServiceDisplay) => {
          const q = (p.quality || "").toLowerCase();
          if (q.includes("real") || q.includes("organic")) return 0;
          if (q.includes("hq") || q.includes("high quality") || q.includes("premium")) return 1;
          if (q.includes("bot")) return 3;
          return 2;
        };
        const qDiff = qualityScore(a.parsed) - qualityScore(b.parsed);
        // Prefer Real / HQ packages when they are within a small price band of Bot packages
        if (qDiff !== 0 && Math.abs(a.item.rate - b.item.rate) <= 0.6) return qDiff;
        if (a.item.rate !== b.item.rate) return a.item.rate - b.item.rate;
        return a.parsed.cleanTitle.localeCompare(b.parsed.cleanTitle);
      });
  }, [initialServices]);

  const lowestRate = useMemo(() => {
    if (enrichedServices.length === 0) return null;
    return enrichedServices.reduce((min, cur) => (cur.item.rate < min ? cur.item.rate : min), enrichedServices[0].item.rate);
  }, [enrichedServices]);

  const refillServiceCount = useMemo(
    () => enrichedServices.filter((s) => s.parsed.hasRefill).length,
    [enrichedServices]
  );

  // Ordered category tabs with live counts
  const categoryTabs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of enrichedServices) {
      counts.set(entry.item.category, (counts.get(entry.item.category) || 0) + 1);
    }

    const uniqueCats = Array.from(
      new Set(categories.filter((c) => c !== "All" && (counts.get(c) || 0) > 0))
    ).sort((a, b) => {
      const diff = getCategoryOrderKey(a) - getCategoryOrderKey(b);
      return diff !== 0 ? diff : a.localeCompare(b);
    });

    return [
      { key: "All", label: "All Services", count: enrichedServices.length, typeKey: "other" as ServiceTypeKey },
      ...uniqueCats.map((cat) => {
        const lower = cat.toLowerCase();
        const typeKey: ServiceTypeKey = lower.includes("follower") || lower.includes("member") || lower.includes("subscriber")
          ? "followers"
          : lower.includes("like") || lower.includes("reaction")
            ? "likes"
            : lower.includes("view")
              ? "views"
              : lower.includes("share") || lower.includes("save")
                ? "shares"
                : lower.includes("comment")
                  ? "comments"
                  : "other";
        return {
          key: cat,
          label: CATEGORY_SHORT_LABELS[cat] || cat,
          count: counts.get(cat) || 0,
          typeKey,
        };
      }),
    ];
  }, [categories, enrichedServices]);

  // Account / Target Link state
  const [targetLink, setTargetLink] = useState("");
  const [showGuide, setShowGuide] = useState(false);

  // Filters state
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [refillOnly, setRefillOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("recommended");
  const [showAllPackages, setShowAllPackages] = useState(false);

  // Service & Package selection — default to #1 smart-ranked service (Followers -> Likes -> Views)
  const [selectedService, setSelectedService] = useState<SmmServiceItem | null>(
    () => enrichedServices[0]?.item || null
  );
  const [quantity, setQuantity] = useState<number>(() =>
    getSensibleDefaultQuantity(enrichedServices[0]?.item || null)
  );
  const [showFullDescription, setShowFullDescription] = useState(false);

  // Payment & Modal state
  const [paymentMethod] = useState<"aba_payway_v2">("aba_payway_v2");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPayWayModalOpen, setIsPayWayModalOpen] = useState(false);
  const [payWayModalData, setPayWayModalData] = useState<AbaPayWayV2ModalData | null>(null);

  // Filtered & sorted services
  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = enrichedServices.filter((entry) => {
      if (selectedCategory !== "All" && entry.item.category !== selectedCategory) return false;
      if (refillOnly && !entry.parsed.hasRefill) return false;
      if (q && !entry.parsed.searchableText.includes(q)) return false;
      return true;
    });

    if (sortBy === "price-low") {
      return [...filtered].sort((a, b) => a.item.rate - b.item.rate || a.parsed.cleanTitle.localeCompare(b.parsed.cleanTitle));
    }
    if (sortBy === "price-high") {
      return [...filtered].sort((a, b) => b.item.rate - a.item.rate || a.parsed.cleanTitle.localeCompare(b.parsed.cleanTitle));
    }
    return filtered;
  }, [enrichedServices, selectedCategory, refillOnly, searchQuery, sortBy]);

  // Reset pagination when filter changes
  useEffect(() => {
    setShowAllPackages(false);
  }, [selectedCategory, searchQuery, refillOnly, sortBy]);

  // Keep selected service valid when category/filter changes
  useEffect(() => {
    if (filteredEntries.length === 0) return;
    if (!selectedService || !filteredEntries.some((e) => e.item.service === selectedService.service)) {
      const next = filteredEntries[0].item;
      setSelectedService(next);
      setQuantity(getSensibleDefaultQuantity(next));
      setShowFullDescription(false);
    }
  }, [filteredEntries, selectedService]);

  const visibleEntries = useMemo(() => {
    if (showAllPackages || searchQuery.trim().length > 0) {
      return filteredEntries;
    }
    return filteredEntries.slice(0, INITIAL_VISIBLE_PACKAGES);
  }, [filteredEntries, showAllPackages, searchQuery]);

  const selectedParsed = useMemo(
    () => (selectedService ? parseSmmServiceDisplay(selectedService) : null),
    [selectedService]
  );

  const selectedTypeKey = useMemo(
    () => (selectedService ? getServiceTypeKey(selectedService) : "other"),
    [selectedService]
  );

  const handleSelectService = (item: SmmServiceItem, parsed?: ParsedServiceDisplay) => {
    setSelectedService(item);
    setShowFullDescription(false);
    if (!Number.isInteger(quantity) || quantity < item.min || quantity > item.max) {
      setQuantity(getSensibleDefaultQuantity(item));
    }
    toast.success("Package selected", {
      id: "service-select",
      description: parsed?.cleanTitle || cleanUnicodeText(item.name),
      duration: 2000,
    });
  };

  const handlePasteLink = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        setTargetLink(text.trim());
        toast.success("Link pasted from clipboard", { duration: 1500 });
      } else {
        toast.error("Clipboard is empty");
      }
    } catch {
      linkInputRef.current?.focus();
      toast.info("Press Ctrl+V / long-press to paste your link");
    }
  };

  // Quantity denomination cards
  const presets = useMemo(() => {
    if (!selectedService) return [500, 1000, 2500, 5000];
    const valid = QUANTITY_PRESET_POOL.filter(
      (v) => v >= selectedService.min && v <= selectedService.max
    );
    if (valid.length >= 4) return valid.slice(0, 6);

    const base = Math.max(1, selectedService.min);
    return [
      base,
      Math.min(selectedService.max, base * 2),
      Math.min(selectedService.max, base * 5),
      Math.min(selectedService.max, base * 10),
      Math.min(selectedService.max, base * 25),
    ].filter((v, i, arr) => arr.indexOf(v) === i && v >= selectedService.min && v <= selectedService.max);
  }, [selectedService]);

  const quantityStep = useMemo(() => {
    if (!selectedService) return 100;
    if (selectedService.max <= 100) return 10;
    if (selectedService.min >= 1000) return 500;
    return 100;
  }, [selectedService]);

  const adjustQuantity = (delta: number) => {
    if (!selectedService) return;
    const current = Number.isInteger(quantity) ? quantity : selectedService.min;
    const next = Math.max(selectedService.min, Math.min(selectedService.max, current + delta));
    setQuantity(next);
  };

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

  const handleCheckout = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedService) {
      toast.error("Please select a service");
      return;
    }
    if (!isLinkValid) {
      linkInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      linkInputRef.current?.focus();
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
          packageName: `${selectedParsed?.cleanTitle || selectedService.name} (${quantity.toLocaleString()} units)`,
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
    <div className="service-topup-page relative min-h-screen w-full overflow-x-clip pt-3 pb-24 sm:py-8 text-white">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 relative z-10 space-y-4 sm:space-y-6">
        {/* Top Bar: Back Pill + Quick Platform Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
          <Link
            href="/#all-platforms"
            className="service-back-pill inline-flex items-center gap-2 self-start rounded-full px-3.5 py-2 text-xs sm:text-sm font-semibold transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to All Platforms</span>
          </Link>

          <nav
            aria-label="Switch platform"
            className="service-no-scrollbar flex items-center gap-1.5 overflow-x-auto pb-0.5 sm:pb-0"
          >
            {PLATFORM_SWITCHER.map((item) => {
              const isActive = item.slug === normPlatform;
              return (
                <Link
                  key={item.slug}
                  href={`/services/${item.slug}`}
                  className={`service-platform-chip inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-all ${
                    isActive ? "service-platform-chip--active" : ""
                  }`}
                >
                  <Image
                    src={item.icon}
                    alt={item.name}
                    width={16}
                    height={16}
                    className="w-4 h-4 rounded-sm object-contain shrink-0"
                  />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Clean Sakura Hero Banner */}
        <section className="service-page-hero relative overflow-hidden">
          <div className="service-page-hero__inner relative z-10">
            <div className="service-page-hero__icon">
              <Image
                src={coverImage}
                alt={platformName}
                fill
                quality={80}
                preload
                sizes="84px"
                className="object-contain p-1.5"
              />
            </div>
            <div className="service-page-hero__heading">
              <div className="flex items-center flex-wrap gap-1.5 sm:gap-2">
                <h1 className="service-page-hero__title">
                  {platformName} Top-Up &amp; Growth Services
                </h1>
                <span className="service-badge-featured inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] sm:text-[11px] font-bold">
                  <Sparkles className="w-3 h-3" />
                  <span>Instant KHQR</span>
                </span>
              </div>
            </div>
            <div className="service-page-hero__details">
              <p className="service-page-hero__description">
                Pick a {platformName} package below, paste your target link, and pay instantly via KHQR.
              </p>

              {/* Hero Quick Stats */}
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-2.5 sm:mt-3">
                <span className="service-hero-stat inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] sm:text-[11px] font-semibold">
                  <Sparkles className="w-3 h-3 text-pink-500 shrink-0" />
                  <span>{catalogTotal.toLocaleString()} Packages</span>
                </span>
                {lowestRate !== null && (
                  <span className="service-hero-stat inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] sm:text-[11px] font-semibold tabular-nums">
                    <Zap className="w-3 h-3 text-pink-500 shrink-0" />
                    <span>From {formatUsd(lowestRate)} / 1k</span>
                  </span>
                )}
                {refillServiceCount > 0 && (
                  <span className="service-badge-refill inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] sm:text-[11px] font-semibold">
                    <Shield className="w-3 h-3 shrink-0" />
                    <span>{refillServiceCount} Refill Protected</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Main 2-Column Interactive Order Flow */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 lg:gap-6 items-start">
          {/* Left Column: Steps 1, 2, 3 */}
          <div className="lg:col-span-8 space-y-4 sm:space-y-5">
            {/* STEP 1: Target Account Link */}
            <section
              data-topup-step="1"
              className="topup-step rounded-[18px] bg-[#0E0918] border border-violet-500/20 p-3.5 sm:p-5 space-y-3.5 shadow-lg"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="topup-step-title flex items-center gap-2 min-w-0">
                  <span className="service-step-badge flex items-center justify-center w-6 h-6 shrink-0 rounded-full text-xs font-extrabold">
                    1
                  </span>
                  <h2 className="text-sm sm:text-base font-bold text-white leading-snug">
                    Target Account Information / ព័ត៌មានតំណភ្ជាប់
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGuide((v) => !v)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-300 hover:underline transition-colors cursor-pointer shrink-0"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>How to get link?</span>
                </button>
              </div>

              {showGuide && (
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 space-y-1.5">
                  <p className="font-bold text-white">{guide.guideTitle}</p>
                  <p className="leading-relaxed">{guide.guideText}</p>
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="target-link-input" className="block text-xs font-bold text-white">
                  {guide.label} <span className="text-rose-400">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1 min-w-0">
                    <input
                      ref={linkInputRef}
                      id="target-link-input"
                      type="url"
                      value={targetLink}
                      onChange={(e) => setTargetLink(e.target.value)}
                      placeholder={guide.placeholder}
                      className="service-surface-input w-full rounded-xl pl-3.5 pr-9 py-2.5 text-xs sm:text-sm focus:outline-none transition-all"
                    />
                    {targetLink && (
                      <button
                        type="button"
                        onClick={() => setTargetLink("")}
                        aria-label="Clear link"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:text-white cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handlePasteLink}
                    className="service-pill-tab inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-bold shrink-0 cursor-pointer transition-all"
                  >
                    <ClipboardPaste className="w-3.5 h-3.5" />
                    <span>Paste</span>
                  </button>
                </div>

                {targetLink.trim() ? (
                  isLinkValid ? (
                    <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-500">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Public URL looks good and ready for delivery</span>
                    </p>
                  ) : (
                    <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-rose-500">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>Please enter a full link starting with https://</span>
                    </p>
                  )
                ) : (
                  guide.helper && (
                    <p className="text-[11px] text-slate-400 leading-relaxed">{guide.helper}</p>
                  )
                )}
              </div>
            </section>

            {/* STEP 2: Visual Package Selection & Quantity Builder */}
            <section
              data-topup-step="2"
              className="topup-step rounded-[18px] bg-[#0E0918] border border-violet-500/20 p-4 sm:p-5 space-y-4 shadow-lg"
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="topup-step-title flex items-center gap-2.5">
                  <span className="service-step-badge flex items-center justify-center w-6 h-6 rounded-full text-xs font-extrabold">
                    2
                  </span>
                  <h2 className="text-sm sm:text-base font-bold text-white">
                    Choose Service &amp; Package / ជ្រើសរើសកញ្ចប់សេវាកម្ម
                  </h2>
                </div>
                <span className="text-xs font-medium text-slate-400 tabular-nums">
                  {filteredEntries.length} packages found
                </span>
              </div>

              {catalogError ? (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs sm:text-sm text-rose-300 flex items-center gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{catalogError}</span>
                </div>
              ) : enrichedServices.length === 0 ? (
                <div className="p-6 text-center rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                  <p className="text-sm font-bold text-white">No services available right now</p>
                  <p className="text-xs text-slate-400">Please check back shortly for {platformName} services.</p>
                </div>
              ) : (
                <>
                  {/* Category Pill Tabs */}
                  <div
                    role="tablist"
                    aria-label="Service categories"
                    className="service-no-scrollbar flex items-center gap-2 overflow-x-auto pb-0.5 sm:flex-wrap"
                  >
                    {categoryTabs.map((tab) => {
                      const isActive = selectedCategory === tab.key;
                      return (
                        <button
                          key={tab.key}
                          type="button"
                          role="tab"
                          aria-selected={isActive}
                          onClick={() => setSelectedCategory(tab.key)}
                          className={`service-pill-tab inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold whitespace-nowrap cursor-pointer transition-all ${
                            isActive ? "service-pill-tab--active" : ""
                          }`}
                        >
                          <ServiceTypeIcon typeKey={tab.typeKey} className="w-3.5 h-3.5 shrink-0" />
                          <span>{tab.label}</span>
                          <span className="service-pill-count rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums">
                            {tab.count}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Search + Refill + Sort Toolbar */}
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1 min-w-0">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={`Search ${platformName} packages (e.g. real, fast, 30D refill)...`}
                        aria-label={`Search ${platformName} services`}
                        className="service-surface-input w-full rounded-xl pl-8 pr-8 py-2 text-xs focus:outline-none transition-all"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery("")}
                          aria-label="Clear search"
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-slate-400 hover:text-white cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {refillServiceCount > 0 && (
                        <button
                          type="button"
                          onClick={() => setRefillOnly((v) => !v)}
                          aria-pressed={refillOnly}
                          className={`service-refill-filter inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold whitespace-nowrap cursor-pointer transition-all ${
                            refillOnly ? "service-refill-filter--active" : ""
                          }`}
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>Refill Only</span>
                        </button>
                      )}

                      <div className="relative shrink-0">
                        <select
                          aria-label="Sort packages"
                          value={sortBy}
                          onChange={(e) => setSortBy(e.target.value as SortOption)}
                          className="service-surface-input rounded-xl pl-3 pr-7 py-2 text-xs font-semibold appearance-none cursor-pointer focus:outline-none"
                        >
                          <option value="recommended">Recommended</option>
                          <option value="price-low">Lowest Price</option>
                          <option value="price-high">Highest Price</option>
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400 pointer-events-none absolute right-2 top-1/2 -translate-y-1/2" />
                      </div>
                    </div>
                  </div>

                  {/* Selectable Package Cards Grid */}
                  {filteredEntries.length === 0 ? (
                    <div className="p-6 text-center rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
                      <p className="text-sm font-bold text-white">No packages matched your filter</p>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCategory("All");
                          setSearchQuery("");
                          setRefillOnly(false);
                        }}
                        className="service-pill-tab inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold cursor-pointer"
                      >
                        Reset Filters
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="service-pkg-scroll grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[420px] overflow-y-auto pr-1 pt-0.5">
                        {visibleEntries.map(({ item, parsed, typeKey }) => {
                          const isSelected = selectedService?.service === item.service;
                          return (
                            <button
                              key={item.service}
                              type="button"
                              onClick={() => handleSelectService(item, parsed)}
                              aria-pressed={isSelected}
                              className={`service-pkg-card group text-left rounded-2xl p-3 flex items-start gap-3 cursor-pointer ${
                                isSelected ? "service-pkg-card--selected" : ""
                              }`}
                            >
                              <div className="service-pkg-icon-box w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                                <ServiceTypeIcon typeKey={typeKey} className="w-4.5 h-4.5" />
                              </div>

                              <div className="flex-1 min-w-0 space-y-1.5">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="text-xs sm:text-[13px] font-bold leading-snug line-clamp-2">
                                      {parsed.cleanTitle}
                                    </p>
                                  </div>
                                  {isSelected && (
                                    <span className="service-selected-check w-4.5 h-4.5 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                                      <Check className="w-3 h-3 stroke-[3]" />
                                    </span>
                                  )}
                                </div>

                                {/* Compact Spec Chips */}
                                <div className="flex flex-wrap items-center gap-1">
                                  {parsed.quality && (
                                    <span className="service-badge-soft rounded-md px-1.5 py-0.5 text-[10px] font-semibold">
                                      {parsed.quality}
                                    </span>
                                  )}
                                  {parsed.speed && (
                                    <span className="service-badge-soft rounded-md px-1.5 py-0.5 text-[10px] font-semibold">
                                      {parsed.speed}
                                    </span>
                                  )}
                                  {parsed.startTime && (
                                    <span className="service-badge-soft rounded-md px-1.5 py-0.5 text-[10px] font-semibold">
                                      {parsed.startTime}
                                    </span>
                                  )}
                                  {parsed.hasRefill && parsed.refillLabel && (
                                    <span className="service-badge-refill rounded-md px-1.5 py-0.5 text-[10px] font-bold">
                                      {parsed.refillLabel}
                                    </span>
                                  )}
                                </div>

                                {/* Price & Min Row */}
                                <div className="flex items-baseline justify-between gap-2 pt-0.5">
                                  <div className="flex items-baseline gap-1 tabular-nums">
                                    <span className="service-pkg-price text-sm font-extrabold">
                                      {formatUsd(item.rate)}
                                    </span>
                                    <span className="text-[10px] text-slate-400">/ 1,000</span>
                                  </div>
                                  <span className="text-[10px] text-slate-400 tabular-nums">
                                    Min {item.min.toLocaleString()} · #{item.service}
                                  </span>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {filteredEntries.length > visibleEntries.length && (
                        <div className="flex justify-center pt-1">
                          <button
                            type="button"
                            onClick={() => setShowAllPackages(true)}
                            className="service-pill-tab inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold cursor-pointer transition-all"
                          >
                            <span>
                              Show all {filteredEntries.length.toLocaleString()} packages (
                              {(filteredEntries.length - visibleEntries.length).toLocaleString()} more)
                            </span>
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Selected Package Highlight & Quantity Packages */}
                  {selectedService && selectedParsed && (
                    <div className="pt-4 border-t border-slate-800/60 space-y-4">
                      {/* Selected Service Details Strip */}
                      <div className="service-total-panel rounded-2xl p-3.5 space-y-2.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2.5 min-w-0">
                            <div className="service-pkg-icon-box w-9 h-9 rounded-xl flex items-center justify-center shrink-0">
                              <ServiceTypeIcon typeKey={selectedTypeKey} className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs sm:text-sm font-bold text-white">
                                  {selectedParsed.cleanTitle}
                                </span>
                                <span className="service-badge-soft rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
                                  #{selectedService.service}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-slate-400">
                                {selectedParsed.quality && (
                                  <span className="inline-flex items-center gap-1">
                                    <Sparkles className="w-3 h-3 text-pink-500" />
                                    <span>{selectedParsed.quality}</span>
                                  </span>
                                )}
                                {selectedParsed.speed && (
                                  <span className="inline-flex items-center gap-1">
                                    <Gauge className="w-3 h-3 text-pink-500" />
                                    <span>{selectedParsed.speed}</span>
                                  </span>
                                )}
                                {selectedParsed.startTime && (
                                  <span className="inline-flex items-center gap-1">
                                    <Clock className="w-3 h-3 text-pink-500" />
                                    <span>{selectedParsed.startTime}</span>
                                  </span>
                                )}
                                <span>
                                  Limits: {selectedService.min.toLocaleString()} – {selectedService.max.toLocaleString()}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="text-right shrink-0 tabular-nums">
                            <span className="service-pkg-price text-base font-extrabold block leading-none">
                              {formatUsd(selectedService.rate)}
                            </span>
                            <span className="text-[10px] text-slate-400">per 1,000</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 flex-wrap pt-1 border-t border-slate-800/30 text-[11px]">
                          {selectedParsed.hasRefill ? (
                            <span className="service-badge-refill inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-bold">
                              <ShieldCheck className="w-3 h-3" />
                              <span>{selectedParsed.refillLabel || "Refill Protected"}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400">Standard delivery (No refill guarantee)</span>
                          )}

                          {selectedService.description && (
                            <button
                              type="button"
                              onClick={() => setShowFullDescription((v) => !v)}
                              className="text-xs font-semibold text-cyan-300 hover:underline cursor-pointer"
                            >
                              {showFullDescription ? "Hide package notes" : "View package notes"}
                            </button>
                          )}
                        </div>

                        {showFullDescription && selectedService.description && (
                          <p className="text-[11px] text-slate-400 leading-relaxed whitespace-pre-line pt-1">
                            {cleanUnicodeText(selectedService.description)}
                          </p>
                        )}
                      </div>

                      {/* Quantity Selector with Price Preview Tiles */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <label
                            htmlFor="custom-quantity-input"
                            className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5"
                          >
                            <Zap className="w-3.5 h-3.5 text-pink-500" />
                            <span>Choose Quantity</span>
                            <span className="text-[11px] font-normal text-slate-400 tabular-nums">
                              ({selectedService.min.toLocaleString()} – {selectedService.max.toLocaleString()})
                            </span>
                          </label>
                          <span className="service-pkg-price text-xs sm:text-sm font-extrabold tabular-nums">
                            {formatUsd(estimatedTotal)} USD
                          </span>
                        </div>

                        {/* Quick Quantity Cards showing Qty + Price */}
                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                          {presets.map((preset) => {
                            const presetCost = getCustomerTotal(selectedService.rate, preset);
                            const active = quantity === preset;
                            return (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => setQuantity(preset)}
                                className={`service-qty-tile rounded-xl px-2.5 py-2 text-center cursor-pointer tabular-nums ${
                                  active ? "service-qty-tile--active" : ""
                                }`}
                              >
                                <span className="block text-xs sm:text-[13px] font-extrabold">
                                  {preset.toLocaleString()}
                                </span>
                                <span className="service-qty-tile__price block text-[11px] font-semibold mt-0.5">
                                  {formatUsd(presetCost)}
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        {/* Stepper + Custom Quantity Input */}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => adjustQuantity(-quantityStep)}
                            aria-label={`Decrease quantity by ${quantityStep}`}
                            className="service-pill-tab w-10 h-10 rounded-xl flex items-center justify-center shrink-0 cursor-pointer"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <input
                            id="custom-quantity-input"
                            type="number"
                            min={selectedService.min}
                            max={selectedService.max}
                            step={1}
                            value={quantity || ""}
                            onChange={(e) => setQuantity(Math.floor(Number(e.target.value)))}
                            placeholder={`Enter quantity (${selectedService.min.toLocaleString()} - ${selectedService.max.toLocaleString()})`}
                            className="service-surface-input flex-1 h-10 rounded-xl px-3.5 text-center text-sm font-bold tabular-nums focus:outline-none transition-all"
                          />
                          <button
                            type="button"
                            onClick={() => adjustQuantity(quantityStep)}
                            aria-label={`Increase quantity by ${quantityStep}`}
                            className="service-pill-tab w-10 h-10 rounded-xl flex items-center justify-center shrink-0 cursor-pointer"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>

                        {!isQuantityValid && (
                          <p className="text-[11px] font-semibold text-rose-500 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span>
                              Quantity must be between {selectedService.min.toLocaleString()} and{" "}
                              {selectedService.max.toLocaleString()}.
                            </span>
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>

            {/* STEP 3: Payment Method */}
            <section
              data-topup-step="3"
              className="topup-step rounded-[18px] bg-[#0E0918] border border-violet-500/20 p-4 sm:p-5 space-y-3.5 shadow-lg"
            >
              <div className="flex items-center justify-between">
                <div className="topup-step-title flex items-center gap-2.5">
                  <span className="service-step-badge flex items-center justify-center w-6 h-6 rounded-full text-xs font-extrabold">
                    3
                  </span>
                  <h2 className="text-sm sm:text-base font-bold text-white">
                    Payment Method / វិធីសាស្ត្រទូទាត់
                  </h2>
                </div>
                <span className="text-xs text-slate-400">Scan &amp; Pay</span>
              </div>

              <div className="service-khqr-card flex min-h-[70px] items-center justify-between gap-3 rounded-2xl p-3.5 text-left">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative w-10 h-10 rounded-xl overflow-hidden bg-[#004B87] shrink-0">
                    <Image src="/images/aba-logo.webp" alt="ABA" fill sizes="40px" quality={80} loading="lazy" className="object-contain" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="payment-method-title text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                        KHQR
                      </span>
                      <span className="service-badge-featured text-[10px] font-bold px-2 py-0.5 rounded-full">
                        Instant Verification
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 block mt-0.5">
                      ABA Mobile &amp; All Cambodian Banks (KHQR)
                    </span>
                  </div>
                </div>
                <span className="service-selected-check w-5 h-5 rounded-full flex items-center justify-center shrink-0">
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </span>
              </div>
            </section>
          </div>

          {/* Right Column: Clean Order Summary */}
          <div className="min-w-0 lg:col-span-4 lg:sticky lg:top-24 space-y-4">
            <div className="topup-order-summary service-order-summary rounded-[20px] bg-[#0E0918] border border-violet-500/20 p-5 space-y-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-violet-500/20 pb-3">
                <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  <span>Order Summary</span>
                </h3>
                <span className="service-badge-refill text-[11px] font-bold px-2.5 py-0.5 rounded-full">
                  Secure Checkout
                </span>
              </div>

              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Platform</span>
                  <span className="font-bold text-white inline-flex items-center gap-1.5">
                    <Image src={coverImage} alt="" width={14} height={14} className="w-3.5 h-3.5 object-contain" />
                    <span>{platformName}</span>
                  </span>
                </div>

                <div className="flex justify-between items-start gap-3">
                  <span className="text-slate-400 shrink-0">Package</span>
                  <div className="text-right min-w-0">
                    <span className="font-bold text-white line-clamp-2 block">
                      {selectedParsed?.cleanTitle || "None selected"}
                    </span>
                    {selectedParsed?.quality && (
                      <span className="text-[11px] text-slate-400 block mt-0.5">
                        {selectedParsed.quality}
                        {selectedParsed.refillLabel ? ` · ${selectedParsed.refillLabel}` : ""}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex justify-between items-start gap-3">
                  <span className="text-slate-400 shrink-0">Target Link</span>
                  {targetLink.trim() ? (
                    <span className="font-semibold text-right truncate max-w-[200px]">
                      {targetLink.trim()}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        linkInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                        linkInputRef.current?.focus();
                      }}
                      className="text-[11px] font-semibold text-cyan-300 hover:underline cursor-pointer"
                    >
                      Enter in Step 1 →
                    </button>
                  )}
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Quantity</span>
                  <span className="font-bold text-white tabular-nums">
                    {(quantity || 0).toLocaleString()} units
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Unit Rate</span>
                  <span className="text-slate-300 tabular-nums">
                    {selectedService ? `${formatUsd(selectedService.rate)} / 1,000` : "—"}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Payment</span>
                  <span className="font-bold text-slate-900 dark:text-white">KHQR (ABA PayWay)</span>
                </div>
              </div>

              {/* Total Calculation */}
              <div className="service-total-panel rounded-2xl p-3.5 flex justify-between items-baseline">
                <div>
                  <span className="text-xs font-bold text-white block">Total Amount</span>
                  <span className="text-[10px] text-slate-400">Calculated in USD</span>
                </div>
                <span className="service-pkg-price text-2xl font-black tracking-tight tabular-nums">
                  {formatUsd(estimatedTotal)} USD
                </span>
              </div>

              {/* Checkout Button */}
              <div className="space-y-2">
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
                      <span>Continue to Payment · {formatUsd(estimatedTotal)} USD</span>
                      <ArrowRight className="w-4 h-4 stroke-[3]" />
                    </>
                  )}
                </button>

                {!isLinkValid && selectedService && (
                  <p className="text-center text-[11px] text-slate-400">
                    Paste your {platformName} link in{" "}
                    <button
                      type="button"
                      onClick={() => {
                        linkInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                        linkInputRef.current?.focus();
                      }}
                      className="font-bold text-cyan-300 hover:underline cursor-pointer"
                    >
                      Step 1
                    </button>{" "}
                    to enable payment.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ABA PayWay V2 Modal */}
      {isPayWayModalOpen && (
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
      )}
    </div>
  );
}
