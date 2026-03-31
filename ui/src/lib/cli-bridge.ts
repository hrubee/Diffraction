import { execSync } from "child_process";
import path from "path";

const BRIDGE = path.join(process.cwd(), "cli-bridge.js");

export function cliBridge(action: string, ...args: string[]): unknown {
  const cmd = ["node", BRIDGE, action, ...args].map((a) => `"${a}"`).join(" ");
  const out = execSync(cmd, { encoding: "utf-8", timeout: 30000 });
  return JSON.parse(out.trim());
}
