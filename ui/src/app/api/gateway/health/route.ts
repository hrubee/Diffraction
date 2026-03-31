import { NextResponse } from "next/server";

const GATEWAY_URL = process.env.GATEWAY_URL || "http://127.0.0.1:18789";

export async function GET() {
  try {
    const res = await fetch(`${GATEWAY_URL}/health`, { signal: AbortSignal.timeout(5000) });
    return NextResponse.json({ ok: res.ok, status: res.status });
  } catch {
    return NextResponse.json({ ok: false, status: 0 });
  }
}
