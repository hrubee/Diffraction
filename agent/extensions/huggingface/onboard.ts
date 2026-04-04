import {
  buildHuggingfaceModelDefinition,
  HUGGINGFACE_BASE_URL,
  HUGGINGFACE_MODEL_CATALOG,
} from "diffraction/plugin-sdk/provider-models";
import {
  createModelCatalogPresetAppliers,
  type DiffractionConfig,
} from "diffraction/plugin-sdk/provider-onboard";

export const HUGGINGFACE_DEFAULT_MODEL_REF = "huggingface/deepseek-ai/DeepSeek-R1";

const huggingfacePresetAppliers = createModelCatalogPresetAppliers({
  primaryModelRef: HUGGINGFACE_DEFAULT_MODEL_REF,
  resolveParams: (_cfg: DiffractionConfig) => ({
    providerId: "huggingface",
    api: "openai-completions",
    baseUrl: HUGGINGFACE_BASE_URL,
    catalogModels: HUGGINGFACE_MODEL_CATALOG.map(buildHuggingfaceModelDefinition),
    aliases: [{ modelRef: HUGGINGFACE_DEFAULT_MODEL_REF, alias: "Hugging Face" }],
  }),
});

export function applyHuggingfaceProviderConfig(cfg: DiffractionConfig): DiffractionConfig {
  return huggingfacePresetAppliers.applyProviderConfig(cfg);
}

export function applyHuggingfaceConfig(cfg: DiffractionConfig): DiffractionConfig {
  return huggingfacePresetAppliers.applyConfig(cfg);
}
