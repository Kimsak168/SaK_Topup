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
      {/* Authentic KHQR Payment Card Surface */}
      <div
        style={{ backgroundColor: "#FFFFFF", colorScheme: "light" }}
        className="relative w-full max-w-[360px] rounded-[28px] sm:rounded-[32px] shadow-2xl border border-slate-100 text-slate-900 animate-in zoom-in-95 duration-200 select-none overflow-hidden"
      >
        {isSuccess ? (
          /* Payment Success State */
          <div className="py-12 px-6 space-y-4 text-center animate-in zoom-in-95">
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
            {/* Top Red KHQR Header with Authentic Corner Chamfer */}
            <div className="relative w-full h-[62px] bg-[#E11D27] flex items-center justify-center select-none overflow-hidden">
              {/* KHQR Logo Typography */}
              <div className="flex items-center tracking-[1.5px] text-white font-black text-[24px]">
                <span className="font-sans font-black">KH</span>
                <span className="inline-flex items-center justify-center border-2 border-white rounded-[4px] w-[20px] h-[20px] mx-[2px] text-[13px] font-black font-mono">Q</span>
                <span className="font-sans font-black">R</span>
              </div>

              {/* Iconic Bottom-Right Diagonal Chamfer Cut */}
              <div
                className="absolute bottom-0 right-0 w-0 h-0 pointer-events-none"
                style={{
                  borderStyle: "solid",
                  borderWidth: "0 0 16px 22px",
                  borderColor: "transparent transparent #FFFFFF transparent",
                }}
                aria-hidden="true"
              />

              {/* Close Button Top Right */}
              <button
                type="button"
                onClick={onClose}
                className="absolute top-3 right-3 text-white/80 hover:text-white p-1 rounded-full transition-colors cursor-pointer bg-black/15 hover:bg-black/30"
                aria-label="Close KHQR payment"
              >
                <X className="h-4 w-4 stroke-[2.5]" />
              </button>
            </div>

            {/* Merchant Details & Amount Due (Left-aligned matching real KHQR) */}
            <div className="px-6 pt-4 pb-1 text-left">
              <div className="text-[14px] sm:text-[15px] font-bold text-slate-800 tracking-wide uppercase">
                {data.merchantName || "Asura Store"}
              </div>
              <div className="text-[32px] sm:text-[36px] font-black text-slate-950 tracking-tight leading-none mt-1">
                {data.amount.toFixed(2)}
                <span className="text-[14px] font-bold text-slate-500 ml-1.5 uppercase">
                  {data.currency || "USD"}
                </span>
              </div>
              {/* Fine Dashed Divider Line */}
              <div className="w-full border-b border-dashed border-slate-300 my-3" />
            </div>

            {/* QR Code Container */}
            <div className="px-6 py-1 flex items-center justify-center">
              <div
                onClick={handleOpenAbaApp}
                title={data.deepLink ? "Click to open ABA Mobile app" : undefined}
                style={{ backgroundColor: "#FFFFFF" }}
                className={`relative w-[230px] h-[230px] sm:w-[248px] sm:h-[248px] p-1 flex items-center justify-center ${
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
                        className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#E11D27] hover:bg-[#be121c] transition-colors shadow-xs cursor-pointer"
                      >
                        Generate New QR
                      </button>
                    )}
                  </div>
                ) : renderedQr ? (
                  <>
                    {/* QR Image */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={renderedQr}
                      alt={`KHQR for ${data.orderNumber}`}
                      className="w-full h-full object-contain"
                    />
                    {/* Authentic Bakong 8-pointed Lotus Star Center Emblem */}
                    <div
                      className="absolute inset-0 m-auto h-[46px] w-[46px] rounded-full bg-[#E11D27] border-[3px] border-white flex items-center justify-center shadow-md pointer-events-none select-none"
                      aria-hidden="true"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="w-[28px] h-[28px] text-white"
                        fill="currentColor"
                      >
                        {/* 8-pointed lotus star emblem */}
                        <path d="M12 2.5l1.6 3.2 3.5-.8-.7 3.5 3.5 1.1-2.4 2.5 2.4 2.5-3.5 1.1.7 3.5-3.5-.8L12 21.5l-1.6-3.2-3.5.8.7-3.5-3.5-1.1 2.4-2.5-2.4-2.5 3.5-1.1-.7-3.5 3.5.8L12 2.5z" />
                        <circle cx="12" cy="12" r="3" fill="#E11D27" stroke="#FFFFFF" strokeWidth="1.2" />
                      </svg>
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

            {/* Footer Text & Live Countdown */}
            <div className="px-6 pt-2 pb-4 text-center">
              <p className="text-[12px] font-medium text-slate-600 leading-snug">
                Scan with <span className="font-bold text-slate-800">ABA Mobile</span>, or any banking app supporting <span className="font-bold text-[#E11D27]">KHQR</span>
              </p>
              <div className="mt-2.5 flex items-center justify-between px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-100 text-[11px] font-medium text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${paymentStatus === "PAID" ? "bg-emerald-500" : "bg-amber-500 animate-pulse"}`} />
                  Payment: <strong className="text-slate-800 uppercase">{paymentStatus.replaceAll("_", " ")}</strong>
                </span>
                {!isExpired && (
                  <span className="tabular-nums font-mono font-bold text-slate-700 flex items-center gap-1">
                    <span className="text-slate-400">⏳</span> {formattedTime}
                  </span>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
