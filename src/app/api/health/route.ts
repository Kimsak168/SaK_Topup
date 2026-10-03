import { NextResponse } from "next/server";
import mongoose from "mongoose";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404 }
    );
  }

  const results = {
    mongodb: "FAILED",
    vizo: "FAILED",
    g2bulk: "FAILED",
  };

  // Test MongoDB
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("Missing MongoDB URI");
    }

    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });

    results.mongodb = "CONNECTED";
  } catch {
    results.mongodb = "FAILED";
  }

  // Test Vizo API
  try {
    const response = await fetch(
      `${process.env.VIZO_BASE_URL}/api/v1/reseller/profile`,
      {
        headers: {
          "X-API-Key": process.env.VIZO_API_KEY || "",
        },
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      }
    );

    if (response.ok) {
      results.vizo = "CONNECTED";
    }
  } catch {
    results.vizo = "FAILED";
  }

  // Test G2Bulk API
  try {
    const response = await fetch(
      `${process.env.G2BULK_BASE_URL}/getMe`,
      {
        headers: {
          "X-API-Key": process.env.G2BULK_API_KEY || "",
        },
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      }
    );

    if (response.ok) {
      results.g2bulk = "CONNECTED";
    }
  } catch {
    results.g2bulk = "FAILED";
  }

  return NextResponse.json(results);
}