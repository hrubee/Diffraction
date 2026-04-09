// api/routes/policies.js — Policy preset listing endpoint.
//
// GET /api/policies/presets
//   Scans policies/presets/*.yaml, extracts name + description from each
//   preset block (simple regex — no js-yaml dependency needed).
//   Returns { presets: [{ name, description, file }] }

import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRESETS_DIR = path.resolve(__dirname, "..", "..", "policies", "presets");

const router = Router();

/**
 * Parse a single preset YAML file for its name and description.
 * Only reads the `preset:` block — no full YAML parsing needed.
 */
function parsePreset(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const nameMatch = content.match(/^\s*name:\s*(.+)$/m);
  const descMatch = content.match(/^\s*description:\s*"?([^"\n]*)"?/m);
  return {
    name: nameMatch ? nameMatch[1].trim() : path.basename(filePath, ".yaml"),
    description: descMatch ? descMatch[1].trim() : "",
  };
}

// GET /api/policies/presets
router.get("/presets", (_req, res) => {
  try {
    const files = fs
      .readdirSync(PRESETS_DIR)
      .filter((f) => f.endsWith(".yaml"))
      .sort();

    const presets = files.map((file) => {
      const filePath = path.join(PRESETS_DIR, file);
      const { name, description } = parsePreset(filePath);
      return { name, description, file };
    });

    return res.json({ presets });
  } catch (err) {
    return res.status(500).json({ error: `Failed to read presets: ${err.message}` });
  }
});

export default router;
