"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Clock3, Download, ExternalLink, LoaderCircle, X } from "lucide-react";
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
  return <KhqrPaymentDialog key={props.data.transactionId} {...props} data={props.data} />;
}

function KhqrPaymentDialog({ data, onClose, onSuccess, onRetry }: Omit<AbaPayWayV2ModalProps, "data"> & { data: AbaPayWayV2ModalData }) {
  const initialSeconds = data.expireInSec && data.expireInSec > 0 ? data.expireInSec : 180;
  const [deadline] = useState(() => Date.now() + initialSeconds * 1000);
  const [timeLeft, setTimeLeft] = useState(initialSeconds);
  const [paymentStatus, setPaymentStatus] = useState(data.paymentStatus?.toUpperCase() || "PENDING");
  const [isSuccess, setIsSuccess] = useState(false);
  const [renderedQr, setRenderedQr] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const isExpired = timeLeft === 0 || paymentStatus === "EXPIRED";
  const isFailed = paymentStatus === "FAILED";
  const paymentEnded = isExpired || isFailed || isSuccess;
  const notifySuccess = useEffectEvent(() => onSuccess({ orderNumber: data.orderNumber, transactionId: data.transactionId }));

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    if (paymentEnded) return;
    const timer = setInterval(() => setTimeLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000))), 1000);
    return () => clearInterval(timer);
  }, [deadline, paymentEnded]);

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

        // Render QR with high error correction (H: 30%) on canvas so the official ABA badge can sit cleanly in the center
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 640;
        await QRCode.toCanvas(canvas, data.qrString, {
          errorCorrectionLevel: "H",
          margin: 3,
          width: 640,
          color: { dark: "#000000", light: "#ffffff" },
        });

        const ctx = canvas.getContext("2d");
        if (ctx) {
          const logo = new window.Image();
          logo.crossOrigin = "anonymous";
          logo.src = "/images/aba-logo.webp";

          await new Promise<void>((resolve) => {
            if (logo.complete && logo.naturalWidth > 0) {
              resolve();
            } else {
              logo.onload = () => resolve();
              logo.onerror = () => resolve();
            }
          });

          if (logo.complete && logo.naturalWidth > 0) {
            const logoSize = 100;
            const padding = 8;
            const badgeSize = logoSize + padding * 2;
            const x = (canvas.width - badgeSize) / 2;
            const y = (canvas.height - badgeSize) / 2;

            // Draw white rounded background badge
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            if (typeof ctx.roundRect === "function") {
              ctx.roundRect(x, y, badgeSize, badgeSize, 18);
            } else {
              ctx.rect(x, y, badgeSize, badgeSize);
            }
            ctx.fill();

            // Draw subtle border around badge
            ctx.strokeStyle = "#e2e8f0";
            ctx.lineWidth = 2;
            ctx.stroke();

            // Draw rounded ABA logo inside badge
            ctx.save();
            ctx.beginPath();
            if (typeof ctx.roundRect === "function") {
              ctx.roundRect(x + padding, y + padding, logoSize, logoSize, 12);
              ctx.clip();
            }
            ctx.drawImage(logo, x + padding, y + padding, logoSize, logoSize);
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
    return () => { cancelled = true; };
  }, [data.qrString, data.qrImage, data.qrPngUrl]);

  useEffect(() => {
    if (paymentEnded) return;
    let cancelled = false;
    let nextCheck: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const check = async () => {
      if (Date.now() >= deadline) return;
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
          if (status === "EXPIRED" || status === "FAILED") return;
        }
      } catch {
        // A temporary network failure must never be treated as a paid order.
      }
      if (!cancelled) nextCheck = setTimeout(check, 2000);
    };
    nextCheck = setTimeout(check, 2000);
    return () => {
      cancelled = true;
      clearTimeout(nextCheck);
      controller.abort();
    };
  }, [data.orderNumber, data.transactionId, deadline, paymentEnded]);

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
  const formattedTime = `${String(Math.floor(timeLeft / 60)).padStart(2, "0")}:${String(timeLeft % 60).padStart(2, "0")}`;
  const abaDeepLink = data.deepLink || (data.qrString ? `abamobilebank://ababank.com?type=payway&qrcode=${encodeURIComponent(data.qrString)}` : null);
  const bankUrl = data.payUrl || abaDeepLink;

  const handleSaveQr = () => {
    if (!renderedQr) return;
    const link = document.createElement("a");
    link.href = renderedQr;
    link.download = `ABA-KHQR-${data.orderNumber}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("QR Code saved! Open ABA Mobile to scan from gallery.");
  };

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="khqr-modal-title"
      aria-describedby={isSuccess ? undefined : "khqr-instructions"}
      onCancel={(event) => { event.preventDefault(); if (!isSuccess) onClose(); }}
    >
      <div className={styles.panel}>
        <div className={styles.toolbar}>
          <h2 id="khqr-modal-title">Scan to pay</h2>
          {!isSuccess && <button type="button" className={styles.close} onClick={onClose} aria-label="Close KHQR payment"><X size={20} /></button>}
        </div>

        {isSuccess ? (
          <div className={styles.success} role="status">
            <CheckCircle2 size={52} aria-hidden="true" />
            <h3>Payment received</h3>
            <p>Your {data.packageName} order is being processed.</p>
          </div>
        ) : (
          <>
            <div className={styles.receipt}>
              <div className={styles.brand}>
                {/* Official NBC KHQR logo */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/khqr-logo.svg" alt="KHQR" width={100} height={24} />
                <div className={styles.bankTag}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/images/aba-logo.webp" alt="ABA Bank" width={16} height={16} className={styles.bankTagLogo} />
                  <span>ABA PAY</span>
                </div>
              </div>
              <div className={styles.details}>
                <div className={styles.merchantRow}>
                  <p className={styles.merchant}>{merchantName}</p>
                  <span className={styles.verifiedBadge}>ABA Verified</span>
                </div>
                <p className={styles.amount}>{amount}<span>{currency}</span></p>
              </div>
              <div className={styles.divider} aria-hidden="true" />
              <div className={styles.qr}>
                {isExpired || isFailed || qrError ? (
                  <div className={styles.unavailable} role="status">
                    <AlertCircle size={34} aria-hidden="true" />
                    <h3>{isExpired ? "QR code expired" : isFailed ? "Payment unsuccessful" : "QR code unavailable"}</h3>
                    <p>{isExpired ? "Request a new code to continue your payment." : "Please request a new payment code and try again."}</p>
                    {onRetry && <button type="button" className={styles.retry} onClick={onRetry}>Get a new QR code</button>}
                  </div>
                ) : renderedQr ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={renderedQr} alt={`Payment QR for ${merchantName}, ${amount} ${currency}`} width={640} height={640} onError={() => setQrError(true)} />
                ) : (
                  <div className={styles.loading} role="status"><LoaderCircle size={28} /><span>Preparing payment code…</span></div>
                )}
              </div>
              <p className={styles.accepted}>Scan with ABA Mobile or any KHQR banking app</p>
            </div>

            <div className={styles.paymentInfo}>
              <div className={styles.status} role="status">
                <span>{!paymentEnded && <LoaderCircle size={15} className={styles.spinner} aria-hidden="true" />}{isExpired ? "Code expired" : isFailed ? "Payment unsuccessful" : "Waiting for payment"}</span>
                {!paymentEnded && <span className={timeLeft <= 30 ? styles.urgent : styles.countdown}><Clock3 size={14} aria-hidden="true" /><span aria-label={`Payment code expires in ${formattedTime}`}>{formattedTime}</span></span>}
              </div>
              <p id="khqr-instructions">{isExpired || isFailed ? "Generate a new code before making a payment." : "Open your banking app and scan the QR code above."}</p>
              
              {!paymentEnded && !qrError && (
                <div className={styles.actionButtons}>
                  {bankUrl && (
                    <a href={bankUrl} className={styles.openAbaBtn}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/images/aba-logo.webp" alt="ABA" width={20} height={20} />
                      <span>Open in ABA Mobile</span>
                      <ExternalLink size={15} aria-hidden="true" />
                    </a>
                  )}
                  {renderedQr && (
                    <button type="button" onClick={handleSaveQr} className={styles.saveQrBtn}>
                      <Download size={16} aria-hidden="true" />
                      <span>Save QR Code to Photos</span>
                    </button>
                  )}
                </div>
              )}

              <p className={styles.reference}>Order <span>{data.orderNumber}</span></p>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
