import { NextResponse } from "next/server";
import { cliBridge } from "@/lib/cli-bridge";

export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  try {
    const info = cliBridge("hub.info", name);
    if (!info) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(info);
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  try {
    return NextResponse.json(cliBridge("hub.remove", name));
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
