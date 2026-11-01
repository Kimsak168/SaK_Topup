import Link from "next/link";
import { ArrowRight, Eye, Heart, ShieldCheck, Sparkles, Users, Zap } from "lucide-react";

export function BoostTikTokKhmerBanner() {
  return (
    <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-pink-500/30 bg-gradient-to-br from-[#200a26] via-[#3d0f36] to-[#140b2a] p-5 sm:p-7 md:p-8 text-white shadow-2xl shadow-pink-950/40">
      {/* Background glow orbs */}
      <div aria-hidden="true" className="pointer-events-none absolute -left-16 -top-20 size-60 rounded-full bg-pink-500/20 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 -bottom-20 size-64 rounded-full bg-violet-500/25 blur-3xl" />

      <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 sm:gap-8">
        {/* Left Column: Details & Packages */}
        <div className="max-w-2xl space-y-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-pink-400/40 bg-pink-500/20 px-3 py-1 text-[11px] sm:text-xs font-black tracking-wide text-pink-200">
              <Sparkles className="size-3.5 text-pink-300 animate-pulse" />
              BOOST TIKTOK KHMER
            </span>
            <span className="rounded-full bg-white/10 border border-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-pink-100">
              🇰🇭 កញ្ចប់ពិសេសសម្រាប់ខ្មែរ
            </span>
          </div>

          <div>
            <h3 className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
              <span>Boost TikTok Khmer</span>
              <span className="text-[11px] sm:text-xs font-bold text-pink-300 rounded-md bg-pink-500/15 border border-pink-500/25 px-2 py-0.5">
                Fixed Packages
              </span>
            </h3>
            <p className="mt-1.5 text-xs sm:text-sm text-pink-100/85 leading-relaxed">
              សេវាកម្មបង្កើន TikTok សម្រាប់អ្នកបង្កើតមាតិកានៅកម្ពុជា — Likes, Views និង Followers គុណភាពខ្ពស់ ដំណើរការស្វ័យប្រវត្តិតាមរយៈ KHQR / ABA PayWay។
            </p>
          </div>

          {/* Quick Package Preview Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
            <div className="flex items-center gap-2.5 rounded-xl border border-pink-500/20 bg-black/25 p-2.5 backdrop-blur-sm">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-pink-500/20 text-pink-300">
                <Heart className="size-4" fill="currentColor" />
              </span>
              <div className="min-w-0">
                <div className="text-[11px] sm:text-xs font-bold text-white truncate">Likes + Views</div>
                <div className="text-[10px] text-pink-200/80">500 – 10,000 Likes</div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 rounded-xl border border-violet-500/20 bg-black/25 p-2.5 backdrop-blur-sm">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-violet-500/20 text-violet-300">
                <Eye className="size-4" />
              </span>
              <div className="min-w-0">
                <div className="text-[11px] sm:text-xs font-bold text-white truncate">Video Views</div>
                <div className="text-[10px] text-violet-200/80">2,000 – 10,000 Views</div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 rounded-xl border border-fuchsia-500/20 bg-black/25 p-2.5 backdrop-blur-sm">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-fuchsia-500/20 text-fuchsia-300">
                <Users className="size-4" />
              </span>
              <div className="min-w-0">
                <div className="text-[11px] sm:text-xs font-bold text-white truncate">Real Followers</div>
                <div className="text-[10px] text-fuchsia-200/80">100 – 500 Follows</div>
              </div>
            </div>
          </div>

          {/* Feature Badges */}
          <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] font-medium text-pink-200/80">
            <span className="inline-flex items-center gap-1">
              <Zap className="size-3.5 text-amber-300" /> Instant Auto Delivery
            </span>
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="size-3.5 text-emerald-400" /> 100% Safe (No Password)
            </span>
          </div>
        </div>

        {/* Right Column: CTA Card */}
        <div className="flex shrink-0 flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-end justify-between gap-3 rounded-2xl border border-pink-400/20 bg-black/30 p-4 sm:p-5 backdrop-blur-md">
          <div className="text-left lg:text-right">
            <span className="text-[11px] font-semibold text-pink-200/70 block uppercase tracking-wider">
              Starting price
            </span>
            <div className="flex items-baseline gap-1 lg:justify-end">
              <span className="text-2xl sm:text-3xl font-extrabold text-white">$0.75</span>
              <span className="text-xs text-pink-200/70">/ package</span>
            </div>
            <span className="text-[11px] text-emerald-400 font-semibold block mt-0.5">
              Available 24/7 with KHQR
            </span>
          </div>

          <Link
            href="/services/tiktok-khmer"
            className="group/btn inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 via-rose-500 to-violet-600 px-6 py-3 text-xs sm:text-sm font-bold text-white shadow-lg shadow-pink-500/30 transition-all duration-200 hover:scale-[1.03] hover:shadow-pink-500/50 active:scale-[0.98]"
          >
            <span>ជ្រើសរើសកញ្ចប់ / Order Packages</span>
            <ArrowRight className="size-4 transition-transform duration-200 group-hover/btn:translate-x-1" />
          </Link>
        </div>
      </div>
    </div>
  );
}
