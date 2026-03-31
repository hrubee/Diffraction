import { NextResponse } from "next/server";
import { cliBridge } from "@/lib/cli-bridge";

export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  try {
    const presets = cliBridge("policies.list") as Array<{ name: string; description: string }>;
    const applied = cliBridge("policies.applied", name) as string[];
    const result = presets.map((p) => ({
      ...p,
      applied: applied.includes(p.name),
    }));
    return NextResponse.json(result);
  } catch {
    return NextResponse.json([]);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const { preset } = await request.json();
  if (!preset) return NextResponse.json({ error: "preset required" }, { status: 400 });
  try {
    return NextResponse.json(cliBridge("policies.apply", name, preset));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
