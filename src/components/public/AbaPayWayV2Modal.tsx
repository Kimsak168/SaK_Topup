"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Clock3, ExternalLink, LoaderCircle, X } from "lucide-react";
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
        // Encode the provider's payload as-is. Four clear modules surround the
        // matrix; no decorative badge covers the payment data.
        const url = data.qrString ? await QRCode.toDataURL(data.qrString, {
          errorCorrectionLevel: "M",
          margin: 4,
          width: 640,
          color: { dark: "#000000", light: "#ffffff" },
        }) : fallback;
        if (!cancelled) {
          setRenderedQr(url);
          setQrError(!url);
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
  const bankUrl = data.deepLink || data.payUrl;

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
                {/* Official NBC asset, stored locally to avoid external image requests. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/khqr-logo.svg" alt="KHQR" width={104} height={25} />
              </div>
              <div className={styles.details}>
                <p className={styles.merchant}>{merchantName}</p>
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
              <p className={styles.accepted}>Scan with any KHQR banking app</p>
            </div>

            <div className={styles.paymentInfo}>
              <div className={styles.status} role="status">
                <span>{!paymentEnded && <LoaderCircle size={15} className={styles.spinner} aria-hidden="true" />}{isExpired ? "Code expired" : isFailed ? "Payment unsuccessful" : "Waiting for payment"}</span>
                {!paymentEnded && <span className={timeLeft <= 30 ? styles.urgent : styles.countdown}><Clock3 size={14} aria-hidden="true" /><span aria-label={`Payment code expires in ${formattedTime}`}>{formattedTime}</span></span>}
              </div>
              <p id="khqr-instructions">{isExpired || isFailed ? "Generate a new code before making a payment." : "Open your banking app and scan the QR code above."}</p>
              {bankUrl && !paymentEnded && !qrError && <a href={bankUrl} className={styles.openBank}>Open ABA Mobile<ExternalLink size={16} aria-hidden="true" /></a>}
              <p className={styles.reference}>Order <span>{data.orderNumber}</span></p>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
