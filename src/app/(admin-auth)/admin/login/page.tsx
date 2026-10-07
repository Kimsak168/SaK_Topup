"use client";

import { useState, Suspense } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { getAdminRedirect } from "@/lib/adminRedirect";
import {
  Lock,
  User,
  Eye,
  EyeOff,
  ShieldCheck,
  ArrowRight,
  RefreshCw,
  Sparkles,
  Server,
} from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = getAdminRedirect(searchParams.get("from"));

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      toast.error("Please enter both username and password");
      return;
    }

    try {
      setIsLoading(true);
      setErrorMsg("");

      const res = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        toast.success("Welcome back, Administrator!");
        router.push(from);
        router.refresh();
      } else {
        const err = data.error || "Authentication failed. Check your credentials.";
        setErrorMsg(err);
        toast.error(err);
      }
    } catch {
      setErrorMsg("Network error. Please try again.");
      toast.error("Network error while connecting to auth service.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative w-full max-w-md">
      {/* Background neon ambient aura */}
      <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-pink-600 via-purple-600 to-indigo-600 opacity-30 blur-2xl transition duration-1000 group-hover:opacity-100" />

      {/* Main Login Card */}
      <div className="relative rounded-3xl border border-white/10 bg-[#0c0e24]/90 p-6 sm:p-8 shadow-2xl backdrop-blur-2xl">
        {/* Brand Header */}
        <div className="text-center mb-8 flex flex-col items-center">
          <div className="mb-3 flex items-center justify-center">
            <Image
              src="/images/logo.png"
              alt="SakSuuu Logo"
              width={70}
              height={70}
              priority
              className="h-16 w-16 object-contain drop-shadow-[0_0_25px_rgba(0,217,255,0.4)]"
            />
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-pink-500/25 bg-pink-500/10 px-3 py-1 text-xs font-semibold text-pink-300 mb-2">
            <Sparkles className="h-3.5 w-3.5 text-pink-400" />
            <span>Admin HQ Portal</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">
            Administrator Sign In
          </h1>
          <p className="mt-1.5 text-xs text-slate-400">
            Authorized personnel only. Direct supplier sync & management.
          </p>
        </div>

        {errorMsg && (
          <div className="mb-6 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300 flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          {/* Username Input */}
          <div className="space-y-1.5">
            <label htmlFor="admin-username" className="text-xs font-bold text-slate-300">Username</label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
                <User className="h-4 w-4" />
              </div>
              <input
                id="admin-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Admin username"
                required
                autoComplete="username"
                className="w-full rounded-xl border border-white/10 bg-[#08091a] pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20 transition-all"
              />
            </div>
          </div>

          {/* Password Input */}
          <div className="space-y-1.5">
            <label htmlFor="admin-password" className="text-xs font-bold text-slate-300">Password</label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
                <Lock className="h-4 w-4" />
              </div>
              <input
                id="admin-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
                autoComplete="current-password"
                className="min-h-11 w-full rounded-xl border border-white/10 bg-[#08091a] pl-10 pr-12 py-2.5 text-sm text-white placeholder-slate-500 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                aria-controls="admin-password"
                className="absolute inset-y-0 right-0 flex min-h-11 w-11 items-center justify-center rounded-r-xl text-slate-400 hover:text-slate-200"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 rounded-xl py-3 px-4 font-bold text-sm text-white bg-gradient-to-r from-pink-500 via-purple-600 to-indigo-600 hover:from-pink-600 hover:via-purple-700 hover:to-indigo-700 shadow-[0_0_25px_rgba(255,46,147,0.35)] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          >
            {isLoading ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Verifying Credentials...</span>
              </>
            ) : (
              <>
                <span>Sign In to HQ</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        {/* Security Footer */}
        <div className="mt-8 pt-6 border-t border-white/10 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[11px] leading-relaxed text-slate-400">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>256-Bit Encrypted Session</span>
          </div>
          <div className="flex items-center gap-1 text-slate-500">
            <Server className="h-3 w-3 shrink-0" />
            <span>Vizo & G2Bulk Direct</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-[#070814] text-slate-100 relative overflow-hidden">
      {/* Decorative cyber grid lines */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />

      {/* Ambient glowing orbs */}
      <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-pink-600/15 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-purple-600/15 blur-3xl pointer-events-none" />

      <Suspense
        fallback={
          <div className="flex items-center gap-2 text-slate-400">
            <RefreshCw className="h-5 w-5 animate-spin text-pink-500" />
            <span>Loading...</span>
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
