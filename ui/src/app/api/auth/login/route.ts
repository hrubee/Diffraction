import { NextResponse } from "next/server";
import { setToken, validateToken } from "@/lib/auth";

export async function POST(request: Request) {
  const { token } = await request.json();

  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "Token is required" }, { status: 400 });
  }

  const valid = await validateToken(token);
  if (!valid) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  await setToken(token);
  return NextResponse.json({ ok: true });
}
