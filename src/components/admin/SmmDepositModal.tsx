"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import {
  X,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  Wallet,
  ExternalLink,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import QRCode from "qrcode";

export interface SmmDepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialAmount?: string;
}

interface DepositData {
  transaction_id: string;
  amount: string;
  service_fee: number;
  total_amount: number;
  currency: "USD" | "KHR";
  qr_string: string;
  qr_image: string;
  pay_url?: string;
  abamobile_deeplink?: string;
  expire_in_sec: number;
  current_smm_balance?: number;
}

const PRESET_AMOUNTS = ["5.00", "10.00", "20.00", "50.00", "100.00"];

export default function SmmDepositModal({
  isOpen,
  onClose,
  onSuccess,
  initialAmount = "10.00",
}: SmmDepositModalProps) {
  const [amount, setAmount] = useState<string>(initialAmount);
  const [currency, setCurrency] = useState<"USD" | "KHR">("USD");
  const [loading, setLoading] = useState<boolean>(false);
  const [depositData, setDepositData] = useState<DepositData | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(180);
  const [isExpired, setIsExpired] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [renderedQr, setRenderedQr] = useState<string | null>(null);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setDepositData(null);
      setIsSuccess(false);
      setIsExpired(false);
      setTimeLeft(180);
      setRenderedQr(null);
    } else {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [isOpen]);

  // Handle countdown timer when deposit is active
  useEffect(() => {
    if (!depositData || isSuccess) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    setTimeLeft(depositData.expire_in_sec || 180);
    setIsExpired(false);

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
  }, [depositData, isSuccess]);

  // Render QR code
  useEffect(() => {
    let isCancelled = false;
    if (!depositData) {
      setRenderedQr(null);
      return;
    }

    if (depositData.qr_string) {
      QRCode.toDataURL(depositData.qr_string, {
        errorCorrectionLevel: "H",
        margin: 1,
        width: 360,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
      })
        .then((url) => {
          if (!isCancelled) setRenderedQr(url);
        })
        .catch(() => {
          if (!isCancelled) setRenderedQr(depositData.qr_image || null);
        });
    } else {
      setRenderedQr(depositData.qr_image || null);
    }

    return () => {
      isCancelled = true;
    };
  }, [depositData]);

  // Check deposit transaction status
  const checkStatus = useCallback(async (): Promise<boolean> => {
    if (!depositData?.transaction_id) return false;

    try {
      const res = await fetch(
        `/api/v1/smm/deposit?transaction_id=${encodeURIComponent(depositData.transaction_id)}`,
        { cache: "no-store" }
      );
      if (!res.ok) return false;

      const json = await res.json();
      const state = String(json.data?.state || json.state || "").toUpperCase();
      const isPaid = Boolean(json.data?.is_paid || json.is_paid || state === "COMPLETED" || state === "PAID");

      if (isPaid) {
        setIsSuccess(true);
        if (pollingRef.current) clearInterval(pollingRef.current);
        if (timerRef.current) clearInterval(timerRef.current);
        toast.success("SMM Wallet Deposit Successful!", {
          description: `Topped up $${depositData.amount} USD. Wallet balance updated.`,
        });
        if (onSuccess) {
          onSuccess();
        }
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [depositData, onSuccess]);

  // Poll transaction status every 2.5 seconds
  useEffect(() => {
    if (!depositData || isExpired || isSuccess) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      return;
    }

    pollingRef.current = setInterval(async () => {
      await checkStatus();
    }, 2500);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [depositData, isExpired, isSuccess, checkStatus]);

  // Create deposit request
  const handleCreateDeposit = async () => {
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      toast.error("Please enter a valid deposit amount greater than $0.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/v1/smm/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: numericAmount.toFixed(2),
          currency,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to create SMM deposit KHQR.");
      }

      setDepositData(json.data);
      toast.success("Deposit KHQR generated! Scan with any KHQR banking app.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Deposit request failed.");
    } finally {
      setLoading(false);
    }
  };

  // Open ABA Mobile app
  const handleOpenAbaApp = () => {
    if (!depositData) return;
    if (depositData.abamobile_deeplink) {
      try {
        window.location.href = depositData.abamobile_deeplink;
      } catch {
        if (depositData.pay_url) window.open(depositData.pay_url, "_blank");
      }
    } else if (depositData.pay_url) {
      window.open(depositData.pay_url, "_blank");
    }
  };

  if (!isOpen) return null;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="smm-deposit-modal-title"
    >
      <div className="relative w-full max-w-[400px] overflow-hidden rounded-[28px] border border-[#243047] bg-[#0C1322] text-slate-100 shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Modal Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-20 rounded-full bg-slate-800/80 p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors cursor-pointer"
          aria-label="Close dialog"
        >
          <X className="h-4 w-4" />
        </button>

        {!depositData ? (
          /* Step 1: Deposit Amount Form */
          <div className="p-6 space-y-5">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Wallet className="h-5 w-5" />
              </span>
              <div>
                <h2 id="smm-deposit-modal-title" className="text-base font-bold text-white">
                  Top Up SMM Wallet
                </h2>
                <p className="text-xs text-slate-400">
                  Instant ABA KHQR deposit with 0% fee
                </p>
              </div>
            </div>

            {/* Benefit Banner */}
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-300">
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" />
              <span>0% top-up fee • Instantly credited directly to VNGZZ2 SMM balance.</span>
            </div>

            {/* Preset Amount Pills */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Quick Select Amount</label>
              <div className="grid grid-cols-5 gap-1.5">
                {PRESET_AMOUNTS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setAmount(preset)}
                    className={`rounded-lg border px-2 py-2 text-xs font-bold transition-all cursor-pointer ${
                      amount === preset
                        ? "border-emerald-500 bg-emerald-500/20 text-emerald-300 shadow-sm"
                        : "border-[#243047] bg-[#111A2B] text-slate-300 hover:border-slate-600 hover:text-white"
                    }`}
                  >
                    ${preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Amount Input */}
            <div className="space-y-1.5">
              <label htmlFor="custom-deposit-amount" className="text-xs font-semibold text-slate-300">
                Deposit Amount (USD)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-slate-400">
                  $
                </span>
                <input
                  id="custom-deposit-amount"
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="10.00"
                  className="w-full rounded-xl border border-[#243047] bg-[#111A2B] py-2.5 pl-8 pr-16 font-mono text-base font-bold text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-hidden"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-300">
                  USD
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleCreateDeposit}
                disabled={loading || !amount || parseFloat(amount) <= 0}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-900/40 hover:bg-emerald-500 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Generating KHQR…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Generate ABA KHQR Deposit
                  </>
                )}
              </button>
            </div>
          </div>
        ) : isSuccess ? (
          /* Step 3: Success Screen */
          <div className="p-8 text-center space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
              <CheckCircle2 className="h-10 w-10 animate-in zoom-in" />
            </div>
            <div className="space-y-1.5">
              <span className="inline-block px-3 py-0.5 rounded-full text-[11px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Deposit Confirmed
              </span>
              <h3 className="text-xl font-black text-white">
                ការដាក់ប្រាក់ជោគជ័យ!
              </h3>
              <p className="text-sm text-slate-300">
                Successfully added <strong className="text-emerald-400 font-bold">${depositData.amount} USD</strong> to your SMM Reseller Wallet.
              </p>
            </div>
            <div className="pt-4">
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-500 transition-colors cursor-pointer"
              >
                Done / រួចរាល់
              </button>
            </div>
          </div>
        ) : (
          /* Step 2: Authentic KHQR Payment Card */
          <div style={{ backgroundColor: "#FFFFFF", colorScheme: "light" }} className="text-slate-900">
            {/* Top Red KHQR Header with Chamfer */}
            <div className="relative w-full h-[62px] bg-[#E11D27] flex items-center justify-center select-none overflow-hidden">
              <div className="flex items-center tracking-[1.5px] text-white font-black text-[24px]">
                <span className="font-sans font-black">KH</span>
                <span className="inline-flex items-center justify-center border-2 border-white rounded-[4px] w-[20px] h-[20px] mx-[2px] text-[13px] font-black font-mono">Q</span>
                <span className="font-sans font-black">R</span>
              </div>
              {/* Diagonal Cut */}
              <div
                className="absolute bottom-0 right-0 w-0 h-0 pointer-events-none"
                style={{
                  borderStyle: "solid",
                  borderWidth: "0 0 16px 22px",
                  borderColor: "transparent transparent #FFFFFF transparent",
                }}
                aria-hidden="true"
              />
              {/* Close Button in Header */}
              <button
                type="button"
                onClick={onClose}
                className="absolute top-3 right-3 text-white/80 hover:text-white p-1 rounded-full transition-colors cursor-pointer bg-black/15 hover:bg-black/30"
                aria-label="Close"
              >
                <X className="h-4 w-4 stroke-[2.5]" />
              </button>
            </div>

            {/* Merchant Details & Amount Due */}
            <div className="px-6 pt-4 pb-1 text-left">
              <div className="text-[13px] font-bold text-slate-800 tracking-wide uppercase">
                VNGZZ2 SMM Wallet Deposit
              </div>
              <div className="text-[32px] font-black text-slate-950 tracking-tight leading-none mt-1">
                {parseFloat(depositData.amount).toFixed(2)}
                <span className="text-[14px] font-bold text-slate-500 ml-1.5 uppercase">
                  {depositData.currency}
                </span>
              </div>
              <div className="w-full border-b border-dashed border-slate-300 my-3" />
            </div>

            {/* QR Code */}
            <div className="px-6 py-1 flex items-center justify-center">
              <div
                onClick={handleOpenAbaApp}
                title={depositData.abamobile_deeplink ? "Click to open in ABA Mobile" : undefined}
                style={{ backgroundColor: "#FFFFFF" }}
                className={`relative w-[230px] h-[230px] p-1 flex items-center justify-center ${
                  depositData.abamobile_deeplink ? "cursor-pointer transition-transform hover:scale-[1.01]" : ""
                }`}
              >
                {isExpired ? (
                  <div className="space-y-3 p-4 text-center">
                    <AlertCircle className="h-10 w-10 text-rose-500 mx-auto" />
                    <p className="text-sm font-bold text-rose-600">KHQR Expired</p>
                    <button
                      type="button"
                      onClick={handleCreateDeposit}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-rose-600 text-white cursor-pointer hover:bg-rose-700"
                    >
                      <RefreshCw className="h-3 w-3" /> Generate New
                    </button>
                  </div>
                ) : renderedQr ? (
                  <>
                    <img
                      src={renderedQr}
                      alt="Deposit ABA KHQR Code"
                      className="w-full h-full object-contain block select-none"
                    />
                    {/* Centered KHQR Emblem */}
                    <div
                      className="absolute inset-0 flex items-center justify-center pointer-events-none"
                      aria-hidden="true"
                    >
                      <div className="w-[38px] h-[38px] rounded-full bg-[#E11D27] p-[3px] shadow-md border-2 border-white flex items-center justify-center">
                        <div className="w-full h-full rounded-full border border-white/60 flex items-center justify-center text-white font-black text-[11px] font-mono">
                          $
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center space-y-2 p-6 text-slate-500">
                    <RefreshCw className="h-6 w-6 animate-spin text-red-600" />
                    <span className="text-xs font-medium">Loading QR Code…</span>
                  </div>
                )}
              </div>
            </div>

            {/* Instructions & Timer */}
            <div className="px-6 pt-2 pb-5 space-y-3 text-center">
              <div>
                <p className="text-[12px] font-medium text-slate-700">
                  Scan with ABA Mobile or any
                </p>
                <p className="text-[11px] font-normal text-slate-500">
                  banking app supporting KHQR
                </p>
              </div>

              {/* Status & Countdown Pill */}
              <div className="flex items-center justify-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600" />
                  </span>
                  PENDING · {formattedTime}
                </span>
              </div>

              {/* ABA Mobile Deeplink Button */}
              {depositData.abamobile_deeplink && !isExpired && (
                <button
                  type="button"
                  onClick={handleOpenAbaApp}
                  className="w-full py-2.5 px-3 rounded-xl bg-[#004B7A] hover:bg-[#00385C] text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm cursor-pointer"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open in ABA Mobile
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

