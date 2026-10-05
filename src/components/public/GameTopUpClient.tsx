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
    transactionId: string,
    isInstantCallback = false
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
          verifyPaymentStatus(data.orderNumber, data.transactionId, true);
        },
        onError: (err) => {
          console.warn("[AnajakPay] Plugin reported event:", err);
        },
        onClose: () => {
          // User closed checkout: keep order pending
          stopPolling();
          verifyPaymentStatus(data.orderNumber, data.transactionId, false);
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
    <div className="space-y-6">
      {/* Simplified Game Header Card */}
      <div className="relative rounded-2xl overflow-hidden p-3.5 sm:p-5 border border-border bg-card backdrop-blur-sm shadow-soft">
        <div className="flex items-center justify-between gap-3 sm:gap-6 flex-wrap sm:flex-nowrap">
          {/* Left: Game picture and name */}
          <div className="flex items-center gap-3.5 sm:gap-5 min-w-0">
            <div className="relative h-[70px] w-[70px] sm:h-[90px] sm:w-[90px] shrink-0 rounded-2xl overflow-hidden border-2 border-pink-300/40 shadow-md bg-muted group">
              <Image
                src={headerImg}
                alt={game.name}
                fill
                sizes="(min-width: 640px) 90px, 70px"
                preload
                className="object-cover object-center transition-transform duration-300 group-hover:scale-105"
                onError={() => setHeaderImg("/images/freefire.jpg")}
              />
            </div>

            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-foreground tracking-tight break-words">
                {game.name}
              </h1>
            </div>
          </div>

          {/* Right: Back to Home button */}
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold text-primary bg-accent hover:bg-pink-100 border border-pink-200 hover:border-pink-300 shadow-sm transition-all duration-200 group shrink-0"
          >
            <ArrowLeft className="h-4 w-4 text-primary group-hover:-translate-x-1 transition-transform duration-200" />
            <span>Back to Home</span>
          </Link>
        </div>
      </div>

      {/* Main Grid: Left Steps (1, 2, 3) vs Right Summary Drawer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start">
        {/* Left Column: Top-Up Process */}
        <div className="min-w-0 lg:col-span-8 space-y-5 sm:space-y-6">
          {/* STEP 1: Enter Account Information */}
          <section className="rounded-2xl border border-border bg-card backdrop-blur-sm shadow-soft p-4 sm:p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="flex items-center gap-3">
                <span className="public-button flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black text-primary-foreground shadow-md">
                  1
                </span>
                <h3 className="text-base sm:text-lg font-bold text-foreground">
                  Enter Account Information
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setShowIdGuide(!showIdGuide)}
                aria-expanded={showIdGuide}
                aria-controls="player-id-guide"
                className="flex min-h-10 items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary transition-colors cursor-pointer"
              >
                <HelpCircle className="h-4 w-4" />
                <span>How to find ID?</span>
              </button>
            </div>

            {/* Instruction Callout */}
            {showIdGuide && (
              <div id="player-id-guide" className="rounded-xl border border-pink-200 bg-accent p-4 text-sm leading-relaxed text-secondary-foreground animate-in fade-in">
                <p className="font-semibold text-primary mb-1">
                  How to locate your {game.name} ID:
                </p>
                <p>{game.instruction}</p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="player-id" className="block text-xs font-bold uppercase tracking-wider text-secondary-foreground mb-2">
                  {game.userIdLabel} <span className="text-primary">*</span>
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
                  className="w-full rounded-xl border border-input bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus-visible:outline-2 focus-visible:outline-ring focus:ring-2 focus:ring-ring/20 transition-all font-mono"
                />
              </div>

              {game.requiresServer && (
                <div>
                  <label htmlFor="server-id" className="block text-xs font-bold uppercase tracking-wider text-secondary-foreground mb-2">
                    {game.serverLabel} <span className="text-primary">*</span>
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
                    className="w-full rounded-xl border border-input bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus-visible:outline-2 focus-visible:outline-ring focus:ring-2 focus:ring-ring/20 transition-all font-mono"
                  />
                </div>
              )}
            </div>

            {/* Verification Button & Status */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={handleVerify}
                disabled={verifying || !userId.trim() || (game.requiresServer && !serverId.trim())}
                className="inline-flex items-center gap-2 rounded-xl bg-purple-50 border border-purple-200 px-4 py-2 text-xs font-bold text-brand-purple hover:bg-purple-600 hover:text-primary-foreground hover:border-purple-600 disabled:opacity-50 transition-all cursor-pointer"
              >
                {verifying ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Verifying account...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" />
                    <span>Check & Verify Nickname</span>
                  </>
                )}
              </button>

              {verifiedName && (
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg shadow-sm">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>Verified: {verifiedName}</span>
                </div>
              )}

              {verifyError && verifyStatusType === "invalid" && (
                <div className="flex items-center gap-1.5 text-xs font-semibold text-destructive bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-lg">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{verifyError}</span>
                </div>
              )}

              {verifyError && (verifyStatusType === "unsupported" || verifyStatusType === "unavailable") && (
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
                  <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                  <span>{verifyError}</span>
                </div>
              )}
            </div>
          </section>

          {/* STEP 2: Select Package */}
          <section className="relative rounded-2xl overflow-hidden border border-border shadow-soft">
            {/* Soft blurred background */}
            <div className="absolute inset-0 bg-gradient-to-br from-white via-slate-50 to-pink-50/40" />
            <div className="absolute top-0 right-0 w-72 h-72 bg-pink-300/20 rounded-full blur-3xl -translate-y-1/3 translate-x-1/3" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-300/15 rounded-full blur-3xl translate-y-1/4 -translate-x-1/4" />
            <div className="absolute top-1/2 left-1/2 w-48 h-48 bg-cyan-200/10 rounded-full blur-2xl -translate-x-1/2 -translate-y-1/2" />

            <div className="relative z-10 p-4 sm:p-6 space-y-5">
              <PackageOptions packages={initialPackages} selectedId={selectedPackage?.id} currencyName={game.currencyName} onSelect={handlePackageSelect} />
            </div>
          </section>

          {/* STEP 3: Select Payment Method */}
          <section className="rounded-2xl border border-border bg-card backdrop-blur-sm shadow-soft p-4 sm:p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="public-button flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black text-primary-foreground shadow-md">
                  3
                </span>
                <h3 className="text-base sm:text-lg font-bold text-foreground">Payment Method</h3>
              </div>
              <span className="text-[11px] font-bold text-primary bg-accent border border-pink-200 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Official Gateway
              </span>
            </div>

            {/* ONE payment card: ABA Pay / KHQR */}
            <button
              type="button"
              aria-pressed={selectedPaymentMethod === "khqr"}
              onClick={() => setSelectedPaymentMethod((current) => current === "khqr" ? null : "khqr")}
              className={`relative w-full p-4 sm:p-5 rounded-2xl border-2 bg-gradient-to-r from-pink-50 via-purple-50/50 to-white shadow-md flex items-center justify-between gap-4 text-left cursor-pointer transition-[border-color,box-shadow] ${selectedPaymentMethod === "khqr" ? "border-primary ring-2 ring-primary/20" : "border-border hover:shadow-soft"}`}
            >
              <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
                <div className="relative h-[55px] w-[55px] shrink-0 overflow-hidden rounded-xl shadow-md ring-1 ring-slate-200 bg-[#004B87]">
                  <Image
                    src="/images/aba-logo.png"
                    alt="ABA Bank"
                    width={55}
                    height={55}
                    className="h-full w-full object-cover rounded-xl"
                    loading="lazy"
                  />
                </div>
                <div className="space-y-0.5 min-w-0">
                  <div className="text-base sm:text-lg font-black text-foreground tracking-tight flex flex-wrap items-center gap-2">
                    <span className="break-words">ABA Pay / KHQR</span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-accent text-primary border border-pink-200 shrink-0">
                      KHQRcc
                    </span>
                  </div>
                  <p className="text-xs text-secondary-foreground font-medium">Secure KHQR Checkout</p>
                </div>
              </div>

              {selectedPaymentMethod === "khqr" && (
                <div className="flex shrink-0 items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center text-primary-foreground shadow-sm">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                </div>
              )}
            </button>
          </section>
        </div>

        {/* Right Column: Order Summary Drawer / Sticky Card */}
        <div className="min-w-0 lg:col-span-4 lg:sticky lg:top-32 space-y-4">
          <div className="rounded-2xl border border-pink-200/60 bg-card backdrop-blur-sm p-4 sm:p-5 space-y-4 shadow-soft">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-extrabold text-foreground">Order Summary</h3>
            </div>

            {/* Selected Game & Package */}
            <div className="space-y-2.5 text-sm [&>div]:gap-4 [&>div>span:first-child]:shrink-0 [&>div>span:last-child]:min-w-0 [&>div>span:last-child]:break-words [&>div>span:last-child]:text-right">
              <div className="flex justify-between text-secondary-foreground">
                <span className="text-muted-foreground">Game:</span>
                <span className="font-bold text-foreground">{game.name}</span>
              </div>

              <div className="flex justify-between text-secondary-foreground">
                <span className="text-muted-foreground">Package:</span>
                <span className="font-bold text-primary text-right">
                  {selectedPackage?.name || "Select a package"}
                </span>
              </div>

              <div className="flex justify-between text-secondary-foreground">
                <span className="text-muted-foreground">{game.userIdLabel}:</span>
                <span className="font-mono text-foreground">
                  {userId ? userId : <em className="text-muted-foreground">Not provided</em>}
                </span>
              </div>

              {game.requiresServer && (
                <div className="flex justify-between text-secondary-foreground">
                  <span className="text-muted-foreground">{game.serverLabel}:</span>
                  <span className="font-mono text-foreground">
                    {serverId ? serverId : <em className="text-muted-foreground">Not provided</em>}
                  </span>
                </div>
              )}

              {verifiedName && (
                <div className="flex justify-between text-secondary-foreground">
                  <span className="text-muted-foreground">Character:</span>
                  <span className="font-bold text-success">{verifiedName}</span>
                </div>
              )}

              <div className="flex justify-between text-secondary-foreground">
                <span className="text-muted-foreground">Payment:</span>
                <span className="font-bold text-foreground">
                  {selectedPaymentMethod === "khqr" ? "ABA Pay / KHQR" : "Select a payment method"}
                </span>
              </div>
            </div>

            {/* Pricing Details */}
            <div className="border-t border-border pt-3.5 space-y-1.5">
              <div className="flex justify-between items-baseline">
                <span className="text-sm font-bold text-foreground">Total Amount</span>
                <div className="text-right">
                  <span className="text-2xl font-black text-primary">
                    {selectedPackage?.sellingPrice !== null && selectedPackage?.sellingPrice !== undefined
                      ? `$${selectedPackage.sellingPrice.toFixed(2)}`
                      : "—"}
                  </span>
                  {selectedPackage?.sellingPrice !== null && selectedPackage?.sellingPrice !== undefined && (
                    <div className="text-[10px] text-muted-foreground">
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
              className="public-button w-full rounded-xl py-3.5 px-4 font-bold shadow-md shadow-pink-200/40 hover:shadow-soft hover:shadow-pink-300/40 cursor-pointer flex items-center justify-center gap-2 transition-all"
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

            <div className="flex items-center justify-center gap-2 text-[10px] text-muted-foreground pt-0.5">
              <ShieldCheck className="h-3.5 w-3.5 text-success" />
              <span>Official Direct Top-Up Delivery</span>
            </div>
          </div>
        </div>
      </div>

      {/* Checkout Confirmation Modal / Alert */}
      {checkoutComplete && activeOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 backdrop-blur-md p-4 animate-in fade-in">
          <div className="w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-3xl public-surface border border-emerald-500/50 p-6 sm:p-8 space-y-6 text-center animate-in zoom-in-95 shadow-[0_0_50px_rgba(16,185,129,0.2)]">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-success/10 text-success border border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
              <CheckCircle2 className="h-8 w-8" />
            </div>

            <div className="space-y-1">
              <span className="inline-block px-3 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-success/10 text-success border border-emerald-500/30">
                Payment Verified
              </span>
              <h3 className="text-xl font-black text-foreground">Top-Up Dispatched!</h3>
              <p className="text-xs text-secondary-foreground">
                Your payment for{" "}
                <strong className="text-primary">{activeOrder.packageName}</strong> has been confirmed and queued for direct delivery.
              </p>
            </div>

            <div className="public-order-details rounded-xl bg-card p-4 text-xs text-left space-y-2.5 border border-border font-mono">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground font-sans">Order Number:</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-primary font-bold">{activeOrder.orderNumber}</span>
                  <button
                    type="button"
                    onClick={handleCopyOrderNumber}
                    className="p-1 hover:text-foreground text-muted-foreground transition-colors"
                    aria-label="Copy order number"
                  >
                    {copiedOrderNo ? (
                      <Check className="h-3.5 w-3.5 text-success" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex justify-between">
                <span className="text-muted-foreground font-sans">Game:</span>
                <span className="text-foreground font-sans font-semibold">{game.name}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-muted-foreground font-sans">Player ID:</span>
                <span className="text-foreground font-bold">{activeOrder.playerId}</span>
              </div>

              {activeOrder.serverId && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground font-sans">Server / Zone:</span>
                  <span className="text-foreground">{activeOrder.serverId}</span>
                </div>
              )}

              {activeOrder.playerName && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground font-sans">IGN:</span>
                  <span className="text-success font-sans">{activeOrder.playerName}</span>
                </div>
              )}

              <div className="flex justify-between">
                <span className="text-muted-foreground font-sans">Amount Paid:</span>
                <span className="text-success font-bold text-sm">
                  ${activeOrder.amount.toFixed(2)} USD
                </span>
              </div>

              <div className="flex justify-between pt-1 border-t border-border">
                <span className="text-muted-foreground font-sans">Status:</span>
                <span className="text-success font-bold">PAID (CONFIRMED)</span>
              </div>

              <div className="flex justify-between">
                <span className="text-muted-foreground font-sans">Delivery:</span>
                <span className="text-primary font-sans">Automated Direct API</span>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <Link
                href={`/orders?orderNumber=${encodeURIComponent(activeOrder.orderNumber)}`}
                className="w-full rounded-xl bg-primary py-3 text-xs font-bold text-primary-foreground hover:bg-primary transition-colors shadow-[0_0_20px_rgba(255,46,147,0.4)] flex items-center justify-center gap-1.5"
              >
                <span>Track Live Order Status</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <button
                type="button"
                onClick={() => setCheckoutComplete(false)}
                className="w-full rounded-xl border border-border py-2.5 text-xs font-semibold text-secondary-foreground hover:bg-muted transition-colors cursor-pointer"
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
