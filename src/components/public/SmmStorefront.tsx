"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Image from "next/image";
import { toast } from "sonner";
import styles from "./SmmStorefront.module.css";
import {
  Sparkles,
  Search,
  ArrowRight,
  Globe,
  Loader2,
  AlertCircle,
  Check,
  ChevronLeft,
  Zap,
  ShieldCheck,
  TrendingUp,
  Users,
  Heart,
  Eye,
  MessageCircle,
  Share2,
  X,
  ChevronDown,
  ChevronRight,
  ArrowUpDown,
} from "lucide-react";
import type { AbaPayWayV2ModalData } from "@/components/public/AbaPayWayV2Modal";
import { PlatformCard, PlatformItem } from "./PlatformCard";

const AbaPayWayV2Modal = dynamic(() => import("./AbaPayWayV2Modal"), {
  loading: () => <div role="status" className="fixed inset-0 z-50 grid place-items-center bg-black/70 text-white">Preparing secure payment…</div>,
});

const STANDARD_PLATFORMS: PlatformItem[] = [
  { id: "tiktok", name: "TikTok" },
  { id: "tiktok-khmer", name: "TikTok Khmer" },
  { id: "telegram", name: "Telegram" },
  { id: "facebook", name: "Facebook" },
  { id: "instagram", name: "Instagram" },
  { id: "youtube", name: "YouTube" },
];

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

export interface PlatformOption {
  id: string;
  name: string;
  count: number;
}

type ServiceSort = "recommended" | "price-low" | "price-high" | "name";

const PAGE_SIZE = 12;
function isValidService(value: unknown): value is SmmServiceItem {
  if (!value || typeof value !== "object") return false;
  const service = value as Record<string, unknown>;
  return typeof service.service === "string" && service.service.trim().length > 0 &&
    typeof service.name === "string" && service.name.trim().length > 0 &&
    typeof service.category === "string" &&
    typeof service.rate === "number" && Number.isFinite(service.rate) && service.rate > 0 &&
    typeof service.min === "number" && Number.isInteger(service.min) && service.min > 0 &&
    typeof service.max === "number" && Number.isInteger(service.max) && service.max >= service.min;
}

function getPlatformLabel(platform?: string) {
  const labels: Record<string, string> = {
    tiktok: "TikTok",
    telegram: "Telegram",
    facebook: "Facebook",
    instagram: "Instagram",
    youtube: "YouTube",
    other: "Other",
  };
  return labels[(platform || "other").toLowerCase()] || "Other";
}

function getDeliveryLabel(service: SmmServiceItem) {
  const details = `${service.name} ${service.description || ""}`;
  const timedStart = details.match(/(?:start|delivery|processing)(?:\s+time)?\s*[:\-]?\s*(?:in|within)?\s*(\d+(?:\s*[-–]\s*\d+)?\s*(?:min(?:ute)?s?|hours?|hrs?|days?))/i);
  if (timedStart?.[1]) return `Starts in ${timedStart[1].replace(/\s+/g, " ")}`;
  if (/\b(instant|immediate)\b/i.test(details)) return "Instant start";
  if (/\b(fast|speed)\b/i.test(details)) return "Fast start";
  return "";
}

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

// Crisp Brand SVG Icons
function PlatformIcon({ platform, className = "w-4 h-4" }: { platform: string; className?: string }) {
  const norm = (platform || "other").toLowerCase();
  const platformColor = {
    all: "#F9A8D4",
    tiktok: "#25F4EE",
    telegram: "#229ED9",
    facebook: "#1877F2",
    instagram: "#E4405F",
    youtube: "#FF0033",
    other: "#38BDF8",
  }[norm] || "#6EE7B7";

  if (norm === "all") {
    return (
      <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: platformColor }}>
        <polygon points="12 2 2 7 12 12 22 7 12 2" />
        <polyline points="2 17 12 22 22 17" />
        <polyline points="2 12 12 17 22 12" />
      </svg>
    );
  }
  if (norm === "tiktok") {
    return (
      <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="currentColor" style={{ color: platformColor }}>
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.29 0 .58.04.86.12V9.42a6.34 6.34 0 0 0-6.62 6.3 6.34 6.34 0 0 0 10.82 4.49 6.27 6.27 0 0 0 1.85-4.49V8.6a8.27 8.27 0 0 0 4.8 1.54V6.69z" />
      </svg>
    );
  }
  if (norm === "telegram") {
    return (
      <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="currentColor" style={{ color: platformColor }}>
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
      </svg>
    );
  }
  if (norm === "facebook") {
    return (
      <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="currentColor" style={{ color: platformColor }}>
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    );
  }
  if (norm === "instagram") {
    return (
      <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="currentColor" style={{ color: platformColor }}>
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
      </svg>
    );
  }
  if (norm === "youtube") {
    return (
      <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="currentColor" style={{ color: platformColor }}>
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: platformColor }}>
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

// Service Action Types for Sub-Filtering
const SERVICE_TYPE_FILTERS = [
  { id: "all", label: "All Types", icon: Sparkles },
  { id: "followers", label: "Followers / Members", icon: Users },
  { id: "likes", label: "Likes & Reactions", icon: Heart },
  { id: "views", label: "Views", icon: Eye },
  { id: "comments", label: "Comments", icon: MessageCircle },
  { id: "shares", label: "Shares & Saves", icon: Share2 },
  { id: "other", label: "Other Services", icon: Sparkles },
];

export interface SmmInitialData {
  services?: SmmServiceItem[];
  platforms?: PlatformOption[];
  categories?: string[];
  catalogTotal?: number;
  total?: number;
  totalPages?: number;
}

export interface SmmStorefrontProps {
  homeLayout?: boolean;
  initialData?: SmmInitialData;
}

export default function SmmStorefront({ homeLayout = false, initialData }: SmmStorefrontProps) {
  const router = useRouter();
  const [services, setServices] = useState<SmmServiceItem[]>(() => initialData?.services || []);
  const [platforms, setPlatforms] = useState<PlatformOption[]>(() => initialData?.platforms || []);
  const [availableCategories, setAvailableCategories] = useState<string[]>(() => initialData?.categories || ["All"]);
  const [catalogTotal, setCatalogTotal] = useState<number>(() => initialData?.catalogTotal || 0);
  const [resultTotal, setResultTotal] = useState<number>(() => initialData?.total || 0);
  const [totalPages, setTotalPages] = useState<number>(() => initialData?.totalPages || 1);
  const [selectedPlatform, setSelectedPlatform] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [sortBy, setSortBy] = useState<ServiceSort>("recommended");

  const displayPlatforms = useMemo(() => {
    const counts = new Map(platforms.map((p) => [p.id.toLowerCase(), p.count]));
    return STANDARD_PLATFORMS.map((p) => ({
      ...p,
      count: typeof counts.get(p.id) === "number" ? counts.get(p.id) : p.count,
    }));
  }, [platforms]);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [selectedService, setSelectedService] = useState<SmmServiceItem | null>(() => initialData?.services?.[0] || null);
  const [searchQuery, setSearchQuery] = useState("");
  const [link, setLink] = useState("");
  const [quantity, setQuantity] = useState<number>(() => initialData?.services?.[0]?.min || 0);
  const [paymentMethod, setPaymentMethod] = useState<"aba_payway_v2" | "khqr">("aba_payway_v2");
  const [isLoading, setIsLoading] = useState<boolean>(() => !initialData?.services);
  const [loadError, setLoadError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // An empty server result is still loaded data. Remember successful queries
  // rather than a mount flag, which runs twice in development Strict Mode.
  const loadedQuery = useRef<string | null>(initialData?.services
    ? JSON.stringify([1, "all", "all", "All", "", "recommended"])
    : null);
  const orderDetailsRef = useRef<HTMLDivElement>(null);

  // PayWay V2 Modal State
  const [isPayWayModalOpen, setIsPayWayModalOpen] = useState(false);
  const [payWayModalData, setPayWayModalData] = useState<AbaPayWayV2ModalData | null>(null);

  const resetCatalogSelection = () => {
    setCurrentPage(1);
    setSelectedService(null);
    setQuantity(0);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    setSelectedService(null);
    setQuantity(0);
  };

  const handlePlatformChange = (platform: string) => {
    if (platform === selectedPlatform) return;
    setSelectedPlatform(platform);
    setSelectedCategory("All");
    resetCatalogSelection();
  };

  const handleTypeChange = (type: string) => {
    if (type === selectedType) return;
    setSelectedType(type);
    resetCatalogSelection();
  };

  const handleCategoryChange = (category: string) => {
    if (category === selectedCategory) return;
    setSelectedCategory(category);
    resetCatalogSelection();
  };

  const handleSearchChange = (search: string) => {
    setSearchQuery(search);
    resetCatalogSelection();
  };

  const handleSortChange = (sort: ServiceSort) => {
    if (sort === sortBy) return;
    setSortBy(sort);
    resetCatalogSelection();
  };

  // The API returns a bounded MongoDB page, so filtering and pagination stay fast
  // even when the supplier catalog grows.
  useEffect(() => {
    const queryKey = JSON.stringify([currentPage, selectedPlatform, selectedType, selectedCategory, searchQuery, sortBy]);
    if (loadedQuery.current === queryKey) {
      setIsLoading(false);
      setLoadError(false);
      return;
    }

    const controller = new AbortController();
    let active = true;
    const timer = window.setTimeout(() => {
      void loadServices();
    }, searchQuery.trim() ? 250 : 0);

    async function loadServices() {
      try {
        setIsLoading(true);
        setLoadError(false);
        setSelectedService(null);
        setQuantity(0);
        const params = new URLSearchParams({
          page: String(currentPage),
          limit: String(PAGE_SIZE),
          platform: selectedPlatform,
          type: selectedType,
          category: selectedCategory,
          search: searchQuery,
          sort: sortBy,
        });
        const res = await fetch(`/api/smm/services?${params}`, { signal: controller.signal, cache: "no-store" });
        const data = await res.json();
        if (!res.ok || !data.success || !Array.isArray(data.services)) {
          throw new Error(data.error || "Could not load services");
        }
        if (active && data.success && Array.isArray(data.services)) {
          const validServices: SmmServiceItem[] = (data.services as unknown[]).filter(isValidService);
          setServices(validServices);
          setPlatforms(Array.isArray(data.platforms) ? data.platforms : []);
          setAvailableCategories(Array.isArray(data.categories) ? data.categories : ["All"]);
          setCatalogTotal(Number(data.catalogTotal) || 0);
          setResultTotal(Number(data.total) || 0);
          setTotalPages(Math.max(1, Number(data.pagination?.totalPages) || 1));
          setSelectedService(validServices[0] || null);
          setQuantity(validServices[0]?.min || 0);
          loadedQuery.current = queryKey;
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("Failed to load services:", err);
        if (active) setLoadError(true);
        if (active) toast.error("Could not load services", { description: "Please refresh the page." });
      } finally {
        if (active) setIsLoading(false);
      }
    }

    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [currentPage, selectedPlatform, selectedType, selectedCategory, searchQuery, sortBy, initialData?.services]);

  const filteredServices = services;
  const visibleServices = services;
  const pageCount = totalPages;

  // Update quantity bounds when service changes
  const handleSelectService = (item: SmmServiceItem) => {
    setSelectedService(item);
    if (!Number.isInteger(quantity) || quantity < item.min) setQuantity(item.min);
    if (quantity > item.max) setQuantity(item.max);
    // Smooth scroll to order panel on mobile screens
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      orderDetailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // Preset quantity increment
  const handleAddQuantity = (increment: number) => {
    if (!selectedService) return;
    const next = Math.min(selectedService.max, (quantity || selectedService.min) + increment);
    setQuantity(next);
  };

  // Calculate total price
  const estimatedTotal = useMemo(() => {
    if (!selectedService || !quantity) return 0;
    return getCustomerTotal(selectedService.rate, quantity);
  }, [selectedService, quantity]);

  const quantityIsValid = Boolean(selectedService && Number.isInteger(quantity) &&
    quantity >= selectedService.min && quantity <= selectedService.max);
  const quantityError = selectedService
    ? !Number.isInteger(quantity) || quantity <= 0
      ? "Enter a whole number of units."
      : quantity < selectedService.min
        ? `Minimum order is ${selectedService.min.toLocaleString()} units.`
        : quantity > selectedService.max
          ? `Maximum order is ${selectedService.max.toLocaleString()} units.`
          : ""
    : "";
  const targetUrlIsValid = isValidTargetUrl(link);

  // Platform specific URL hints & placeholders
  const platformUrlMeta = useMemo(() => {
    const p = selectedService?.platform || selectedPlatform;
    if (p === "tiktok") {
      return {
        placeholder: "https://www.tiktok.com/@username (or video URL)",
        hint: "Paste your TikTok Profile link for followers, or Video link for likes/views.",
      };
    }
    if (p === "telegram") {
      return {
        placeholder: "https://t.me/yourchannel (or post URL)",
        hint: "",
      };
    }
    if (p === "facebook") {
      return {
        placeholder: "https://www.facebook.com/yourpage (or post URL)",
        hint: "Paste your Facebook Page, Profile, or public Post/Reel link.",
      };
    }
    if (p === "instagram") {
      return {
        placeholder: "https://www.instagram.com/yourprofile (or post URL)",
        hint: "Paste your Instagram profile link (ensure account is public) or post link.",
      };
    }
    if (p === "youtube") {
      return {
        placeholder: "https://www.youtube.com/@channel (or video URL)",
        hint: "Paste your YouTube channel link for subscribers, or video link for views/likes.",
      };
    }
    return {
      placeholder: "https://example.com/your-target-link",
      hint: "Paste the full public URL to your profile, post, channel, or video.",
    };
  }, [selectedService, selectedPlatform]);

  // Order submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedService) {
      toast.error("Please select a service");
      return;
    }

    if (!isValidTargetUrl(link)) {
      toast.error("Please enter a valid link", {
        description: "Enter a full public link, such as https://t.me/yourchannel.",
      });
      return;
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      toast.error("Enter a whole number of units");
      return;
    }

    if (quantity < selectedService.min) {
      toast.error(`Minimum order is ${selectedService.min.toLocaleString()} units`);
      return;
    }

    if (quantity > selectedService.max) {
      toast.error(`Maximum order is ${selectedService.max.toLocaleString()} units`);
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await fetch("/api/smm/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: selectedService.service,
          link: link.trim(),
          quantity,
          paymentMethod,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to create order");
      }

      if (paymentMethod === "aba_payway_v2" && data.qrData) {
        setPayWayModalData({
          orderNumber: data.orderNumber,
          transactionId: data.transactionId,
          amount: data.amount,
          currency: "USD",
          packageName: `${selectedService.name} (${quantity.toLocaleString()} units)`,
          gameName: selectedService.category,
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
        toast.success("Order created!", { description: `Order #${data.orderNumber}` });
        router.push(`/orders?orderNumber=${encodeURIComponent(data.orderNumber)}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error placing order";
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={homeLayout ? "w-full text-slate-100" : `${styles.page} text-slate-100 min-h-screen pb-24 pt-6`}>
      <div className={homeLayout ? "w-full" : "max-w-7xl mx-auto px-3 sm:px-6 lg:px-8"}>
        {/* Hero Section */}
        {!homeLayout ? <section className={styles.hero} aria-labelledby="services-title">
          <div className={styles.heroCopy}>
            <div className={styles.eyebrow}>
              <Sparkles aria-hidden="true" />
              <span>SOCIAL MEDIA GROWTH &amp; DIGITAL SERVICES</span>
            </div>
            <h1 id="services-title" className={styles.heroTitle}>
              Grow Your <span>Social Presence</span>
            </h1>
            <p className={styles.heroDescription}>
              Discover real services for TikTok, Telegram, Facebook, Instagram, YouTube, and more.
              Compare options, add a public link, and see your total before checkout.
            </p>
            <a href="#service-catalog" className={styles.heroLink}>
              Browse services <ArrowRight aria-hidden="true" />
            </a>
          </div>

          <div className={styles.heroFeatures} aria-label="Ordering features">
            <div className={styles.featureCard}>
              <span className={styles.featureIcon} data-tone="green"><Zap aria-hidden="true" /></span>
              <span><strong>Real Catalog Services</strong><small>Only approved database listings</small></span>
            </div>
            <div className={styles.featureCard}>
              <span className={styles.featureIcon} data-tone="cyan"><ShieldCheck aria-hidden="true" /></span>
              <span><strong>Secure Checkout</strong><small>Pay with KHQR or KHQRV2</small></span>
            </div>
            <div className={styles.featureCard}>
              <span className={styles.featureIcon} data-tone="teal"><TrendingUp aria-hidden="true" /></span>
              <span><strong>Clear Service Limits</strong><small>Min and max shown before checkout</small></span>
            </div>
          </div>
        </section> : null}

        {/* Anchor for Services navigation link */}
        {homeLayout ? <div id="services" className="scroll-mt-28" /> : null}

        {/* Platform Selector Tabs */}
        <section
          id={homeLayout ? "all-platforms" : undefined}
          className={homeLayout ? "mt-12 sm:mt-20 mb-14 sm:mb-24 scroll-mt-28" : "mb-7 scroll-mt-28"}
          aria-labelledby="all-platforms-title"
        >
          {homeLayout ? (
            <div className="storefront-catalogue-heading mb-5 sm:mb-7">
              <div>
                <h2 id="all-platforms-title" className="text-xl sm:text-2xl font-bold">
                  បណ្តាញសង្គមទាំងអស់
                </h2>
                <p className="mt-2 text-xs sm:text-sm text-slate-400 leading-relaxed">
                  ជ្រើសរើសបណ្តាញសង្គមដើម្បីស្វែងរកសេវាកម្មបង្កើនការចូលរួម និងការតាមដាន។
                </p>
              </div>
              {catalogTotal > 0 && (
                <span className="storefront-game-count">{catalogTotal.toLocaleString()} សេវាកម្ម</span>
              )}
            </div>
          ) : <h2 id="all-platforms-title" className="sr-only">All Platforms</h2>}

          <div className="storefront-grid">
            {displayPlatforms.map((p) => (
              <PlatformCard key={p.id} platform={p} />
            ))}
          </div>
        </section>

        {/* Sub-Filters: Service Types & Live Catalog (only on dedicated /services page, removed from homepage) */}
        {!homeLayout ? (
          <section id="social-services" aria-labelledby="social-services-title" className="scroll-mt-28">
          {homeLayout ? (
            <div className="mb-4 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
                  <span>Live catalog / កាតាឡុកសេវាកម្ម</span>
                </p>
                <h2 id="social-services-title" className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">Social Media Services</h2>
                <p className="mt-1 max-w-2xl text-xs sm:text-sm leading-relaxed text-slate-400">Browse real services, compare delivery details, and select an option to prepare your order.</p>
              </div>
              {selectedPlatform !== "all" && (
                <button
                  type="button"
                  onClick={() => handlePlatformChange("all")}
                  className="self-start md:self-end text-xs font-bold text-cyan-400 hover:text-cyan-300 underline underline-offset-4 cursor-pointer"
                >
                  View all platforms ({catalogTotal.toLocaleString()}) →
                </button>
              )}
            </div>
          ) : <h2 id="social-services-title" className="sr-only">Social Media Services</h2>}
        <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-2 scrollbar-none">
          {SERVICE_TYPE_FILTERS.map((f) => {
            const Icon = f.icon;
            const isActive = selectedType === f.id;
            return (
              <button
                key={f.id}
                type="button"
                data-filter-type={f.id}
                onClick={() => handleTypeChange(f.id)}
                aria-pressed={isActive}
                className={`${styles.typeFilter} flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer border ${
                  isActive
                    ? "bg-violet-500 text-white border-violet-400 shadow-md shadow-violet-500/20 font-bold"
                    : "bg-slate-900/60 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? "text-white" : "text-slate-400"}`} />
                <span>{f.label}</span>
              </button>
            );
          })}
        </div>

        {/* Main 2-Column Responsive Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Services Catalog (7 Cols) */}
          <div id="service-catalog" className="lg:col-span-7 space-y-4 scroll-mt-28">
            <div className={`${styles.catalogPanel} bg-slate-900/80 border border-slate-800 rounded-3xl p-4 sm:p-6 backdrop-blur-xl shadow-xl`}>
              {/* Header with Search and Category Dropdown */}
              <div className="space-y-3 mb-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-violet-500/15 text-violet-300 text-xs font-black">
                      1
                    </span>
                    <span>Choose a Service</span>
                  </h2>
                  <span className="text-xs text-slate-400 font-mono">
                    {resultTotal.toLocaleString()} available
                  </span>
                </div>

                {/* Filter Controls Row */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                  {/* Search Bar */}
                  <div className="sm:col-span-5 relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                    <input
                      type="text"
                      aria-label="Search services"
                      value={searchQuery}
                      onChange={(e) => handleSearchChange(e.target.value)}
                      placeholder="Search followers, likes, views..."
                      className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-colors"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        aria-label="Clear service search"
                        onClick={() => handleSearchChange("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Category Selector Dropdown */}
                  <div className="sm:col-span-4 relative">
                    <select
                      aria-label="Filter by category"
                      value={selectedCategory}
                      onChange={(e) => handleCategoryChange(e.target.value)}
                      className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-violet-500 appearance-none truncate cursor-pointer pr-8"
                    >
                      {availableCategories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                  </div>

                  <div className="sm:col-span-3 relative">
                    <ArrowUpDown aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                    <select
                      aria-label="Sort services"
                      value={sortBy}
                      onChange={(event) => handleSortChange(event.target.value as ServiceSort)}
                      className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-8 pr-2 py-2 text-xs text-slate-200 focus:outline-none focus:border-violet-500 appearance-none cursor-pointer"
                    >
                      <option value="recommended">Recommended</option>
                      <option value="price-low">Price: low to high</option>
                      <option value="price-high">Price: high to low</option>
                      <option value="name">Name: A to Z</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Service Cards Scrollable List */}
              <div className="space-y-2.5">
                {isLoading ? (
                  <div className={styles.skeletonList} role="status" aria-label="Loading service catalogue">
                    {Array.from({ length: 4 }, (_, index) => (
                      <div className={styles.skeletonCard} key={index} aria-hidden="true">
                        <span className={`${styles.skeletonLine} ${styles.skeletonShort}`} />
                        <span className={`${styles.skeletonLine} ${styles.skeletonTitleLine}`} />
                        <span className={`${styles.skeletonLine} ${styles.skeletonFooterLine}`} />
                      </div>
                    ))}
                    <span className="sr-only">Loading services…</span>
                  </div>
                ) : loadError ? (
                  <div className="py-16 text-center text-slate-400 space-y-3">
                    <AlertCircle className="w-10 h-10 mx-auto text-violet-300" />
                    <p className="text-sm font-semibold text-slate-200">Services are temporarily unavailable</p>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto">
                      Refresh the page to try loading the catalogue again.
                    </p>
                    <button
                      type="button"
                      onClick={() => window.location.reload()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-500/10 border border-violet-400/30 text-violet-200 text-xs font-bold hover:bg-violet-500/20"
                    >
                      Try again
                    </button>
                  </div>
                ) : filteredServices.length === 0 ? (
                  <div className="py-16 text-center text-slate-400 space-y-3">
                    <AlertCircle className="w-10 h-10 mx-auto text-slate-600" />
                    <p className="text-sm font-semibold text-slate-200">
                      {catalogTotal === 0 ? "No services are available right now" : "No services match your filters"}
                    </p>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      {catalogTotal === 0
                        ? "There are no approved services in the catalog yet. Please check back later."
                        : "Try another platform, category, or search term."}
                    </p>
                    {catalogTotal > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPlatform("all");
                          setSelectedType("all");
                          setSelectedCategory("All");
                          setSearchQuery("");
                          resetCatalogSelection();
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-500/10 border border-violet-500/30 text-violet-400 text-xs font-bold hover:bg-violet-500/20 cursor-pointer"
                      >
                        Reset filters
                      </button>
                    )}
                  </div>
                ) : (
                  visibleServices.map((service) => {
                    const isSelected = selectedService?.service === service.service;
                    const p = service.platform || "other";
                    const deliveryLabel = getDeliveryLabel(service);
                    const serviceDetails = `${service.name} ${service.category} ${service.description || ""}`;
                    const isNonDrop = /non[ -]?drop/i.test(serviceDetails);

                    return (
                      <button
                        type="button"
                        key={service.service}
                        data-service-id={service.service}
                        data-platform={p}
                        data-rate={service.rate}
                        aria-pressed={isSelected}
                        aria-label={`${service.name}, $${service.rate.toFixed(2)} per 1,000`}
                        onClick={() => handleSelectService(service)}
                        className={`${styles.serviceOption} group relative p-3.5 sm:p-4 rounded-2xl border transition-all duration-200 cursor-pointer flex items-center justify-between gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${
                          isSelected
                            ? "bg-violet-950/20 border-violet-500 shadow-[0_0_20px_rgba(124,58,237,0.25)] ring-1 ring-violet-500/60"
                            : "bg-slate-950/50 border-slate-800/90 hover:border-slate-700 hover:bg-slate-950/80 hover:translate-x-0.5"
                        }`}
                      >
                        {/* Left Info */}
                        <div className="min-w-0 flex-1 space-y-1.5">
                          {/* Category and Platform badge */}
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={styles.platformBadge}>
                              <PlatformIcon platform={p} className="w-2.5 h-2.5" />
                              <span>{getPlatformLabel(p)}</span>
                            </span>

                            <span className={styles.categoryBadge}>{service.category}</span>

                            {deliveryLabel && <span className={styles.detailBadge} data-kind="delivery"><Zap aria-hidden="true" />{deliveryLabel}</span>}
                            {typeof service.refill === "boolean" && <span className={styles.detailBadge} data-kind={service.refill ? "refill" : "muted"}>{service.refill ? "Refill available" : "No refill"}</span>}

                            {isNonDrop && (
                              <span className={styles.detailBadge} data-kind="non-drop">
                                Non-drop
                              </span>
                            )}
                          </div>

                          {/* Service Name */}
                          <p className="text-xs sm:text-sm font-semibold text-slate-100 group-hover:text-violet-300 transition-colors line-clamp-2">
                            {service.name}
                          </p>

                          {service.description?.trim() && (
                            <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-2">
                              {service.description.trim()}
                            </p>
                          )}

                          {/* Limits */}
                          <div className="flex items-center gap-3 text-[11px] text-slate-500 font-mono">
                            <span>Min: {service.min.toLocaleString()}</span>
                            <span>·</span>
                            <span>Max: {service.max.toLocaleString()}</span>
                          </div>
                        </div>

                        {/* Right Price & Select Service Button */}
                        <div className="text-right shrink-0 flex flex-col items-end justify-center pl-2">
                          <div className="text-base sm:text-lg font-black text-cyan-300 font-mono leading-none">
                            ${service.rate.toFixed(2)}
                          </div>
                          <span className="text-[10px] text-slate-400 mt-0.5 font-medium">per 1,000</span>

                          <div className="mt-2.5">
                            <span
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                isSelected
                                  ? "bg-gradient-to-r from-violet-500 to-cyan-500 text-slate-950 font-black shadow-md shadow-violet-500/25 ring-1 ring-cyan-300"
                                  : "bg-slate-900 border border-slate-700/80 text-slate-300 group-hover:border-cyan-400 group-hover:text-white group-hover:bg-slate-800"
                              }`}
                            >
                              {isSelected ? (
                                <>
                                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                                  <span>Selected</span>
                                </>
                              ) : (
                                <>
                                  <span>Select Service</span>
                                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                                </>
                              )}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {!isLoading && !loadError && (
                <nav className={styles.pagination} aria-label="Service pagination">
                <span>
                  {resultTotal === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}
                  –{Math.min(currentPage * PAGE_SIZE, resultTotal)} of {resultTotal.toLocaleString()}
                </span>
                <div className={styles.paginationControls}>
                  <button
                    type="button"
                    aria-label="Previous page"
                    disabled={currentPage <= 1}
                    onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                  >
                    <ChevronLeft aria-hidden="true" />
                  </button>
                  <span>Page {currentPage} of {pageCount}</span>
                  <button
                    type="button"
                    aria-label="Next page"
                    disabled={currentPage >= pageCount}
                    onClick={() => handlePageChange(Math.min(pageCount, currentPage + 1))}
                  >
                    <ChevronRight aria-hidden="true" />
                  </button>
                </div>
                </nav>
              )}
            </div>
          </div>

          {/* Right Column: Order Details & Payment (5 Cols, Sticky) */}
          <div ref={orderDetailsRef} className="lg:col-span-5 space-y-4 lg:sticky lg:top-20">
            <form
              onSubmit={handleSubmit}
              className={`${styles.orderPanel} bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 backdrop-blur-xl shadow-2xl space-y-5`}
            >
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-violet-500/20 text-violet-400 text-xs font-black">
                    2
                  </span>
                  <span>Order Details & Payment</span>
                </h2>
                <span className="text-[11px] text-violet-400 font-bold uppercase tracking-wider">
                  Secure checkout
                </span>
              </div>

              {/* Selected Service Card Box */}
              {selectedService ? (
                <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="inline-flex items-center gap-1.5 font-bold text-violet-400">
                      <PlatformIcon platform={selectedService.platform || "other"} className="w-3.5 h-3.5" />
                      <span>{getPlatformLabel(selectedService.platform)}</span>
                    </span>
                    <span className="font-mono text-violet-400 font-bold">
                      ${selectedService.rate.toFixed(2)} / 1k
                    </span>
                  </div>

                  <p className="text-xs font-semibold text-white leading-snug line-clamp-2">
                    {selectedService.name}
                  </p>

                  <div className="flex justify-between items-center text-[11px] text-slate-400 pt-1 border-t border-slate-900 font-mono">
                    <span>Min: {selectedService.min.toLocaleString()}</span>
                    <span>Max: {selectedService.max.toLocaleString()}</span>
                  </div>
                </div>
              ) : null}

              {/* Target Link Input */}
              <div className="space-y-1.5">
                <label htmlFor="target-link" className="text-xs font-bold text-slate-300 flex items-center justify-between">
                  <span>Target Link (URL)</span>
                  <span className="text-[11px] text-violet-300 font-normal">
                    Public link only
                  </span>
                </label>
                <div className="relative">
                  <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    id="target-link"
                    type="url"
                    required
                    aria-invalid={Boolean(link.trim() && !targetUrlIsValid)}
                    aria-describedby="target-link-hint target-link-error"
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    placeholder={platformUrlMeta.placeholder}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/20 transition-colors font-mono"
                  />
                </div>
                <p id="target-link-hint" className="text-[11px] text-slate-500 leading-relaxed">
                  {platformUrlMeta.hint}
                </p>
                <p id="target-link-error" className="text-[11px] text-rose-300" role="alert">
                  {link.trim() && !targetUrlIsValid ? "Enter a valid http or https URL." : ""}
                </p>
              </div>

              {/* Quantity Selector & Presets */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                  <label htmlFor="service-quantity">Quantity / ចំនួន</label>
                  {selectedService && (
                    <span id="service-quantity-limits" className="text-slate-400 font-normal font-mono text-[11px]">
                      Min {selectedService.min.toLocaleString()} · Max {selectedService.max.toLocaleString()}
                    </span>
                  )}
                </div>

                <div className="relative">
                  <input
                    id="service-quantity"
                    type="number"
                    required
                    min={selectedService?.min}
                    max={selectedService?.max}
                    step="1"
                    value={quantity || ""}
                    aria-invalid={Boolean(quantityError)}
                    aria-describedby="service-quantity-limits service-quantity-error"
                    onChange={(e) => setQuantity(e.target.value === "" ? 0 : Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-lg font-bold text-white focus:outline-none focus:border-violet-500 transition-colors font-mono"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                    units
                  </span>
                </div>
                <p id="service-quantity-error" className="min-h-4 text-[11px] text-rose-300" role="alert">
                  {quantityError}
                </p>

                {/* Quick Add Presets */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {[500, 1000, 2500, 5000, 10000].map((inc) => (
                    <button
                      key={inc}
                      type="button"
                      onClick={() => handleAddQuantity(inc)}
                      className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono font-bold text-slate-300 hover:text-violet-400 hover:border-violet-500/50 transition-colors cursor-pointer"
                    >
                      +{inc.toLocaleString()}
                    </button>
                  ))}
                  {selectedService && (
                    <button
                      type="button"
                      onClick={() => setQuantity(selectedService.min)}
                      className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-bold text-slate-400 hover:text-white transition-colors cursor-pointer"
                    >
                      Min
                    </button>
                  )}
                </div>
              </div>

              {/* Payment Method Selector */}
              <div className="space-y-2">
                <p id="payment-method-label" className="text-xs font-bold text-slate-300 flex items-center justify-between">
                  <span>Payment Gateway / វិធីបង់ប្រាក់</span>
                  <span className="text-[10px] text-slate-400">Instant Verification</span>
                </p>

                <div className="grid grid-cols-2 gap-2.5" role="group" aria-labelledby="payment-method-label">
                  <button
                    type="button"
                    aria-pressed={paymentMethod === "aba_payway_v2"}
                    onClick={() => setPaymentMethod("aba_payway_v2")}
                    className={`p-3 min-h-[76px] rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-center ${
                      paymentMethod === "aba_payway_v2"
                        ? "bg-[#004B87]/20 border-[#004B87] ring-1 ring-[#004B87] shadow-lg shadow-[#004B87]/20"
                        : "bg-slate-950 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Image src="/images/aba-logo.png" alt="ABA" width={24} height={24} className="h-6 w-6 rounded-md object-contain" />
                      <span className="payment-method-title text-xs font-bold text-slate-900 dark:text-white">KHQR V2</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    aria-pressed={paymentMethod === "khqr"}
                    onClick={() => setPaymentMethod("khqr")}
                    className={`p-3 min-h-[76px] rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-center ${
                      paymentMethod === "khqr"
                        ? "bg-rose-950/20 border-rose-500/80 ring-1 ring-rose-500/50 shadow-lg shadow-rose-500/20"
                        : "bg-slate-950 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Image src="/images/aba-logo.png" alt="ABA" width={24} height={24} className="h-6 w-6 rounded-md object-contain" />
                      <span className="payment-method-title text-xs font-bold text-slate-900 dark:text-white">KHQR</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Price Calculation Card */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800/90 space-y-2.5" aria-live="polite">
                <div className="flex justify-between items-center text-xs text-slate-400 font-mono">
                  <span>Unit Rate:</span>
                  <span>{selectedService ? `$${selectedService.rate.toFixed(2)} / 1,000` : "—"}</span>
                </div>
                <div className="flex justify-between items-center text-xs text-slate-400 font-mono">
                  <span>Order Quantity:</span>
                  <span className="text-white font-bold">{quantity.toLocaleString()} units</span>
                </div>
                <div className="border-t border-slate-800 pt-2.5 flex justify-between items-baseline">
                  <div>
                    <span className="text-xs font-bold text-white block">Total Amount:</span>
                    <span className="text-[10px] text-slate-400">USD · calculated from the selected rate</span>
                  </div>
                  <span className="text-2xl font-black text-violet-400 font-mono tracking-tight">
                    {selectedService ? `$${estimatedTotal.toFixed(2)} USD` : "—"}
                  </span>
                </div>
              </div>

              {/* Submit Checkout Button */}
              <button
                type="submit"
                disabled={isSubmitting || isLoading || loadError || !selectedService || !targetUrlIsValid || !quantityIsValid}
                className="w-full py-4 px-4 rounded-2xl bg-gradient-to-r from-violet-500 to-cyan-500 hover:from-violet-400 hover:to-cyan-400 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 text-slate-950 font-black text-sm tracking-wide transition-all shadow-xl shadow-violet-500/25 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed hover:scale-[1.01] active:scale-[0.99]"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                    <span>Processing Order...</span>
                  </>
                ) : (
                  <>
                    <span>Continue to Payment · ${estimatedTotal.toFixed(2)} USD</span>
                    <ArrowRight className="w-4 h-4 stroke-[3]" />
                  </>
                )}
              </button>

            </form>
          </div>
        </div>
        </section>
        ) : (
          <div id="social-services" className="scroll-mt-28" />
        )}

      </div>
      {/* Floating Mobile Checkout Indicator (only on dedicated /services page) */}
      {!homeLayout && selectedService ? (
        <div className="lg:hidden fixed bottom-4 left-3 right-3 z-40 bg-slate-950/95 border border-cyan-400/50 rounded-2xl p-3 shadow-2xl backdrop-blur-xl flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[10px] text-cyan-300 font-bold uppercase tracking-wider">
              <PlatformIcon platform={selectedService.platform || "other"} className="w-3 h-3" />
              <span>{getPlatformLabel(selectedService.platform)}</span>
            </div>
            <p className="text-xs font-bold text-white truncate">{selectedService.name}</p>
            <p className="text-[11px] font-mono text-cyan-300">
              ${estimatedTotal.toFixed(2)} USD ({quantity.toLocaleString()} units)
            </p>
          </div>
          <button
            type="button"
            onClick={() => orderDetailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="shrink-0 px-3.5 py-2 rounded-xl bg-gradient-to-r from-violet-500 to-cyan-500 text-slate-950 font-black text-xs shadow-lg shadow-violet-500/25 flex items-center gap-1 cursor-pointer"
          >
            <span>Checkout</span>
            <ArrowRight className="w-3.5 h-3.5 stroke-[3]" />
          </button>
        </div>
      ) : null}

      {/* ABA PayWay V2 KHQR Modal */}
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
