"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { CheckCircle2, Download } from "lucide-react";
import { toast } from "sonner";
import QRCode from "qrcode";
import { getKhqrMerchantName } from "@/lib/khqr";
import styles from "./AbaPayWayV2Modal.module.css";

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
  isLoading?: boolean;
}

interface AbaPayWayV2ModalProps {
  isOpen: boolean;
  data: AbaPayWayV2ModalData | null;
  onClose: () => void;
  onSuccess: (result: { orderNumber: string; transactionId: string }) => void;
  onRetry?: () => void;
}

export default function AbaPayWayV2Modal(props: AbaPayWayV2ModalProps) {
  if (!props.isOpen || !props.data) return null;
  return <KhqrPaymentDialog key={props.data.transactionId || props.data.orderNumber} {...props} data={props.data} />;
}

function KhqrPaymentDialog({
  data,
  onClose,
  onSuccess,
  onRetry,
}: Omit<AbaPayWayV2ModalProps, "data"> & { data: AbaPayWayV2ModalData }) {
  const initialSeconds = data.expireInSec && data.expireInSec > 0 ? data.expireInSec : 180;
  const [deadline] = useState(() => Date.now() + initialSeconds * 1000);
  const [timeLeft, setTimeLeft] = useState(initialSeconds);
  const [paymentStatus, setPaymentStatus] = useState(data.paymentStatus?.toUpperCase() || "PENDING");
  const [isSuccess, setIsSuccess] = useState(false);
  const [isCheckingPayment, setIsCheckingPayment] = useState(false);
  const [renderedQr, setRenderedQr] = useState<string | null>(data.qrImage || data.qrPngUrl || null);
  const [qrError, setQrError] = useState(false);

  const isExpired = timeLeft === 0 || paymentStatus === "EXPIRED";
  const isFailed = paymentStatus === "FAILED";
  const paymentEnded = isExpired || isFailed || isSuccess;
  // Polling continues in the background even if the 3-minute visual timer reaches 0,
  // allowing late payments (up to 7 minutes) from mobile banking apps to be caught automatically!
  const pollingFinished = isSuccess || isFailed;
  const notifySuccess = useEffectEvent(() =>
    onSuccess({ orderNumber: data.orderNumber, transactionId: data.transactionId })
  );

  const handleManualCheck = async () => {
    if (isCheckingPayment || !data.orderNumber) return;
    setIsCheckingPayment(true);
    try {
      const response = await fetch("/api/payment/vngzz2/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber: data.orderNumber, transactionId: data.transactionId }),
      });
      const result = response.ok ? await response.json() : null;
      if (result?.success) {
        const status = result.isPaid ? "PAID" : String(result.paymentStatus || "PENDING").toUpperCase();
        setPaymentStatus(status);
        if (status === "PAID") {
          setIsSuccess(true);
          toast.success("Payment received", { description: "Your order is now being processed." });
          return;
        }
        if (status === "EXPIRED") {
          toast.info("Payment not detected yet", { description: "If you already transferred in ABA, wait a few seconds and tap again." });
        }
      }
    } catch {
      toast.error("Network error", { description: "Could not reach payment server." });
    } finally {
      setIsCheckingPayment(false);
    }
  };

  const requestClose = () => {
    if (data.isLoading || data.transactionId === "generating") {
      onClose();
      return;
    }
    if (paymentStatus === "PENDING" && !paymentEnded && !window.confirm("Do you want to cancel this order?")) {
      return;
    }
    onClose();
  };

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  });

  useEffect(() => {
    if (paymentEnded) return;
    const timer = setInterval(() => {
      setTimeLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, [deadline, paymentEnded]);

  // Render QR code with the centered Bakong logo badge
  useEffect(() => {
    let cancelled = false;
    const fallback = data.qrImage || data.qrPngUrl || null;

    const render = async () => {
      try {
        if (!data.qrString) {
          if (!cancelled) {
            setRenderedQr(fallback);
            setQrError(!fallback);
          }
          return;
        }

        // Render at 840x840 with Error Correction H (30%)
        const canvas = document.createElement("canvas");
        canvas.width = 840;
        canvas.height = 840;
        await QRCode.toCanvas(canvas, data.qrString, {
          errorCorrectionLevel: "H",
          margin: 4,
          width: 840,
          color: { dark: "#000000", light: "#ffffff" },
        });

        const ctx = canvas.getContext("2d");
        if (ctx) {
          const logo = new window.Image();
          logo.crossOrigin = "anonymous";
          logo.src = "/payments/bakong-mark.png";

          await new Promise<void>((resolve) => {
            if (logo.complete && logo.naturalWidth > 0) {
              resolve();
            } else {
              logo.onload = () => resolve();
              logo.onerror = () => resolve();
            }
          });

          if (logo.complete && logo.naturalWidth > 0) {
            const size = 128;
            const radius = size / 2;
            const ring = 6;
            const cx = canvas.width / 2;
            const cy = canvas.height / 2;

            // Smooth white circular ring
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.fill();

            // Inner Bakong mark
            const innerRadius = radius - ring;
            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(logo, cx - innerRadius, cy - innerRadius, innerRadius * 2, innerRadius * 2);
            ctx.restore();
          }
        }

        const url = canvas.toDataURL("image/png");
        if (!cancelled) {
          setRenderedQr(url);
          setQrError(false);
        }
      } catch {
        if (!cancelled) {
          setRenderedQr(fallback);
          setQrError(!fallback);
        }
      }
    };

    void render();
    return () => {
      cancelled = true;
    };
  }, [data.qrString, data.qrImage, data.qrPngUrl]);

  // Payment status polling
  useEffect(() => {
    if (pollingFinished || data.isLoading || data.transactionId === "generating" || !data.orderNumber) return;
    let cancelled = false;
    let nextCheck: ReturnType<typeof setTimeout>;
    const controller = new AbortController();

    const check = async () => {
      // Allow checking up to 7 minutes after deadline in case customer switched apps to pay
      if (Date.now() >= deadline + 420_000) return;
      try {
        const response = await fetch("/api/payment/vngzz2/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderNumber: data.orderNumber, transactionId: data.transactionId }),
          signal: controller.signal,
        });
        const result = response.ok ? await response.json() : null;
        if (cancelled) return;
        if (result?.success) {
          const status = result.isPaid ? "PAID" : String(result.paymentStatus || "PENDING").toUpperCase();
          setPaymentStatus(status);
          if (status === "PAID") {
            setIsSuccess(true);
            toast.success("Payment received", { description: "Your order is now being processed." });
            return;
          }
          if (status === "FAILED") return;
        }
      } catch {
        // A temporary network failure must never be treated as a paid order.
      }
      if (!cancelled && Date.now() < deadline + 420_000) {
        nextCheck = setTimeout(check, Date.now() < deadline ? 2500 : 5000);
      }
    };

    // Auto-check immediately when customer returns from ABA mobile banking app
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && !cancelled) {
        void check();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleVisibilityChange);

    nextCheck = setTimeout(check, 2500);
    return () => {
      cancelled = true;
      clearTimeout(nextCheck);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleVisibilityChange);
      controller.abort();
    };
  }, [data.orderNumber, data.transactionId, data.isLoading, deadline, pollingFinished]);

  useEffect(() => {
    if (!isSuccess) return;
    const timer = setTimeout(() => notifySuccess(), 1200);
    return () => clearTimeout(timer);
  }, [isSuccess]);

  const currency = (data.currency || "USD").toUpperCase();
  const amount = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: currency === "KHR" ? 0 : 2,
    maximumFractionDigits: currency === "KHR" ? 0 : 2,
  }).format(data.amount);
  const merchantName = getKhqrMerchantName(data.qrString) || data.merchantName || "Asura Store";
  const formattedMinutes = Math.floor(timeLeft / 60);
  const formattedSeconds = String(timeLeft % 60).padStart(2, "0");

  const handleSaveQr = () => {
    if (!renderedQr) return;
    const link = document.createElement("a");
    link.href = renderedQr;
    link.download = `KHQR-${data.transactionId || data.orderNumber}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("QR Code downloaded!");
  };

  return (
    <div
      className={styles.abaV2Overlay}
      role="dialog"
      aria-modal="true"
      aria-label="ABA KHQR payment"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <section className={styles.abaV2Card}>
        <header className={styles.abaV2Header}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/payments/khqr-wordmark-transparent.png" alt="KHQR" />
        </header>

        {isSuccess ? (
          <div className={styles.abaV2Success} role="status">
            <CheckCircle2 size={52} aria-hidden="true" />
            <h3>Payment received</h3>
            <p>Your {data.packageName} order is being processed.</p>
          </div>
        ) : !paymentEnded && (renderedQr || data.isLoading || data.transactionId === "generating" || (!qrError && timeLeft > 0)) ? (
          <div className={styles.abaV2Body}>
            <div className={styles.abaV2Payee}>
              <div>
                <strong>{merchantName}</strong>
                <span>
                  {amount} <small>{currency}</small>
                </span>
              </div>
              <time aria-label="Time remaining">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className={styles.abaV2Loading}
                  src="/payments/loading.svg"
                  alt=""
                  aria-hidden="true"
                />
                {formattedMinutes}:{formattedSeconds}
              </time>
            </div>

            <div className={styles.abaV2Divider} />

            <div className={styles.abaV2Qr}>
              {renderedQr && !data.isLoading ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={renderedQr}
                    alt="Scan this dynamic KHQR to pay the displayed amount"
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className={styles.abaV2Mark}
                    src="/payments/bakong-mark.png"
                    alt=""
                    aria-hidden="true"
                  />
                </>
              ) : (
                <div className={styles.abaV2QrLoading}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className={styles.abaV2Loading}
                    src="/payments/loading.svg"
                    alt=""
                    style={{ width: 34, height: 34 }}
                  />
                  <span>Generating KHQR...</span>
                </div>
              )}
            </div>

            <footer className={styles.abaV2Footer}>
              {data.deepLink && (
                <a
                  href={data.deepLink}
                  className={styles.abaV2Deeplink}
                >
                  🚀 Open ABA Mobile App
                </a>
              )}
              <div className={styles.abaV2Scan}>
                <b>Scan to pay</b>
                <span>or</span>
              </div>
              <button
                type="button"
                className={styles.abaV2Download}
                onClick={handleSaveQr}
                disabled={!renderedQr || Boolean(data.isLoading)}
              >
                <Download size={16} aria-hidden="true" /> Download QR
              </button>
              <p>
                and upload to Mobile Banking app
                <br />
                supporting KHQR
              </p>
            </footer>
          </div>
        ) : (
          <div className={styles.abaV2Unavailable} role="status">
            <strong>
              {isExpired
                ? "Payment session expired"
                : isFailed
                ? "Payment unsuccessful"
                : "KHQR unavailable"}
            </strong>
            <span>Create a new secure payment session to continue.</span>
            {isExpired && (
              <button
                type="button"
                onClick={handleManualCheck}
                disabled={isCheckingPayment}
                className={styles.abaV2Download}
                style={{ width: "100%", justifyContent: "center", marginBottom: "0.5rem" }}
              >
                {isCheckingPayment ? "Checking Payment..." : "I Already Paid — Check Status"}
              </button>
            )}
            {onRetry && (
              <button type="button" onClick={onRetry}>
                Create new payment
              </button>
            )}
            <button type="button" onClick={onClose}>
              Close
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
