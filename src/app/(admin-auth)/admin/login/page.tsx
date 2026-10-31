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
      {/* Main Login Card */}
      <div className="relative rounded-xl border border-[#243047] bg-[#111A2B] p-6 sm:p-8 shadow-xl">
        {/* Brand Header */}
        <div className="text-center mb-7 flex flex-col items-center">
          <div className="mb-3 flex items-center justify-center">
            <Image
              src="/images/asura-store-logo.png"
              alt="SakSuuu Logo"
              width={56}
              height={56}
              priority
              className="h-14 w-14 object-contain"
            />
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(34,197,94,0.28)] bg-[rgba(34,197,94,0.10)] px-3 py-0.5 text-xs font-semibold text-[#22C55E] mb-2">
            <ShieldCheck className="h-3.5 w-3.5 text-[#22C55E]" />
            <span>Admin HQ Portal</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-[#F8FAFC]">
            Administrator Sign In
          </h1>
          <p className="mt-1 text-xs text-[#94A3B8]">
            Authorized personnel only. Direct supplier sync & management.
          </p>
        </div>

        {errorMsg && (
          <div className="mb-5 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/10 p-3 text-xs text-[#EF4444] flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[#EF4444] shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          {/* Username Input */}
          <div className="space-y-1.5">
            <label htmlFor="admin-username" className="text-xs font-semibold text-[#F8FAFC]">Username</label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#64748B]">
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
                className="w-full rounded-lg border border-[#243047] bg-[#151F31] pl-10 pr-4 py-2 text-sm text-[#F8FAFC] placeholder-[#64748B] focus:border-[#22C55E] focus:outline-none focus:ring-1 focus:ring-[#22C55E] transition-all"
              />
            </div>
          </div>

          {/* Password Input */}
          <div className="space-y-1.5">
            <label htmlFor="admin-password" className="text-xs font-semibold text-[#F8FAFC]">Password</label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#64748B]">
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
                className="min-h-10 w-full rounded-lg border border-[#243047] bg-[#151F31] pl-10 pr-12 py-2 text-sm text-[#F8FAFC] placeholder-[#64748B] focus:border-[#22C55E] focus:outline-none focus:ring-1 focus:ring-[#22C55E] transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                aria-controls="admin-password"
                className="absolute inset-y-0 right-0 flex min-h-10 w-10 items-center justify-center rounded-r-lg text-[#64748B] hover:text-[#F8FAFC]"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 rounded-lg py-2.5 px-4 font-bold text-sm text-[#080D18] bg-[#22C55E] hover:bg-[#16A34A] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
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
        <div className="mt-6 pt-5 border-t border-[#243047] flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[11px] leading-relaxed text-[#64748B]">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[#22C55E]" />
            <span>256-Bit Encrypted Session</span>
          </div>
          <div className="flex items-center gap-1">
            <Server className="h-3 w-3 shrink-0" />
            <span>WebBuilder Direct</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-[#080D18] text-[#F8FAFC] relative">
      <Suspense
        fallback={
          <div className="flex items-center gap-2 text-[#94A3B8]">
            <RefreshCw className="h-5 w-5 animate-spin text-[#22C55E]" />
            <span>Loading...</span>
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
