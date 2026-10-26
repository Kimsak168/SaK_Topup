"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import {
  X,
  Clock,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  ShieldCheck,
  Smartphone,
} from "lucide-react";

export interface AbaPayWayV2ModalData {
  orderNumber: string;
  transactionId: string;
  amount: number;
  currency: string;
  packageName: string;
  gameName: string;
  qrImage?: string | null;
  qrPngUrl?: string | null;
  deepLink?: string | null;
  payUrl?: string | null;
  expireInSec?: number;
}

interface AbaPayWayV2ModalProps {
  isOpen: boolean;
  data: AbaPayWayV2ModalData | null;
  onClose: () => void;
  onSuccess: (result: { orderNumber: string; transactionId: string }) => void;
  onRetry?: () => void;
}

export default function AbaPayWayV2Modal({
  isOpen,
  data,
  onClose,
  onSuccess,
  onRetry,
}: AbaPayWayV2ModalProps) {
  const [timeLeft, setTimeLeft] = useState<number>(180);
  const [isExpired, setIsExpired] = useState<boolean>(false);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize countdown and timer
  useEffect(() => {
    if (!isOpen || !data) return;

    const initialSeconds = data.expireInSec && data.expireInSec > 0 ? data.expireInSec : 180;
    setTimeLeft(initialSeconds);
    setIsExpired(false);
    setIsSuccess(false);

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          setIsExpired(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen, data]);

  // Check payment status helper
  const checkPaymentStatus = useCallback(async (): Promise<boolean> => {
    if (!data?.orderNumber || !data?.transactionId) return false;

    try {
      setIsChecking(true);
      const res = await fetch("/api/payment/vngzz2/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderNumber: data.orderNumber,
          transactionId: data.transactionId,
        }),
      });

      if (!res.ok) return false;
      const json = await res.json();

      if (json.success && (json.paymentStatus === "PAID" || json.isPaid)) {
        setIsSuccess(true);
        if (pollingRef.current) clearInterval(pollingRef.current);
        if (timerRef.current) clearInterval(timerRef.current);
        toast.success("Payment verified successfully!", {
          description: "Your top-up order is now being processed.",
        });
        setTimeout(() => {
          onSuccess({
            orderNumber: data.orderNumber,
            transactionId: data.transactionId,
          });
        }, 1200);
        return true;
      }
      return false;
    } catch (err) {
      console.warn("[PayWay V2 Modal] Status check error:", err);
      return false;
    } finally {
      setIsChecking(false);
    }
  }, [data, onSuccess]);

  // Automated background polling every 3 seconds
  useEffect(() => {
    if (!isOpen || !data || isExpired || isSuccess) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      return;
    }

    pollingRef.current = setInterval(async () => {
      await checkPaymentStatus();
    }, 3000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [isOpen, data, isExpired, isSuccess, checkPaymentStatus]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isSuccess) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSuccess, onClose]);

  if (!isOpen || !data) return null;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  const amountKHR = Math.round((data.amount || 0) * 4100);

  const handleCopyOrder = async () => {
    try {
      await navigator.clipboard.writeText(data.orderNumber);
      setCopied(true);
      toast.success("Order number copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy order number");
    }
  };

  const qrSrc = data.qrImage || data.qrPngUrl || null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="payway-v2-modal-title"
    >
      <div className="relative w-full max-w-md max-h-[92vh] overflow-y-auto rounded-3xl bg-white dark:bg-[#0F172A] border border-[#CBD5E1] dark:border-[#1E293B] shadow-2xl p-5 sm:p-6 text-center space-y-4 animate-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2.5 text-left">
            <div className="relative h-9 w-9 rounded-xl bg-[#004B87] p-1.5 flex items-center justify-center shadow-xs">
              <span className="text-[11px] font-black tracking-tighter text-white uppercase">ABA</span>
            </div>
            <div>
              <h2 id="payway-v2-modal-title" className="text-sm font-black text-slate-900 dark:text-white leading-tight">
                ABA PayWay V2
              </h2>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">Direct PayWay QR & KHQR Rail</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Success State */}
        {isSuccess ? (
          <div className="py-8 space-y-4 animate-in zoom-in-95">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-500 border border-emerald-200 dark:border-emerald-800">
              <CheckCircle2 className="h-9 w-9" />
            </div>
            <div className="space-y-1">
              <span className="inline-block px-3 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                Payment Received
              </span>
              <h3 className="text-xl font-black text-slate-900 dark:text-white">Payment Confirmed!</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Fulfilling <strong className="text-emerald-600 dark:text-emerald-400">{data.packageName}</strong> now.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Order Brief */}
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-900/60 p-3 text-xs space-y-2 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">Order Ref</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{data.orderNumber}</span>
                  <button
                    type="button"
                    onClick={handleCopyOrder}
                    className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    aria-label="Copy order number"
                  >
                    {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">Package</span>
                <span className="font-bold text-slate-900 dark:text-white truncate max-w-[200px]">
                  {data.packageName}
                </span>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-slate-200 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Amount Due</span>
                <div className="text-right">
                  <span className="text-base font-black text-emerald-600 dark:text-emerald-400">
                    ${data.amount.toFixed(2)} USD
                  </span>
                  <span className="block text-[10px] text-slate-400">≈ {amountKHR.toLocaleString()} KHR</span>
                </div>
              </div>
            </div>

            {/* QR Section */}
            <div className="relative mx-auto w-full max-w-[260px] aspect-square rounded-2xl bg-white p-3 border-2 border-slate-200 dark:border-slate-700 shadow-md flex flex-col items-center justify-center overflow-hidden">
              {isExpired ? (
                <div className="space-y-3 p-4">
                  <AlertCircle className="h-10 w-10 text-amber-500 mx-auto" />
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">QR Code Expired</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                    For your security, PayWay QR codes expire after 3 minutes.
                  </p>
                  {onRetry && (
                    <button
                      type="button"
                      onClick={onRetry}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition-colors shadow-xs"
                    >
                      Generate New QR
                    </button>
                  )}
                </div>
              ) : qrSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrSrc}
                  alt={`ABA PayWay KHQR for ${data.orderNumber}`}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="space-y-2">
                  <RefreshCw className="h-8 w-8 text-slate-400 animate-spin mx-auto" />
                  <p className="text-xs text-slate-500">Generating PayWay QR...</p>
                </div>
              )}
            </div>

            {/* Countdown Timer */}
            {!isExpired && (
              <div className="flex items-center justify-center gap-1.5 text-xs">
                <Clock className="h-3.5 w-3.5 text-amber-500 animate-pulse" />
                <span className="text-slate-600 dark:text-slate-400">Expires in:</span>
                <span className="font-mono font-bold text-amber-600 dark:text-amber-400">{formattedTime}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-2 pt-1">
              {/* Deep Link Button for ABA Mobile App on phone */}
              {data.deepLink && !isExpired && (
                <a
                  href={data.deepLink}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-[#004B87] hover:bg-[#003B6B] transition-colors shadow-xs flex items-center justify-center gap-2"
                >
                  <Smartphone className="h-4 w-4" />
                  <span>Open in ABA Mobile App</span>
                  <ExternalLink className="h-3.5 w-3.5 ml-auto opacity-70" />
                </a>
              )}

              {/* Hosted Checkout Link fallback */}
              {data.payUrl && !isExpired && !data.deepLink && (
                <a
                  href={data.payUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-[#004B87] hover:bg-[#003B6B] transition-colors shadow-xs flex items-center justify-center gap-2"
                >
                  <ExternalLink className="h-4 w-4" />
                  <span>Open Official PayWay Page</span>
                </a>
              )}

              {/* Manual Check Status Button */}
              <button
                type="button"
                onClick={() => checkPaymentStatus()}
                disabled={isChecking || isExpired}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isChecking ? "animate-spin text-emerald-500" : ""}`} />
                <span>{isChecking ? "Checking Bank Rail..." : "I Have Paid / Check Status"}</span>
              </button>
            </div>

            {/* Security Assurance */}
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500 pt-1">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
              <span>Official ABA PayWay V2 Merchant Rail</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
