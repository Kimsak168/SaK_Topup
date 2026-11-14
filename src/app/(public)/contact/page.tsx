import { redirect } from "next/navigation";

const TELEGRAM_URL = process.env.NEXT_PUBLIC_TELEGRAM_SUPPORT || "https://t.me/Asuratopupstore";

export default function ContactPage() {
  redirect(TELEGRAM_URL);
}
