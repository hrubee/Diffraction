import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthenticatedShell } from "@/components/authenticated-shell";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get("diffract-token")?.value;

  if (!token) {
    redirect("/login");
  }

  // Determine WebSocket URL — in production, use the same origin with wss://
  const wsUrl = process.env.NEXT_PUBLIC_GATEWAY_WS_URL || "ws://127.0.0.1:18789";

  return <AuthenticatedShell token={token} wsUrl={wsUrl}>{children}</AuthenticatedShell>;
}
