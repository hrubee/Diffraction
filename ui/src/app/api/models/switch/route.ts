import { NextResponse } from "next/server";
import { execSync } from "child_process";

export async function POST(request: Request) {
  const { modelId } = await request.json();
  if (!modelId) {
    return NextResponse.json({ error: "modelId required" }, { status: 400 });
  }

  try {
    execSync(`openshell inference set --provider nvidia-nim --model ${modelId} 2>&1`, {
      encoding: "utf-8",
      timeout: 30000,
    });
    return NextResponse.json({ ok: true, model: modelId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Switch failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
