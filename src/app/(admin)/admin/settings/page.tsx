"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Save,
  RefreshCw,
  Sliders,
  DollarSign,
  Send,
  AlertTriangle,
  QrCode,
  CreditCard,
  Wallet,
  Sparkles,
} from "lucide-react";

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    siteName: "SakSuuu Game Top-Up",
    siteTagline: "Official Direct Game Recharge & 24/7 Fast Delivery",
    logoUrl: "",
    telegramSupport: "https://t.me/saksuuu_support",
    whatsappSupport: "",
    defaultMarginPercent: 10,
    currencyRateKHR: 4100,
    maintenanceMode: false,
    announcement:
      "Welcome to SakSuuu Top-Up! Direct wholesale supplier pricing for Free Fire, PUBG Mobile & Mobile Legends.",
    enabledGateways: ["khqr", "aba", "wing", "binance"],
  });

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/settings", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success && data.settings) {
        setForm(data.settings);
      }
    } catch (err) {
      console.error("Failed to load settings:", err);
      toast.error("Failed to fetch website settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (data.success) {
        toast.success("Website settings updated successfully");
      } else {
        toast.error(data.error || "Failed to update settings");
      }
    } catch {
      toast.error("Network error while saving settings");
    } finally {
      setSaving(false);
    }
  };

  const toggleGateway = (gwId: string) => {
    setForm((prev) => {
      const exists = prev.enabledGateways.includes(gwId);
      const next = exists
        ? prev.enabledGateways.filter((g) => g !== gwId)
        : [...prev.enabledGateways, gwId];
      return { ...prev, enabledGateways: next };
    });
  };

  if (loading) {
    return (
      <div className="p-16 flex flex-col items-center justify-center gap-3 text-slate-400">
        <RefreshCw className="h-6 w-6 animate-spin text-pink-500" />
        <span className="text-xs">Loading website settings...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-4xl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Website Settings</h1>
          <p className="text-xs text-slate-400 mt-1">
            Global store configuration, support links, default pricing markups, and payment toggles.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 shadow-[0_0_15px_rgba(255,46,147,0.3)] transition-all cursor-pointer disabled:opacity-50"
        >
          {saving ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          <span>{saving ? "Saving..." : "Save Settings"}</span>
        </button>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Section 1: General Branding */}
        <div className="rounded-2xl border border-white/10 bg-[#0c0e24] p-6 space-y-4">
          <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
            <Sliders className="h-4 w-4 text-pink-400" />
            <span>Store Branding & Details</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1.5">
              <label className="font-bold text-slate-300">Website Name</label>
              <input
                type="text"
                value={form.siteName}
                onChange={(e) => setForm({ ...form, siteName: e.target.value })}
                className="w-full rounded-xl border border-white/10 bg-[#08091a] px-3.5 py-2.5 text-white placeholder-slate-500 focus:border-pink-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-slate-300">Tagline / Slogan</label>
              <input
                type="text"
                value={form.siteTagline}
                onChange={(e) => setForm({ ...form, siteTagline: e.target.value })}
                className="w-full rounded-xl border border-white/10 bg-[#08091a] px-3.5 py-2.5 text-white placeholder-slate-500 focus:border-pink-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1.5 text-xs">
            <label className="font-bold text-slate-300">Storefront Announcement Banner</label>
            <input
              type="text"
              value={form.announcement}
              onChange={(e) => setForm({ ...form, announcement: e.target.value })}
              placeholder="Notice shown to customers atop the website..."
              className="w-full rounded-xl border border-white/10 bg-[#08091a] px-3.5 py-2.5 text-white placeholder-slate-500 focus:border-pink-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Section 2: Support & Contact Channels */}
        <div className="rounded-2xl border border-white/10 bg-[#0c0e24] p-6 space-y-4">
          <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
            <Send className="h-4 w-4 text-purple-400" />
            <span>Customer Support & Inquiries</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1.5">
              <label className="font-bold text-slate-300">Telegram Support URL</label>
              <input
                type="text"
                value={form.telegramSupport}
                onChange={(e) => setForm({ ...form, telegramSupport: e.target.value })}
                placeholder="https://t.me/saksuuu_support"
                className="w-full rounded-xl border border-white/10 bg-[#08091a] px-3.5 py-2.5 text-white placeholder-slate-500 focus:border-pink-500 focus:outline-none font-mono text-[11px]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-slate-300">WhatsApp / Secondary Contact</label>
              <input
                type="text"
                value={form.whatsappSupport}
                onChange={(e) => setForm({ ...form, whatsappSupport: e.target.value })}
                placeholder="https://wa.me/... or phone number"
                className="w-full rounded-xl border border-white/10 bg-[#08091a] px-3.5 py-2.5 text-white placeholder-slate-500 focus:border-pink-500 focus:outline-none font-mono text-[11px]"
              />
            </div>
          </div>
        </div>

        {/* Section 3: Pricing Defaults & Currency Conversion */}
        <div className="rounded-2xl border border-white/10 bg-[#0c0e24] p-6 space-y-4">
          <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-emerald-400" />
            <span>Pricing Automation & Currency Rates</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1.5">
              <label className="font-bold text-slate-300">
                Default Wholesale Markup (%)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={form.defaultMarginPercent}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      defaultMarginPercent: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full rounded-xl border border-white/10 bg-[#08091a] px-3.5 py-2.5 text-white focus:border-pink-500 focus:outline-none"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                  %
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Applied automatically to newly imported packages when calculating customer retail prices.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-slate-300">
                Exchange Rate: $1.00 USD to KHR (Riel)
              </label>
              <input
                type="number"
                min="1000"
                value={form.currencyRateKHR}
                onChange={(e) =>
                  setForm({
                    ...form,
                    currencyRateKHR: parseInt(e.target.value) || 4100,
                  })
                }
                className="w-full rounded-xl border border-white/10 bg-[#08091a] px-3.5 py-2.5 text-white focus:border-pink-500 focus:outline-none font-mono"
              />
              <p className="text-[11px] text-slate-400">
                Used to render live KHQR payment amounts for Cambodian bank transfers.
              </p>
            </div>
          </div>
        </div>

        {/* Section 4: Payment Gateways Toggles */}
        <div className="rounded-2xl border border-white/10 bg-[#0c0e24] p-6 space-y-4">
          <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-pink-400" />
            <span>Storefront Checkout Gateways</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {[
              {
                id: "khqr",
                name: "KHQR (All Cambodian Banks)",
                desc: "AnajakPay universal QR scanner",
                icon: QrCode,
              },
              {
                id: "aba",
                name: "ABA PAY",
                desc: "Direct ABA Mobile checkout",
                icon: CreditCard,
              },
              {
                id: "wing",
                name: "Wing Bank",
                desc: "WingPay merchant checkout",
                icon: Wallet,
              },
              {
                id: "binance",
                name: "Binance Pay / Crypto",
                desc: "USDT stablecoin settlement",
                icon: Sparkles,
              },
            ].map((gw) => {
              const isEnabled = form.enabledGateways.includes(gw.id);
              const Icon = gw.icon;
              return (
                <div
                  key={gw.id}
                  onClick={() => toggleGateway(gw.id)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                    isEnabled
                      ? "bg-pink-500/10 border-pink-500/30"
                      : "bg-[#08091a] border-white/5 opacity-60"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                        isEnabled
                          ? "bg-pink-500/20 text-pink-400"
                          : "bg-white/5 text-slate-500"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-bold text-white">{gw.name}</p>
                      <p className="text-[10px] text-slate-400">{gw.desc}</p>
                    </div>
                  </div>

                  <span
                    className={`h-5 w-5 rounded-full flex items-center justify-center border ${
                      isEnabled
                        ? "bg-pink-500 border-pink-400 text-white"
                        : "border-slate-600 bg-slate-800 text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section 5: Maintenance Mode */}
        <div className="rounded-2xl border border-white/10 bg-[#0c0e24] p-6 space-y-3">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                <span>Storefront Maintenance Mode</span>
              </h2>
              <p className="text-xs text-slate-400">
                When enabled, customer checkout is temporarily paused for catalogue maintenance while keeping admin portal access open.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                setForm((prev) => ({
                  ...prev,
                  maintenanceMode: !prev.maintenanceMode,
                }))
              }
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                form.maintenanceMode ? "bg-amber-500" : "bg-slate-700"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  form.maintenanceMode ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Save Bar */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-pink-500 via-purple-600 to-indigo-600 hover:from-pink-600 text-white font-bold text-xs flex items-center gap-2 shadow-[0_0_20px_rgba(255,46,147,0.35)] disabled:opacity-50 cursor-pointer"
          >
            {saving ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            <span>Save All Website Settings</span>
          </button>
        </div>
      </form>
    </div>
  );
}
