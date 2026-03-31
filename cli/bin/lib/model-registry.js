// SPDX-FileCopyrightText: Copyright (c) 2026 Diffraction contributors.
// SPDX-License-Identifier: Apache-2.0
//
// Extensible model registry — reads from cli/models.json (built-in) and
// ~/.diffract/models.json (user additions). Users can add models via
// `diffract model add` without modifying the codebase.

const fs = require("fs");
const path = require("path");

const BUILTIN_REGISTRY = path.join(__dirname, "..", "..", "models.json");
const USER_REGISTRY = path.join(process.env.HOME || "/tmp", ".diffract", "models.json");

function loadJson(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch {}
  return null;
}

function saveUserRegistry(data) {
  const dir = path.dirname(USER_REGISTRY);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = USER_REGISTRY + `.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, USER_REGISTRY);
}

/**
 * Load merged model registry (built-in + user additions).
 * User models override built-in models with the same ID.
 */
function loadRegistry() {
  const builtin = loadJson(BUILTIN_REGISTRY) || { version: 1, models: [], providers: {}, defaults: {} };
  const user = loadJson(USER_REGISTRY) || { models: [], providers: {} };

  // Merge providers (user overrides built-in)
  const providers = { ...builtin.providers, ...user.providers };

  // Merge models (user overrides built-in by ID)
  const modelMap = new Map();
  for (const m of builtin.models || []) modelMap.set(m.id, m);
  for (const m of user.models || []) modelMap.set(m.id, m);
  const models = Array.from(modelMap.values());

  return {
    version: builtin.version || 1,
    defaults: { ...builtin.defaults, ...user.defaults },
    providers,
    models,
  };
}

/** Get all cloud models (for onboard selection) */
function getCloudModels() {
  const reg = loadRegistry();
  return reg.models.map((m) => ({
    id: m.id,
    label: m.name || m.id,
    provider: m.provider,
    api: m.api,
    contextWindow: m.contextWindow,
    maxTokens: m.maxTokens,
    reasoning: m.reasoning || false,
  }));
}

/** Get a specific model by ID */
function getModel(modelId) {
  const reg = loadRegistry();
  return reg.models.find((m) => m.id === modelId) || null;
}

/** Get a provider config by name */
function getProvider(providerName) {
  const reg = loadRegistry();
  return reg.providers[providerName] || null;
}

/** Get default model ID for a given type */
function getDefaultModel(type = "cloud") {
  const reg = loadRegistry();
  return reg.defaults[type] || null;
}

/** Add a custom model to the user registry */
function addModel(model) {
  if (!model.id || !model.provider) {
    throw new Error("Model must have 'id' and 'provider' fields");
  }
  const user = loadJson(USER_REGISTRY) || { models: [], providers: {} };
  // Remove existing with same ID
  user.models = (user.models || []).filter((m) => m.id !== model.id);
  user.models.push({
    id: model.id,
    name: model.name || model.id,
    provider: model.provider,
    api: model.api || "openai-completions",
    contextWindow: model.contextWindow || 131072,
    maxTokens: model.maxTokens || 4096,
    reasoning: model.reasoning || false,
  });
  saveUserRegistry(user);
  return model;
}

/** Remove a model from the user registry */
function removeModel(modelId) {
  const user = loadJson(USER_REGISTRY) || { models: [], providers: {} };
  const before = (user.models || []).length;
  user.models = (user.models || []).filter((m) => m.id !== modelId);
  if (user.models.length === before) return false;
  saveUserRegistry(user);
  return true;
}

/** Add a custom provider to the user registry */
function addProvider(name, config) {
  const user = loadJson(USER_REGISTRY) || { models: [], providers: {} };
  user.providers[name] = {
    type: config.type || "openai",
    label: config.label || name,
    credentialEnv: config.credentialEnv || "",
    endpoint: config.endpoint || "",
    skipVerify: config.skipVerify || false,
  };
  saveUserRegistry(user);
}

module.exports = {
  addModel,
  addProvider,
  getCloudModels,
  getDefaultModel,
  getModel,
  getProvider,
  loadRegistry,
  removeModel,
};
