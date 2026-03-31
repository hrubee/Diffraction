import { NextResponse } from "next/server";
import { cliBridge } from "@/lib/cli-bridge";

export async function GET() {
  try {
    return NextResponse.json(cliBridge("models.list"));
  } catch {
    return NextResponse.json([]);
  }
}
