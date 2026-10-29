"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import { X, AlertCircle, RefreshCw, CheckCircle2 } from "lucide-react";
import QRCode from "qrcode";

export interface AbaPayWayV2ModalData {
  orderNumber: string;
  transactionId: string;
  amount: number;
  currency: string;
  packageName: string;
  gameName: string;
  paymentStatus?: string;
  merchantName?: string;
  qrString?: string | null;
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
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [paymentStatus, setPaymentStatus] = useState("PENDING");
  const [renderedQr, setRenderedQr] = useState<string | null>(null);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const hasAutoRedirectedRef = useRef<boolean>(false);

  // Initialize countdown and timer
  useEffect(() => {
    if (!isOpen || !data) return;

    const initialSeconds = data.expireInSec && data.expireInSec > 0 ? data.expireInSec : 180;
    setTimeLeft(initialSeconds);
    setIsExpired(false);
    setIsSuccess(false);
    setPaymentStatus(data.paymentStatus?.toUpperCase() || "PENDING");

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

  // Generate crisp QR code data URL from qrString or fallback to qrImage / qrPngUrl
  useEffect(() => {
    let isCancelled = false;
    if (!isOpen || !data) {
      setRenderedQr(null);
      return;
    }

    if (data.qrString) {
      QRCode.toDataURL(data.qrString, {
        errorCorrectionLevel: "H",
        margin: 1,
        width: 360,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
      })
        .then((url) => {
          if (!isCancelled) {
            setRenderedQr(url);
          }
        })
        .catch((err) => {
          console.warn("[KHQR V2] Failed to generate QR data URL:", err);
          if (!isCancelled) {
            setRenderedQr(data.qrImage || data.qrPngUrl || null);
          }
        });
    } else {
      setRenderedQr(data.qrImage || data.qrPngUrl || null);
    }

    return () => {
      isCancelled = true;
    };
  }, [isOpen, data]);

  // Direct ABA app navigation helper
  const handleOpenAbaApp = useCallback(() => {
    if (!data) return;
    if (data.deepLink) {
      try {
        window.location.href = data.deepLink;
      } catch (e) {
        console.warn("[PayWay V2] Failed to open deep link:", e);
        if (data.payUrl) {
          window.open(data.payUrl, "_blank", "noopener,noreferrer");
        }
      }
    } else if (data.payUrl) {
      window.open(data.payUrl, "_blank", "noopener,noreferrer");
    }
  }, [data]);

  // Automatically attempt opening ABA Mobile when opened on mobile device
  useEffect(() => {
    if (isOpen && data?.deepLink && !hasAutoRedirectedRef.current) {
      const isMobile =
        typeof window !== "undefined" &&
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      if (isMobile) {
        hasAutoRedirectedRef.current = true;
        const t = setTimeout(() => {
          handleOpenAbaApp();
        }, 300);
        return () => clearTimeout(t);
      }
    }
    if (!isOpen) {
      hasAutoRedirectedRef.current = false;
    }
  }, [isOpen, data, handleOpenAbaApp]);

  // Check payment status helper
  const checkPaymentStatus = useCallback(async (): Promise<boolean> => {
    if (!data?.orderNumber || !data?.transactionId) return false;

    try {
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
      if (json.success) {
        const actualStatus = json.isPaid
          ? "PAID"
          : typeof json.paymentStatus === "string"
            ? json.paymentStatus.toUpperCase()
            : "PENDING";
        setPaymentStatus(actualStatus);
      }

      if (json.success && (String(json.paymentStatus || "").toUpperCase() === "PAID" || json.isPaid)) {
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
    }
  }, [data, onSuccess]);

  // Automated background polling every 2 seconds
  useEffect(() => {
    if (!isOpen || !data || isExpired || isSuccess) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      return;
    }

    pollingRef.current = setInterval(async () => {
      await checkPaymentStatus();
    }, 2000);

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="khqr-modal-title"
    >
      {/* Keep this payment surface light; the storefront remaps bg-white to its dark card color. */}
      <div
        style={{ backgroundColor: "#FFFFFF", colorScheme: "light" }}
        className="relative w-full max-w-[360px] rounded-[28px] sm:rounded-[32px] p-5 sm:p-6 shadow-2xl border-0 text-slate-900 animate-in zoom-in-95 duration-200 select-none overflow-hidden"
      >
        {isSuccess ? (
          /* Payment Success State */
          <div className="py-10 px-4 space-y-4 text-center animate-in zoom-in-95">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
              <CheckCircle2 className="h-10 w-10 animate-in zoom-in" />
            </div>
            <div className="space-y-1.5">
              <span className="inline-block px-3 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-700 border border-emerald-500/30">
                Payment Received
              </span>
              <h3 className="text-xl font-black text-slate-900">
                ការទូទាត់ជោគជ័យ!
              </h3>
              <p className="text-xs text-slate-600">
                Top-up of <strong className="text-emerald-700 font-bold">{data.packageName}</strong> is now being dispatched.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Modal Header: KHQR Title, Countdown Spinner Ring & Close X */}
            <div className="flex items-center justify-between pb-2 px-0.5">
              <span
                id="khqr-modal-title"
                className="text-[20px] font-bold text-teal-700 tracking-tight font-sans"
              >
                KHQR
              </span>

              <div className="flex items-center gap-3">
                {/* Circular Countdown Ring & Time */}
                {!isExpired && (
                  <div className="flex items-center gap-1.5 font-medium text-slate-600">
                    <svg
                      className="w-[18px] h-[18px] animate-spin text-teal-700"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                    >
                      <circle
                        cx="12"
                        cy="12"
                        r="9"
                        stroke="#e2e8f0"
                        strokeWidth="2.5"
                      />
                      <path
                        d="M12 3a9 9 0 0 1 9 9"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="tabular-nums font-mono text-[13px] text-slate-600 font-semibold">
                      {formattedTime}
                    </span>
                  </div>
                )}

                {/* Cyan Close Button */}
                <button
                  type="button"
                  onClick={onClose}
                  className="text-teal-700 hover:text-teal-900 p-1 rounded-full transition-colors cursor-pointer"
                  aria-label="Close KHQR payment"
                >
                  <X className="h-5 w-5 stroke-[2.2]" />
                </button>
              </div>
            </div>

            {/* Merchant Details & Amount Due */}
            <div className="pt-2 pb-3 text-center">
              <div className="text-[14px] font-medium text-slate-600">
                {data.merchantName || "Sak Topup"}
              </div>
              <div className="flex items-baseline justify-center gap-2 mt-1.5">
                <span className="text-[36px] sm:text-[38px] font-bold text-slate-950 tracking-tight leading-none tabular-nums font-sans">
                  {data.amount.toFixed(2)}
                </span>
                <span className="text-[12px] font-semibold text-slate-600 uppercase tracking-wider">
                  {data.currency || "USD"}
                </span>
              </div>
            </div>

            {/* QR Code Container */}
            <div className="py-2 flex items-center justify-center">
              <div
                onClick={handleOpenAbaApp}
                title={data.deepLink ? "Click to open ABA Mobile app" : undefined}
                style={{ backgroundColor: "#FFFFFF" }}
                className={`relative w-[210px] h-[210px] sm:w-[224px] sm:h-[224px] rounded-2xl p-2.5 flex items-center justify-center shadow-lg ${
                  data.deepLink ? "cursor-pointer transition-transform hover:scale-[1.01]" : ""
                }`}
              >
                {isExpired ? (
                  <div className="space-y-3 p-4 text-center">
                    <AlertCircle className="h-10 w-10 text-rose-500 mx-auto" />
                    <p className="text-xs font-bold text-slate-900">QR Code Expired</p>
                    <p className="text-[11px] text-slate-500 leading-tight">
                      PayWay KHQR codes expire after 3 minutes for security.
                    </p>
                    {onRetry && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRetry();
                        }}
                        className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#E11D48] hover:bg-[#BE123C] transition-colors shadow-xs cursor-pointer"
                      >
                        Generate New QR
                      </button>
                    )}
                  </div>
                ) : renderedQr ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={renderedQr}
                      alt={`KHQR for ${data.orderNumber}`}
                      className="w-full h-full object-contain rounded-lg"
                    />
                    {/* Center Badge: Black Disc with White Currency Symbol */}
                    <div
                      className="absolute inset-0 m-auto h-10 w-10 rounded-full bg-black border-2 border-white flex items-center justify-center shadow-xs pointer-events-none select-none"
                      aria-hidden="true"
                    >
                      <span className="text-white font-bold text-[17px] leading-none">
                        {data.currency === "KHR" ? "៛" : "$"}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="space-y-2 text-center">
                    <RefreshCw className="h-8 w-8 text-slate-400 animate-spin mx-auto" />
                    <p className="text-xs text-slate-500 font-medium">Generating KHQR...</p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer Text Note */}
            <div className="pt-3 pb-1 text-center text-slate-600 font-medium text-xs sm:text-[13px] leading-relaxed">
              <p>Scan with <span className="font-semibold text-slate-700">ABA Mobile</span>, or other</p>
              <p>Mobile Banking App supporting</p>
              <p className="font-semibold text-teal-700">KHQR</p>
              <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-bold text-slate-700" aria-live="polite">
                <span className={`h-1.5 w-1.5 rounded-full ${paymentStatus === "PAID" ? "bg-emerald-500" : "bg-amber-500"}`} />
                Payment status: {paymentStatus.replaceAll("_", " ")}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
