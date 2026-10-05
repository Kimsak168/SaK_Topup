import "server-only";
import { connectDB } from "@/lib/mongodb";

// Enable CATALOGUE_TIMING=1 for Vercel runtime logs. Never log documents or IDs.
export async function catalogueQuery<T>(name: string, query: () => Promise<T>): Promise<T> {
  const start = performance.now();
  await connectDB();
  const connected = performance.now();
  try {
    return await query();
  } finally {
    if (process.env.CATALOGUE_TIMING === "1") {
      console.info("[Catalogue timing]", JSON.stringify({
        name,
        connectMs: +(connected - start).toFixed(1),
        queryMs: +(performance.now() - connected).toFixed(1),
      }));
    }
  }
}

export async function withCatalogueTimeout<T>(request: Promise<T>, ms = 6000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Catalogue temporarily unavailable")), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
