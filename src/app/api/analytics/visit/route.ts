import { getDb } from "@/lib/db";
import { incrementAnonymousVisit } from "@/lib/anonymous-visits";

function emptyResponse(status: number): Response {
  return new Response(null, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function productionCollectionIsConfigured(): boolean {
  const databaseUrl = process.env.DATABASE_URL;
  return (
    process.env.VERCEL === "1" &&
    process.env.VERCEL_ENV === "production" &&
    Boolean(databaseUrl && !databaseUrl.startsWith("file:") && process.env.DATABASE_AUTH_TOKEN)
  );
}

export async function POST(request: Request): Promise<Response> {
  const contentLength = request.headers.get("content-length");
  if (
    (contentLength !== null && (!/^\d{1,5}$/.test(contentLength) || Number(contentLength) > 0)) ||
    request.headers.has("content-type") ||
    request.headers.has("transfer-encoding")
  ) {
    return emptyResponse(413);
  }

  if (!productionCollectionIsConfigured()) return emptyResponse(204);

  try {
    const date = new Date().toISOString().slice(0, 10);
    await incrementAnonymousVisit(
      getDb(),
      date,
      request.headers.get("x-vercel-ip-country"),
      request.headers.get("x-vercel-ip-country-region"),
    );
    return emptyResponse(204);
  } catch {
    return emptyResponse(503);
  }
}
