// SPDX-FileCopyrightText: Copyright (c) 2026 Diffraction contributors.
// SPDX-License-Identifier: Apache-2.0
//
// Diffract Hub — skills marketplace for discovering, installing, and
// managing skill packs. Skills are YAML + script bundles that extend
// the agent's capabilities.
//
// Local registry: ~/.diffract/skills/
// Remote source: GitHub repos (configurable)

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const SKILLS_DIR = path.join(process.env.HOME || "/tmp", ".diffract", "skills");
const DEFAULT_REGISTRY_URL = "https://raw.githubusercontent.com/diffraction-ai/hub/main/registry.json";

function ensureSkillsDir() {
  fs.mkdirSync(SKILLS_DIR, { recursive: true, mode: 0o755 });
}

/** List installed skills */
function listInstalled() {
  ensureSkillsDir();
  const entries = [];
  try {
    for (const name of fs.readdirSync(SKILLS_DIR)) {
      const skillDir = path.join(SKILLS_DIR, name);
      if (!fs.statSync(skillDir).isDirectory()) continue;
      const metaPath = path.join(skillDir, "SKILL.md");
      const hasSkillFile = fs.existsSync(metaPath);
      entries.push({
        name,
        path: skillDir,
        hasSkillFile,
        installedAt: fs.statSync(skillDir).mtime.toISOString(),
      });
    }
  } catch {}
  return entries;
}

/** Install a skill from a GitHub repo or local path */
function install(source) {
  ensureSkillsDir();

  if (fs.existsSync(source) && fs.statSync(source).isDirectory()) {
    // Local directory — copy it
    const name = path.basename(source);
    const dest = path.join(SKILLS_DIR, name);
    if (fs.existsSync(dest)) {
      fs.rmSync(dest, { recursive: true });
    }
    execSync(`cp -r "${source}" "${dest}"`, { stdio: "pipe" });
    return { name, path: dest, source: "local" };
  }

  // GitHub repo or URL — clone it
  const name = source.split("/").pop().replace(/\.git$/, "");
  const dest = path.join(SKILLS_DIR, name);
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true });
  }

  try {
    execSync(`git clone --depth 1 "${source}" "${dest}" 2>&1`, { stdio: "pipe" });
    // Clean up .git to save space
    const gitDir = path.join(dest, ".git");
    if (fs.existsSync(gitDir)) fs.rmSync(gitDir, { recursive: true });
    return { name, path: dest, source: "git" };
  } catch (err) {
    throw new Error(`Failed to install skill from '${source}': ${err.message}`);
  }
}

/** Remove an installed skill */
function remove(name) {
  const skillDir = path.join(SKILLS_DIR, name);
  if (!fs.existsSync(skillDir)) return false;
  fs.rmSync(skillDir, { recursive: true });
  return true;
}

/** Get info about an installed skill */
function info(name) {
  const skillDir = path.join(SKILLS_DIR, name);
  if (!fs.existsSync(skillDir)) return null;

  const result = { name, path: skillDir, files: [] };

  // Read SKILL.md if it exists
  const skillMd = path.join(skillDir, "SKILL.md");
  if (fs.existsSync(skillMd)) {
    result.description = fs.readFileSync(skillMd, "utf-8").split("\n").slice(0, 5).join("\n");
  }

  // List files
  try {
    result.files = fs.readdirSync(skillDir).filter((f) => !f.startsWith("."));
  } catch {}

  return result;
}

/** Deploy a skill into a running sandbox */
function deployToSandbox(name, sandboxName) {
  const skillDir = path.join(SKILLS_DIR, name);
  if (!fs.existsSync(skillDir)) {
    throw new Error(`Skill '${name}' not installed. Run: diffract hub install <source>`);
  }

  // Find the openshell cluster container
  let cluster;
  try {
    cluster = execSync('docker ps --filter "name=openshell-cluster" --format "{{.Names}}"', {
      encoding: "utf-8",
    }).trim().split("\n")[0];
  } catch {
    throw new Error("No openshell cluster container found");
  }

  if (!cluster) throw new Error("No openshell cluster container found");

  // Copy into sandbox via docker cp + kubectl cp
  const tmpPath = `/tmp/skill-${name}-${Date.now()}`;
  execSync(`docker cp "${skillDir}" "${cluster}:${tmpPath}"`, { stdio: "pipe" });
  execSync(
    `docker exec "${cluster}" kubectl cp "${tmpPath}" "openshell/${sandboxName}:/sandbox/.openclaw-data/skills/${name}"`,
    { stdio: "pipe" }
  );
  // Cleanup tmp
  execSync(`docker exec "${cluster}" rm -rf "${tmpPath}"`, { stdio: "pipe" });

  return { name, sandbox: sandboxName };
}

module.exports = {
  deployToSandbox,
  info,
  install,
  listInstalled,
  remove,
  SKILLS_DIR,
};
