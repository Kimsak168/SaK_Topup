"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  X,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  Copy,
  Check,
  QrCode,
  Lock,
} from "lucide-react";

export interface IframeCheckoutModalProps {
  isOpen: boolean;
  checkoutUrl: string | null;
  orderNumber: string;
  transactionId?: string;
  amount?: number;
  gameTitle?: string;
  packageName?: string;
  onClose: () => void;
  onPaymentSuccess?: (order: { orderNumber: string; transactionId?: string }) => void;
}

export function IframeCheckoutModal({
  isOpen,
  checkoutUrl,
  orderNumber,
  transactionId,
  amount,
  gameTitle,
  packageName,
  onClose,
  onPaymentSuccess,
}: IframeCheckoutModalProps) {
  const [iframeLoading, setIframeLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Stop polling helper
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // Check payment status from backend
  const checkStatus = useCallback(async () => {
    if (!orderNumber && !transactionId) return false;
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
        setIsPaid(true);
        toast.success("Payment verified!", {
          id: `checkout-paid-${orderNumber}`,
          description: "Your top-up is now being fulfilled automatically.",
        });
        if (onPaymentSuccess) {
          onPaymentSuccess({ orderNumber, transactionId });
        }
        return true;
      }
      return false;
    } catch (err) {
      console.error("[IframeCheckoutModal] Status check error:", err);
      return false;
    }
  }, [orderNumber, transactionId, stopPolling, onPaymentSuccess]);

  // Start polling when modal opens with a valid checkout URL
  useEffect(() => {
    if (!isOpen || !checkoutUrl || isPaid) {
      stopPolling();
      return;
    }

    setIframeLoading(true);

    // Initial check
    checkStatus();

    // Poll every 3 seconds
    let attempts = 0;
    const maxAttempts = 60; // 3 minutes total
    pollingRef.current = setInterval(async () => {
      attempts += 1;
      const paid = await checkStatus();
      if (paid || attempts >= maxAttempts) {
        stopPolling();
      }
    }, 3000);

    return () => {
      stopPolling();
    };
  }, [isOpen, checkoutUrl, isPaid, checkStatus, stopPolling]);

  // Safe close with confirmation
  const handleRequestClose = useCallback(() => {
    if (isPaid) {
      onClose();
      return;
    }
    const confirmed = window.confirm(
      "Are you sure you want to close the checkout window? Your pending order will remain saved."
    );
    if (confirmed) {
      stopPolling();
      onClose();
    }
  }, [isPaid, onClose, stopPolling]);

  // Handle ESC key to safely prompt before closing
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleRequestClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleRequestClose]);

  // Copy order number
  const handleCopyOrderNumber = async () => {
    if (!orderNumber) return;
    try {
      await navigator.clipboard.writeText(orderNumber);
      setCopied(true);
      toast.success("Order number copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy order number");
    }
  };

  if (!isOpen || !checkoutUrl) {
    return null;
  }

  const priceKHR = amount ? Math.round(amount * 4100) : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="KHQR Payment Checkout Modal"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-sm p-2 sm:p-4 animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-lg sm:max-w-xl h-[92vh] sm:h-[85vh] max-h-[820px] bg-[#0E131F] border border-[#22C55E]/30 rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden text-white">
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 bg-[#121927] border-b border-[#22C55E]/20 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-xl bg-[#16A34A] text-white flex items-center justify-center shrink-0 shadow-sm">
              <QrCode className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm font-extrabold text-white tracking-tight truncate">
                  KHQR Payment
                </span>
                <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#16A34A]/20 text-[#22C55E] border border-[#22C55E]/30">
                  ABA Pay
                </span>
              </div>
              <p className="text-[11px] text-[#94A3B8] truncate">
                {gameTitle ? `${gameTitle} • ` : ""}
                {packageName || "Diamond Top-up"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {/* Open in external tab fallback */}
            <a
              href={checkoutUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open payment in new tab"
              className="p-2 text-[#94A3B8] hover:text-white hover:bg-white/5 rounded-lg transition-colors text-xs flex items-center gap-1"
              title="Open checkout in new window"
            >
              <ExternalLink className="h-4 w-4" />
            </a>

            {/* Close button */}
            <button
              type="button"
              onClick={handleRequestClose}
              aria-label="Close Checkout Modal"
              className="p-2 text-[#94A3B8] hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Order Info Bar */}
        <div className="px-4 sm:px-6 py-2 bg-[#090D16] border-b border-white/5 flex flex-wrap items-center justify-between text-xs text-[#94A3B8] shrink-0 gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] uppercase tracking-wider text-[#64748B]">Order:</span>
            <span className="font-mono font-semibold text-white">{orderNumber}</span>
            <button
              type="button"
              onClick={handleCopyOrderNumber}
              aria-label="Copy order number"
              className="p-1 text-[#64748B] hover:text-[#22C55E] transition-colors"
            >
              {copied ? <Check className="h-3 w-3 text-[#22C55E]" /> : <Copy className="h-3 w-3" />}
            </button>
          </div>

          {amount !== undefined && (
            <div className="flex items-center gap-2">
              <span className="font-bold text-[#22C55E]">${amount.toFixed(2)} USD</span>
              {priceKHR && (
                <span className="text-[11px] text-[#64748B] hidden sm:inline">
                  ({priceKHR.toLocaleString()} ៛)
                </span>
              )}
            </div>
          )}
        </div>

        {/* Modal Body / Iframe Container */}
        <div className="relative flex-1 w-full bg-white overflow-hidden">
          {/* Success Screen when Payment is Verified */}
          {isPaid ? (
            <div className="absolute inset-0 z-30 bg-[#0E131F] text-white flex flex-col items-center justify-center p-6 text-center space-y-5 animate-in fade-in">
              <div className="h-20 w-20 rounded-full bg-[#16A34A]/20 border-2 border-[#22C55E] flex items-center justify-center text-[#22C55E] animate-bounce">
                <CheckCircle2 className="h-10 w-10" />
              </div>

              <div className="space-y-1.5 max-w-sm">
                <h3 className="text-xl sm:text-2xl font-black text-white">Payment Confirmed!</h3>
                <p className="text-xs sm:text-sm text-[#94A3B8]">
                  Your KHQR payment was successfully received. Top-up fulfillment is now in progress.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#121927] border border-[#22C55E]/20 text-xs font-mono w-full max-w-sm space-y-1.5 text-left">
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Order:</span>
                  <span className="text-[#22C55E] font-bold">{orderNumber}</span>
                </div>
                {amount !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-[#64748B]">Amount:</span>
                    <span className="text-white">${amount.toFixed(2)} USD</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Status:</span>
                  <span className="text-[#22C55E] font-semibold">PAID / DISPATCHED</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5 w-full max-w-sm pt-2">
                <Link
                  href={`/orders?orderNumber=${encodeURIComponent(orderNumber)}`}
                  className="flex-1 py-3 px-4 rounded-xl bg-[#16A34A] hover:bg-[#22C55E] text-white text-xs font-bold text-center transition-colors shadow-md"
                >
                  Track Order Status &rarr;
                </Link>
                <button
                  type="button"
                  onClick={onClose}
                  className="py-3 px-4 rounded-xl border border-white/10 hover:bg-white/5 text-xs font-semibold text-[#94A3B8] hover:text-white transition-colors"
                >
                  Close Window
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Spinner while Iframe is Loading */}
              {iframeLoading && (
                <div className="absolute inset-0 z-20 bg-[#0E131F] flex flex-col items-center justify-center gap-3 text-white">
                  <div className="relative">
                    <RefreshCw className="h-8 w-8 animate-spin text-[#22C55E]" />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-xs font-semibold text-white">Loading KHQR Payment Gateway...</p>
                    <p className="text-[11px] text-[#94A3B8]">Please wait while we connect securely</p>
                  </div>
                </div>
              )}

              {/* The Payment Checkout Iframe */}
              <iframe
                src={checkoutUrl}
                title="KHQR Payment Gateway"
                className="w-full h-full border-0 bg-white"
                allow="payment; clipboard-write; camera"
                onLoad={() => setIframeLoading(false)}
              />
            </>
          )}
        </div>

        {/* Bottom Footer Info */}
        <div className="px-4 py-2.5 bg-[#121927] border-t border-[#22C55E]/20 flex items-center justify-between text-[11px] text-[#64748B] shrink-0">
          <div className="flex items-center gap-1.5 text-[#22C55E]">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Encrypted KHQR Rail • Auto Fulfilled</span>
          </div>
          <div className="flex items-center gap-1 text-[#94A3B8]">
            <Lock className="h-3 w-3 shrink-0" />
            <span>256-Bit SSL</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default IframeCheckoutModal;
