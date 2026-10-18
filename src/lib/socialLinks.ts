// Set these public destinations in .env.local or the deployment environment
// before building. Empty/invalid social destinations are hidden in the toolbar.
export const SOCIAL_URLS = {
  facebook: process.env.NEXT_PUBLIC_FACEBOOK_URL || "",
  tiktok: process.env.NEXT_PUBLIC_TIKTOK_URL || "",
  telegram: process.env.NEXT_PUBLIC_TELEGRAM_SUPPORT || "https://t.me/saksuuu_support",
  discord: process.env.NEXT_PUBLIC_DISCORD_URL || "",
  youtube: process.env.NEXT_PUBLIC_YOUTUBE_URL || "",
} as const;
