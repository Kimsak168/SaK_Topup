"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import {
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Check,
  Copy,
} from "lucide-react";
import { ClientGame, ClientPackage } from "@/types/game";
import { PackageOptions } from "./PackageOptions";
import { openKhqrInPageCheckout, closeKhqrInPageCheckout } from "@/lib/khqrPlugin";

interface GameTopUpClientProps {
  game: ClientGame;
  initialPackages: ClientPackage[];
}

interface ActiveOrderInfo {
  orderNumber: string;
  transactionId: string;
  amount: number;
  packageName: string;
  playerId: string;
  serverId?: string;
  playerName?: string;
  paymentStatus: string;
  fulfillmentStatus: string;
}

export function GameTopUpClient({ game, initialPackages }: GameTopUpClientProps) {
  // Account Inputs
  const [userId, setUserId] = useState("");
  const [serverId, setServerId] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifiedName, setVerifiedName] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifyStatusType, setVerifyStatusType] = useState<"success" | "invalid" | "unsupported" | "unavailable" | null>(null);
  const verificationRequestRef = useRef(0);
  const [showIdGuide, setShowIdGuide] = useState(false);
  const [headerImg, setHeaderImg] = useState<string>(() => game.image || "/images/freefire.jpg");

  // Selected Package — no automatic pre-selection; customer must click to choose
  const [selectedPackage, setSelectedPackage] = useState<ClientPackage | null>(null);
  const handlePackageSelect = useCallback((pkg: ClientPackage) => {
    setSelectedPackage((current) => current?.id === pkg.id ? null : pkg);
  }, []);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<"khqr" | null>(null);
  const isAccountReady = Boolean(userId.trim()) &&
    (!game.requiresServer || Boolean(serverId.trim())) &&
    !verifying &&
    (verifyStatusType === "success" || verifyStatusType === "unsupported" || verifyStatusType === "unavailable");


  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutComplete, setCheckoutComplete] = useState(false);
  const [activeOrder, setActiveOrder] = useState<ActiveOrderInfo | null>(null);
  const [copiedOrderNo, setCopiedOrderNo] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup polling and modal on unmount
  useEffect(() => {
    return () => {
      verificationRequestRef.current += 1;
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
      closeKhqrInPageCheckout();
    };
  }, []);

  // Player ID verification
  const handleVerify = async () => {
    const cleanUserId = userId.trim();
    const cleanServerId = serverId.trim();
    if (!cleanUserId) {
      toast.error(`Please enter your ${game.userIdLabel}`);
      return;
    }
    if (game.requiresServer && !cleanServerId) {
      toast.error(`Please enter your ${game.serverLabel}`);
      return;
    }

    const requestId = ++verificationRequestRef.current;
    setVerifying(true);
    setVerifyError(null);
    setVerifiedName(null);
    setVerifyStatusType(null);

    try {
      const res = await fetch("/api/player/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier: game.supplier,
          code: game.code,
          slug: game.slug,
          userId: cleanUserId,
          serverId: cleanServerId,
        }),
      });

      const data = await res.json();
      if (verificationRequestRef.current !== requestId) return;
      if (res.ok && data.success) {
        setVerifiedName(data.playerName || "Verified Player");
        setVerifyStatusType("success");
        toast.success(`Account verified: ${data.playerName || "Success"}`);
      } else if (data.isInvalidId) {
        setVerifyError(data.message || "Player account not found. Please double check your Player ID.");
        setVerifyStatusType("invalid");
        toast.error(data.message || "Player not found");
      } else if (data.isSupported === false) {
        setVerifyError(data.message || "Live nickname verification is not available for this game.");
        setVerifyStatusType("unsupported");
        toast.info(data.message || "Live nickname verification is not available for this game.");
      } else if (data.isUnavailable) {
        setVerifyError(data.message || "Verification service is busy. You can still proceed if your ID is correct.");
        setVerifyStatusType("unavailable");
        toast.warning(data.message || "Verification service is busy.");
      } else {
        setVerifyError(data.message || "Player ID could not be validated. Please check your ID.");
        setVerifyStatusType("invalid");
        toast.error(data.message || "Player ID could not be validated.");
      }
    } catch {
      if (verificationRequestRef.current !== requestId) return;
      setVerifyError("Network error checking player ID. You can still proceed if your ID is correct.");
      setVerifyStatusType("unavailable");
    } finally {
      if (verificationRequestRef.current === requestId) setVerifying(false);
    }
  };

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const handleCopyOrderNumber = () => {
    if (activeOrder?.orderNumber) {
      navigator.clipboard.writeText(activeOrder.orderNumber);
      setCopiedOrderNo(true);
      toast.success("Order number copied to clipboard");
      setTimeout(() => setCopiedOrderNo(false), 2000);
    }
  };

  const verifyPaymentStatus = async (
    orderNumber: string,
    transactionId: string
  ) => {
    try {
      const res = await fetch("/api/payment/anajakpay/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber, transactionId }),
      });

      if (!res.ok) return false;

      const data = await res.json();
      if (data.success && data.paymentStatus === "PAID") {
        stopPolling();
        closeKhqrInPageCheckout();
        setActiveOrder((prev) =>
          prev
            ? {
                ...prev,
                paymentStatus: "PAID",
                fulfillmentStatus: data.fulfillmentStatus || prev.fulfillmentStatus,
              }
            : null
        );
        setCheckoutComplete(true);
        toast.success("Payment verified! Your top-up is being processed.");
        return true;
      }
      return false;
    } catch (err) {
      console.error("[SakSuuu] Payment verification error:", err);
      return false;
    }
  };

  const startPaymentVerificationPolling = (orderNumber: string, transactionId: string) => {
    stopPolling();

    let attempts = 0;
    const maxAttempts = 60; // 60 attempts * 3 seconds = 180 seconds (3 minutes)

    pollingRef.current = setInterval(async () => {
      attempts += 1;
      const isPaid = await verifyPaymentStatus(orderNumber, transactionId);

      if (isPaid) {
        stopPolling();
      } else if (attempts >= maxAttempts) {
        stopPolling();
        console.log("[SakSuuu] Payment polling window completed (3 minutes). Order remains pending.");
      }
    }, 3000);
  };

  const handleCheckout = async () => {
    if (!userId.trim()) {
      toast.error(`Please provide your ${game.userIdLabel} before checking out`);
      return;
    }
    if (game.requiresServer && !serverId.trim()) {
      toast.error(`Please enter your ${game.serverLabel}`);
      return;
    }
    if (!isAccountReady) {
      toast.error("Please check and verify your account before checking out");
      return;
    }
    if (!selectedPackage) {
      toast.error("Please select a top-up package");
      return;
    }
    if (!selectedPackage.isAvailable || selectedPackage.sellingPrice === null) {
      toast.error("This package is not currently available for purchase (pending price configuration)");
      return;
    }
    if (!selectedPaymentMethod) {
      toast.error("Please select ABA Pay / KHQR before checking out");
      return;
    }

    try {
      setIsCheckingOut(true);
      const res = await fetch("/api/payment/anajakpay/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          gameSlug: game.slug || game.code,
          supplier: game.supplier,
          supplierProductCode: selectedPackage.supplierProductCode || selectedPackage.id,
          expectedPrice: selectedPackage.sellingPrice,
          playerId: userId.trim(),
          serverId: serverId.trim() || undefined,
          playerName: verifiedName || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success || !data.checkoutUrl) {
        toast.error(data.error || "Unable to initialize secure payment. Please try again.");
        return;
      }

      const newOrderInfo: ActiveOrderInfo = {
        orderNumber: data.orderNumber,
        transactionId: data.transactionId,
        amount: data.amount,
        packageName: selectedPackage.name,
        playerId: userId.trim(),
        serverId: serverId.trim() || undefined,
        playerName: verifiedName || undefined,
        paymentStatus: "PENDING",
        fulfillmentStatus: "NOT_STARTED",
      };
      setActiveOrder(newOrderInfo);

      // Open official AnajakPay checkout plugin in-page modal without leaving the game page
      const openResult = await openKhqrInPageCheckout({
        checkoutUrl: data.checkoutUrl,
        onSuccess: () => {
          // Trigger immediate server-side payment verification
          verifyPaymentStatus(data.orderNumber, data.transactionId);
        },
        onError: (err) => {
          console.warn("[AnajakPay] Plugin reported event:", err);
        },
        onClose: () => {
          // User closed checkout: keep order pending
          stopPolling();
          verifyPaymentStatus(data.orderNumber, data.transactionId);
          toast.info("Payment window closed. Your pending order is saved.");
        },
      });

      if (!openResult.opened) {
        toast.error(
          openResult.diagnostic ||
          openResult.error ||
          "Unable to open in-page KHQR checkout. Your pending order has been recorded."
        );
        return;
      }

      toast.success("KHQR payment window opened. Scan with ABA Mobile or any KHQR app.");
      // Polling interval of ~3 seconds for up to 3 minutes
      startPaymentVerificationPolling(data.orderNumber, data.transactionId);
    } catch {
      toast.error("Network error connecting to payment gateway. Please try again.");
    } finally {
      setIsCheckingOut(false);
    }
  };

  return (
    <div className="space-y-3.5 sm:space-y-6">
      {/* Simplified Game Header Card */}
      <div className="relative rounded-2xl overflow-hidden p-2.5 min-[360px]:p-3 sm:p-5 border border-[#BBF7D0] bg-white shadow-xs">
        <div className="flex items-center justify-between gap-3 sm:gap-6 flex-wrap sm:flex-nowrap">
          {/* Left: Game picture and name */}
          <div className="flex items-center gap-2.5 sm:gap-4 min-w-0">
            <div className="relative h-12 w-12 min-[360px]:h-14 min-[360px]:w-14 sm:h-[80px] sm:w-[80px] shrink-0 rounded-xl overflow-hidden border border-[#DCFCE7] shadow-xs bg-[#F0FDF4] group">
              <Image
                src={headerImg}
                alt={game.name}
                fill
                sizes="(min-width: 640px) 80px, 56px"
                preload
                className="object-cover object-center transition-transform duration-300 group-hover:scale-105"
                onError={() => setHeaderImg("/images/freefire.jpg")}
              />
            </div>

            <div className="min-w-0">
              <h1 className="text-sm min-[360px]:text-base sm:text-2xl md:text-3xl font-black text-[#172033] tracking-tight break-words">
                {game.name}
              </h1>
            </div>
          </div>

          {/* Right: Back to Home button */}
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-bold text-[#15803D] bg-[#F0FDF4] hover:bg-[#16A34A] hover:text-white hover:border-[#16A34A] active:bg-[#15803D] active:text-white border border-[#BBF7D0] shadow-xs transition-colors duration-200 group shrink-0"
          >
            <ArrowLeft className="h-3.5 w-3.5 text-[#15803D] group-hover:text-white group-hover:-translate-x-1 transition-transform duration-200" />
            <span>Back to Home</span>
          </Link>
        </div>
      </div>

      {/* Main Grid: Left Steps (1, 2, 3) vs Right Summary Drawer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-6 items-start">
        {/* Left Column: Top-Up Process */}
        <div className="min-w-0 lg:col-span-8 space-y-3 sm:space-y-5">
          {/* STEP 1: Enter Account Information */}
          <section className="rounded-2xl border border-[#BBF7D0] bg-white shadow-xs p-3 min-[360px]:p-3.5 sm:p-6 space-y-2.5 sm:space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
              <div className="flex items-center gap-2">
                <span className="flex h-5.5 w-5.5 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-md sm:rounded-lg bg-[#16A34A] text-[11px] sm:text-xs font-black text-white shadow-xs">
                  1
                </span>
                <h3 className="text-sm sm:text-lg font-bold text-[#172033]">
                  Enter Account Information
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setShowIdGuide(!showIdGuide)}
                aria-expanded={showIdGuide}
                aria-controls="player-id-guide"
                className="flex min-h-7 items-center gap-1 text-[11px] sm:text-xs font-semibold text-[#16A34A] hover:text-[#22C55E] active:text-[#15803D] transition-colors cursor-pointer"
              >
                <HelpCircle className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                <span>How to find ID?</span>
              </button>
            </div>

            {/* Instruction Callout */}
            {showIdGuide && (
              <div id="player-id-guide" className="rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] p-3 text-xs sm:text-sm leading-relaxed text-[#172033] animate-in fade-in">
                <p className="font-semibold text-[#16A34A] mb-1">
                  How to locate your {game.name} ID:
                </p>
                <p className="text-[#64748B]">{game.instruction}</p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-4">
              <div>
                <label htmlFor="player-id" className="block text-[11px] sm:text-xs font-bold uppercase tracking-wider text-[#172033] mb-1">
                  {game.userIdLabel} <span className="text-[#16A34A]">*</span>
                </label>
                <input
                  id="player-id"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={userId}
                  onChange={(e) => {
                    verificationRequestRef.current += 1;
                    setUserId(e.target.value);
                    setVerifying(false);
                    setVerifiedName(null);
                    setVerifyError(null);
                    setVerifyStatusType(null);
                  }}
                  placeholder="Enter Player ID"
                  className="h-[42px] sm:h-11 w-full rounded-xl border border-[#BBF7D0] bg-white px-3 sm:px-4 text-xs sm:text-sm text-[#172033] placeholder:text-xs sm:placeholder:text-sm placeholder:text-[#64748B] focus:border-[#22C55E] focus-visible:outline-none focus:ring-2 focus:ring-[#16A34A]/20 transition-all font-mono shadow-xs"
                />
              </div>

              {game.requiresServer && (
                <div>
                  <label htmlFor="server-id" className="block text-[11px] sm:text-xs font-bold uppercase tracking-wider text-[#172033] mb-1">
                    {game.serverLabel} <span className="text-[#16A34A]">*</span>
                  </label>
                  <input
                    id="server-id"
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    value={serverId}
                    onChange={(e) => {
                      verificationRequestRef.current += 1;
                      setServerId(e.target.value);
                      setVerifying(false);
                      setVerifiedName(null);
                      setVerifyError(null);
                      setVerifyStatusType(null);
                    }}
                    placeholder="Enter Zone ID"
                    className="h-[42px] sm:h-11 w-full rounded-xl border border-[#BBF7D0] bg-white px-3 sm:px-4 text-xs sm:text-sm text-[#172033] placeholder:text-xs sm:placeholder:text-sm placeholder:text-[#64748B] focus:border-[#22C55E] focus-visible:outline-none focus:ring-2 focus:ring-[#16A34A]/20 transition-all font-mono shadow-xs"
                  />
                </div>
              )}
            </div>

            {/* Verification Button & Status */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
              <button
                type="button"
                onClick={handleVerify}
                disabled={verifying || !userId.trim() || (game.requiresServer && !serverId.trim())}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#F0FDF4] border border-[#BBF7D0] px-3 text-xs font-bold text-[#15803D] hover:bg-[#16A34A] hover:text-white hover:border-[#16A34A] active:bg-[#15803D] active:border-[#15803D] active:text-white disabled:opacity-50 disabled:pointer-events-none transition-all cursor-pointer shadow-xs active:scale-95"
              >
                {verifying ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Verifying account...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>Check &amp; Verify Nickname</span>
                  </>
                )}
              </button>

              {verifiedName && (
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#10B981] bg-emerald-50 border border-[#10B981]/30 px-2.5 py-1.5 rounded-lg shadow-xs">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#10B981]" />
                  <span>Verified: {verifiedName}</span>
                </div>
              )}

              {verifyError && verifyStatusType === "invalid" && (
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#EF4444] bg-rose-50 border border-[#EF4444]/30 px-2.5 py-1.5 rounded-lg">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-[#EF4444]" />
                  <span>{verifyError}</span>
                </div>
              )}

              {verifyError && (verifyStatusType === "unsupported" || verifyStatusType === "unavailable") && (
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#F59E0B] bg-amber-50 border border-[#F59E0B]/30 px-2.5 py-1.5 rounded-lg">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-[#F59E0B]" />
                  <span>{verifyError}</span>
                </div>
              )}
            </div>
          </section>

          {/* STEP 2: Select Package */}
          <section className="rounded-2xl border border-[#BBF7D0] bg-white shadow-xs p-3 min-[360px]:p-3.5 sm:p-6 space-y-2.5 sm:space-y-4">
            <PackageOptions packages={initialPackages} selectedId={selectedPackage?.id} currencyName={game.currencyName} onSelect={handlePackageSelect} />
          </section>

          {/* STEP 3: Select Payment Method */}
          <section className="rounded-2xl border border-[#BBF7D0] bg-white shadow-xs p-3 min-[360px]:p-3.5 sm:p-6 space-y-2.5 sm:space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-5.5 w-5.5 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-md sm:rounded-lg bg-[#16A34A] text-[11px] sm:text-xs font-black text-white shadow-xs">
                  3
                </span>
                <h3 className="text-sm sm:text-lg font-bold text-[#172033]">Payment Method</h3>
              </div>
              <span className="text-[10px] sm:text-[11px] font-bold text-[#15803D] bg-[#F0FDF4] border border-[#BBF7D0] px-2 py-0.5 rounded-full flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#10B981] animate-pulse" />
                Official Gateway
              </span>
            </div>

            {/* ONE payment card: ABA Pay / KHQR */}
            <button
              type="button"
              aria-pressed={selectedPaymentMethod === "khqr"}
              onClick={() => setSelectedPaymentMethod((current) => current === "khqr" ? null : "khqr")}
              className={`relative w-full p-3 sm:p-4 rounded-xl border-2 shadow-xs flex items-center justify-between gap-3 text-left cursor-pointer transition-all ${selectedPaymentMethod === "khqr" ? "border-[#16A34A] bg-[#F0FDF4] ring-1 ring-[#16A34A]/30" : "border-[#BBF7D0] bg-white hover:border-[#16A34A] active:bg-[#F0FDF4]"}`}
            >
              <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
                <div className="relative h-10 w-10 sm:h-12 sm:w-12 shrink-0 overflow-hidden rounded-xl shadow-xs ring-1 ring-[#BBF7D0] bg-[#004B87]">
                  <Image
                    src="/images/aba-logo.png"
                    alt="ABA Bank"
                    width={48}
                    height={48}
                    className="h-full w-full object-cover rounded-xl"
                    loading="lazy"
                  />
                </div>
                <div className="space-y-0.5 min-w-0">
                  <div className="text-sm sm:text-base font-black text-[#172033] tracking-tight flex flex-wrap items-center gap-1.5">
                    <span className="break-words">ABA Pay / KHQR</span>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-white text-[#16A34A] border border-[#BBF7D0] shrink-0">
                      KHQR
                    </span>
                  </div>
                  <p className="text-[11px] text-[#64748B] font-medium">Scan with ABA Mobile or any KHQR app</p>
                </div>
              </div>

              {selectedPaymentMethod === "khqr" && (
                <div className="flex shrink-0 items-center gap-2">
                  <div className="h-5 w-5 rounded-full bg-[#16A34A] flex items-center justify-center text-white shadow-xs">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </div>
                </div>
              )}
            </button>
          </section>
        </div>

        {/* Right Column: Order Summary Drawer / Sticky Card */}
        <div className="min-w-0 lg:col-span-4 lg:sticky lg:top-32 space-y-3.5 sm:space-y-4">
          <div className="rounded-2xl border border-[#BBF7D0] bg-white p-3.5 sm:p-5 space-y-3.5 shadow-xs">
            <div className="flex items-center justify-between border-b border-[#DCFCE7] pb-2.5">
              <h3 className="text-sm sm:text-base font-extrabold text-[#172033]">Order Summary</h3>
            </div>

            {/* Selected Game & Package */}
            <div className="space-y-2 text-xs sm:text-sm [&>div]:gap-3 [&>div>span:first-child]:shrink-0 [&>div>span:last-child]:min-w-0 [&>div>span:last-child]:break-words [&>div>span:last-child]:text-right">
              <div className="flex justify-between text-[#1E293B]">
                <span className="text-[#64748B]">Game:</span>
                <span className="font-bold text-[#1E293B]">{game.name}</span>
              </div>

              <div className="flex justify-between text-[#1E293B]">
                <span className="text-[#64748B]">Package:</span>
                <span className="font-bold text-[#16A34A] text-right">
                  {selectedPackage?.name || "Select a package"}
                </span>
              </div>

              <div className="flex justify-between text-[#1E293B]">
                <span className="text-[#64748B]">{game.userIdLabel}:</span>
                <span className="font-mono text-[#1E293B]">
                  {userId ? userId : <em className="text-[#64748B] font-sans">Not provided</em>}
                </span>
              </div>

              {game.requiresServer && (
                <div className="flex justify-between text-[#1E293B]">
                  <span className="text-[#64748B]">{game.serverLabel}:</span>
                  <span className="font-mono text-[#1E293B]">
                    {serverId ? serverId : <em className="text-[#64748B] font-sans">Not provided</em>}
                  </span>
                </div>
              )}

              {verifiedName && (
                <div className="flex justify-between text-[#1E293B]">
                  <span className="text-[#64748B]">Character:</span>
                  <span className="font-bold text-[#10B981]">{verifiedName}</span>
                </div>
              )}

              <div className="flex justify-between text-[#1E293B]">
                <span className="text-[#64748B]">Payment:</span>
                <span className="font-bold text-[#1E293B]">
                  {selectedPaymentMethod === "khqr" ? "ABA Pay / KHQR" : "Select payment"}
                </span>
              </div>
            </div>

            {/* Pricing Details */}
            <div className="border-t border-[#DCFCE7] pt-3 space-y-1">
              <div className="flex justify-between items-baseline">
                <span className="text-xs sm:text-sm font-bold text-[#1E293B]">Total Amount</span>
                <div className="text-right">
                  <span className="text-xl sm:text-2xl font-black text-[#16A34A]">
                    {selectedPackage?.sellingPrice !== null && selectedPackage?.sellingPrice !== undefined
                      ? `$${selectedPackage.sellingPrice.toFixed(2)}`
                      : "—"}
                  </span>
                  {selectedPackage?.sellingPrice !== null && selectedPackage?.sellingPrice !== undefined && (
                    <div className="text-[10px] text-[#64748B]">
                      ≈ {Math.round(selectedPackage.sellingPrice * 4100).toLocaleString()} KHR
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* CTA Button */}
            <button
              type="button"
              onClick={handleCheckout}
              disabled={isCheckingOut || !isAccountReady || !selectedPackage || !selectedPackage.isAvailable || selectedPackage.sellingPrice === null || !selectedPaymentMethod}
              className="w-full rounded-xl py-3 px-4 font-bold text-xs sm:text-sm text-white bg-[#16A34A] hover:bg-[#22C55E] active:bg-[#15803D] disabled:opacity-50 disabled:pointer-events-none transition-colors shadow-xs cursor-pointer flex items-center justify-center gap-2 active:scale-98"
            >
              {isCheckingOut ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Processing Order...</span>
                </>
              ) : (
                <>
                  <span>Pay with ABA / KHQR</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>

            <div className="flex items-center justify-center gap-1.5 text-[10px] text-[#64748B] pt-0.5">
              <ShieldCheck className="h-3.5 w-3.5 text-[#10B981]" />
              <span>Official Direct Top-Up Delivery</span>
            </div>
          </div>
        </div>
      </div>

      {/* Checkout Confirmation Modal / Alert */}
      {checkoutComplete && activeOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-3xl bg-white border border-[#BBF7D0] p-6 sm:p-8 space-y-6 text-center animate-in zoom-in-95 shadow-xs">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-[#10B981] border border-[#10B981]/30">
              <CheckCircle2 className="h-8 w-8" />
            </div>

            <div className="space-y-1">
              <span className="inline-block px-3 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-50 text-[#10B981] border border-[#10B981]/30">
                Payment Verified
              </span>
              <h3 className="text-xl font-black text-[#1E293B]">Top-Up Dispatched!</h3>
              <p className="text-xs text-[#64748B]">
                Your payment for{" "}
                <strong className="text-[#16A34A]">{activeOrder.packageName}</strong> has been confirmed and queued for direct delivery.
              </p>
            </div>

            <div className="public-order-details rounded-xl bg-[#F0FDF4] p-4 text-xs text-left space-y-2.5 border border-[#DCFCE7] font-mono">
              <div className="flex justify-between items-center">
                <span className="text-[#64748B] font-sans">Order Number:</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[#16A34A] font-bold">{activeOrder.orderNumber}</span>
                  <button
                    type="button"
                    onClick={handleCopyOrderNumber}
                    className="p-1 text-[#64748B] hover:text-[#16A34A] active:text-[#22C55E] transition-colors"
                    aria-label="Copy order number"
                  >
                    {copiedOrderNo ? (
                      <Check className="h-3.5 w-3.5 text-[#10B981]" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex justify-between">
                <span className="text-[#64748B] font-sans">Game:</span>
                <span className="text-[#1E293B] font-sans font-semibold">{game.name}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-[#64748B] font-sans">Player ID:</span>
                <span className="text-[#1E293B] font-bold">{activeOrder.playerId}</span>
              </div>

              {activeOrder.serverId && (
                <div className="flex justify-between">
                  <span className="text-[#64748B] font-sans">Server / Zone:</span>
                  <span className="text-[#1E293B]">{activeOrder.serverId}</span>
                </div>
              )}

              {activeOrder.playerName && (
                <div className="flex justify-between">
                  <span className="text-[#64748B] font-sans">IGN:</span>
                  <span className="text-[#10B981] font-sans">{activeOrder.playerName}</span>
                </div>
              )}

              <div className="flex justify-between">
                <span className="text-[#64748B] font-sans">Amount Paid:</span>
                <span className="text-[#16A34A] font-bold text-sm">
                  ${activeOrder.amount.toFixed(2)} USD
                </span>
              </div>

              <div className="flex justify-between pt-1 border-t border-[#DCFCE7]">
                <span className="text-[#64748B] font-sans">Status:</span>
                <span className="text-[#10B981] font-bold">PAID (CONFIRMED)</span>
              </div>

              <div className="flex justify-between">
                <span className="text-[#64748B] font-sans">Delivery:</span>
                <span className="text-[#16A34A] font-sans">Automated Direct API</span>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <Link
                href={`/orders?orderNumber=${encodeURIComponent(activeOrder.orderNumber)}`}
                className="w-full rounded-xl bg-[#16A34A] hover:bg-[#22C55E] active:bg-[#15803D] py-3 text-xs font-bold text-white transition-colors shadow-xs flex items-center justify-center gap-1.5"
              >
                <span>Track Live Order Status</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <button
                type="button"
                onClick={() => setCheckoutComplete(false)}
                className="w-full rounded-xl border border-[#BBF7D0] bg-white py-2.5 text-xs font-semibold text-[#64748B] hover:text-[#16A34A] hover:bg-[#F0FDF4] active:text-[#22C55E] transition-colors shadow-xs cursor-pointer"
              >
                Close & Return to Game
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
