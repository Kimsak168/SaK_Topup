import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Game } from "@/models/Game";
import { Banner } from "@/models/Banner";

export const dynamic = "force-dynamic";

export async function GET() {
  const startTime = Date.now();
  const report: {
    status: "ok" | "degraded" | "unhealthy";
    timestamp: string;
    responseTimeMs: number;
    mongodb: {
      status: "CONNECTED" | "FAILED";
      database?: string;
      readyState: number;
      activeGames?: number;
      activeBanners?: number;
      error?: string;
    };
    suppliers: {
      vizo: "CONFIGURED" | "NOT_CONFIGURED";
      g2bulk: "CONFIGURED" | "NOT_CONFIGURED";
    };
  } = {
    status: "ok",
    timestamp: new Date().toISOString(),
    responseTimeMs: 0,
    mongodb: {
      status: "FAILED",
      readyState: 0,
    },
    suppliers: {
      vizo: process.env.VIZO_API_KEY && process.env.VIZO_BASE_URL ? "CONFIGURED" : "NOT_CONFIGURED",
      g2bulk: process.env.G2BULK_API_KEY && process.env.G2BULK_BASE_URL ? "CONFIGURED" : "NOT_CONFIGURED",
    },
  };

  try {
    const mongooseInstance = await connectDB();
    const readyState = mongooseInstance.connection.readyState;
    report.mongodb.readyState = readyState;

    if (readyState === 1 && mongooseInstance.connection.db) {
      report.mongodb.status = "CONNECTED";
      report.mongodb.database = mongooseInstance.connection.db.databaseName;

      // Count active items to verify query functionality
      const [activeGames, activeBanners] = await Promise.all([
        Game.countDocuments({ isActive: true }).catch(() => 0),
        Banner.countDocuments({ isActive: true }).catch(() => 0),
      ]);

      report.mongodb.activeGames = activeGames;
      report.mongodb.activeBanners = activeBanners;
    } else {
      report.mongodb.status = "FAILED";
      report.status = "degraded";
    }
  } catch (err) {
    report.status = "unhealthy";
    report.mongodb.status = "FAILED";
    report.mongodb.error = err instanceof Error ? err.message : "Connection failed";
  }

  report.responseTimeMs = Date.now() - startTime;

  return NextResponse.json(report, {
    status: report.status === "unhealthy" ? 503 : 200,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}