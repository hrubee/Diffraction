// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

const INFERENCE_ROUTE_URL = "https://inference.local/v1";
const DEFAULT_CLOUD_MODEL = "nvidia/nemotron-3-super-120b-a12b";
const DEFAULT_ROUTE_PROFILE = "inference-local";
const DEFAULT_ROUTE_CREDENTIAL_ENV = "OPENAI_API_KEY";
const MANAGED_PROVIDER_ID = "inference";
const { DEFAULT_OLLAMA_MODEL } = require("./local-inference");

// Remote provider configs — matches NemoClaw's provider support
const REMOTE_PROVIDER_CONFIG = {
  nvidia: {
    label: "NVIDIA Endpoints",
    providerName: "nvidia-nim",
    providerType: "openai",
    credentialEnv: "NVIDIA_API_KEY",
    endpointUrl: "https://integrate.api.nvidia.com/v1",
    helpUrl: "https://build.nvidia.com/settings/api-keys",
    defaultModel: DEFAULT_CLOUD_MODEL,
    skipVerify: false,
  },
  openai: {
    label: "OpenAI",
    providerName: "openai-api",
    providerType: "openai",
    credentialEnv: "OPENAI_API_KEY",
    endpointUrl: "https://api.openai.com/v1",
    helpUrl: "https://platform.openai.com/api-keys",
    defaultModel: "gpt-5.4",
    skipVerify: true,
  },
  anthropic: {
    label: "Anthropic",
    providerName: "anthropic-prod",
    providerType: "anthropic",
    credentialEnv: "ANTHROPIC_API_KEY",
    endpointUrl: "https://api.anthropic.com",
    helpUrl: "https://console.anthropic.com/settings/keys",
    defaultModel: "claude-sonnet-4-6",
    skipVerify: true,
  },
  gemini: {
    label: "Google Gemini",
    providerName: "gemini-api",
    providerType: "openai",
    credentialEnv: "GEMINI_API_KEY",
    endpointUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    helpUrl: "https://aistudio.google.com/app/apikey",
    defaultModel: "gemini-2.5-flash",
    skipVerify: true,
  },
  custom: {
    label: "Other OpenAI-compatible endpoint",
    providerName: "compatible-endpoint",
    providerType: "openai",
    credentialEnv: "COMPATIBLE_API_KEY",
    endpointUrl: "",
    helpUrl: null,
    defaultModel: "",
    skipVerify: true,
  },
};

// Curated model lists per remote provider
const REMOTE_MODEL_OPTIONS = {
  nvidia: [
    { id: "nvidia/nemotron-3-super-120b-a12b", label: "Nemotron 3 Super 120B (default)" },
    { id: "meta/llama-4-maverick-17b-128e-instruct", label: "Llama 4 Maverick" },
    { id: "meta/llama-3.3-70b-instruct", label: "Llama 3.3 70B" },
    { id: "deepseek-ai/deepseek-v3.1", label: "DeepSeek V3.1" },
    { id: "qwen/qwen3.5-397b-a17b", label: "Qwen 3.5 397B" },
  ],
  openai: [
    { id: "gpt-5.4", label: "GPT-5.4" },
    { id: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
    { id: "gpt-4.1", label: "GPT-4.1" },
    { id: "gpt-4o", label: "GPT-4o" },
  ],
  anthropic: [
    { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
    { id: "claude-opus-4-6", label: "Claude Opus 4.6" },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
  ],
  gemini: [
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
  ],
};

// Legacy CLOUD_MODEL_OPTIONS for backward compat
const CLOUD_MODEL_OPTIONS = REMOTE_MODEL_OPTIONS.nvidia;

function getProviderSelectionConfig(provider, model) {
  // Check remote providers first
  for (const [, cfg] of Object.entries(REMOTE_PROVIDER_CONFIG)) {
    if (provider === cfg.providerName) {
      return {
        endpointType: "custom",
        endpointUrl: INFERENCE_ROUTE_URL,
        ncpPartner: null,
        model: model || cfg.defaultModel,
        profile: DEFAULT_ROUTE_PROFILE,
        credentialEnv: DEFAULT_ROUTE_CREDENTIAL_ENV,
        provider,
        providerLabel: cfg.label,
      };
    }
  }

  // Legacy provider names
  switch (provider) {
    case "nvidia-nim":
      return {
        endpointType: "custom",
        endpointUrl: INFERENCE_ROUTE_URL,
        ncpPartner: null,
        model: model || DEFAULT_CLOUD_MODEL,
        profile: DEFAULT_ROUTE_PROFILE,
        credentialEnv: DEFAULT_ROUTE_CREDENTIAL_ENV,
        provider,
        providerLabel: "NVIDIA Cloud API",
      };
    case "vllm-local":
      return {
        endpointType: "custom",
        endpointUrl: INFERENCE_ROUTE_URL,
        ncpPartner: null,
        model: model || "vllm-local",
        profile: DEFAULT_ROUTE_PROFILE,
        credentialEnv: DEFAULT_ROUTE_CREDENTIAL_ENV,
        provider,
        providerLabel: "Local vLLM",
      };
    case "ollama-local":
      return {
        endpointType: "custom",
        endpointUrl: INFERENCE_ROUTE_URL,
        ncpPartner: null,
        model: model || DEFAULT_OLLAMA_MODEL,
        profile: DEFAULT_ROUTE_PROFILE,
        credentialEnv: DEFAULT_ROUTE_CREDENTIAL_ENV,
        provider,
        providerLabel: "Local Ollama",
      };
    default:
      return null;
  }
}

function getDiffractPrimaryModel(provider, model) {
  const resolvedModel =
    model || (provider === "ollama-local" ? DEFAULT_OLLAMA_MODEL : DEFAULT_CLOUD_MODEL);
  return resolvedModel ? `${MANAGED_PROVIDER_ID}/${resolvedModel}` : null;
}

module.exports = {
  CLOUD_MODEL_OPTIONS,
  DEFAULT_CLOUD_MODEL,
  DEFAULT_OLLAMA_MODEL,
  DEFAULT_ROUTE_CREDENTIAL_ENV,
  DEFAULT_ROUTE_PROFILE,
  INFERENCE_ROUTE_URL,
  MANAGED_PROVIDER_ID,
  REMOTE_MODEL_OPTIONS,
  REMOTE_PROVIDER_CONFIG,
  getDiffractPrimaryModel,
  getProviderSelectionConfig,
};
