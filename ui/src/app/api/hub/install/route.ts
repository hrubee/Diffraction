import { NextResponse } from "next/server";
import { cliBridge } from "@/lib/cli-bridge";

export async function POST(request: Request) {
  const { source } = await request.json();
  if (!source) return NextResponse.json({ error: "source required" }, { status: 400 });
  try {
    return NextResponse.json(cliBridge("hub.install", source));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
