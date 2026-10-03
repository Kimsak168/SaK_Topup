import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { ALLOWED_IMAGE_TYPES, MAX_CLIENT_UPLOAD_BYTES } from "@/lib/services/blobService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Protect upload token generation with server-side admin authentication
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  try {
    const body = (await request.json()) as HandleUploadBody;

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname: string, clientPayload: string | null) => {
        // Enforce public access, allowed file types, and size constraints
        return {
          allowedContentTypes: [...ALLOWED_IMAGE_TYPES],
          maximumSizeInBytes: MAX_CLIENT_UPLOAD_BYTES,
          tokenPayload: clientPayload || undefined,
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        console.log(`[BlobClientUpload] Completed: ${blob.pathname} -> ${blob.url} (payload: ${tokenPayload})`);
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error("[BlobClientUpload] Token generation error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}
