import { NextResponse } from "next/server";
import { execSync } from "child_process";

export async function GET() {
  try {
    // Use openshell sandbox list and parse output
    const out = execSync("openshell sandbox list 2>&1", { encoding: "utf-8", timeout: 10000 });
    const lines = out.split("\n").filter((l) => l.trim() && !l.includes("NAME") && !l.includes("No sandboxes"));
    const sandboxes = lines.map((line) => {
      const parts = line.trim().split(/\s+/);
      return { name: parts[0], namespace: parts[1], phase: parts[parts.length - 1] };
    }).filter((s) => s.name);

    return NextResponse.json(sandboxes);
  } catch {
    return NextResponse.json([]);
  }
}
