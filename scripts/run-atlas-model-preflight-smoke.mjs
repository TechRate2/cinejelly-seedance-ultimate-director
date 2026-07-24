#!/usr/bin/env node
/**
 * No-spend, NO-NETWORK regression for the Atlas key/model live probe used by `npm run doctor`.
 * global.fetch is stubbed so nothing ever leaves the machine. Proves the probe distinguishes:
 *   - a wrong/expired key (HTTP 401/403)  -> keyAuthFailed
 *   - a configured model id that isn't on the account -> missing
 *   - every configured model present -> ok
 *   - a network failure -> probeSkipped (fail-open, not a hard fail)
 * This is what makes `doctor` catch a false-green instead of only the first customer render failing.
 */

import { validateConfiguredAtlasModels } from "../dist/application/atlas-model-preflight.js";

const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), ...(detail !== undefined ? { detail: String(detail) } : {}) });

const settings = {
  apiBaseUrl: "https://api.atlascloud.ai/v1",
  assetBaseUrl: "https://api.atlascloud.ai/api/v1",
  apiKey: "test-key",
  models: {
    llmModel: "qwen/qwen3-vl-30b-a3b-thinking",
    creativeLlmModel: "anthropic/claude-sonnet-4.5",
    seedanceStandardModel: "bytedance/seedance-2.0/reference-to-video",
    seedanceFastModel: "bytedance/seedance-2.0-fast/reference-to-video",
    imageModel: "google/nano-banana-pro/text-to-image",
    avatarModel: "bytedance/avatar-omni-human-v1.5",
    ttsModel: "elevenlabs/v3/text-to-speech",
    speechModel: "openai/whisper-large-v3"
  }
};
const allModelIds = [
  settings.models.llmModel,
  settings.models.creativeLlmModel,
  settings.models.seedanceStandardModel,
  settings.models.seedanceFastModel,
  settings.models.imageModel,
  settings.models.avatarModel,
  settings.models.ttsModel,
  settings.models.speechModel
];

const realFetch = globalThis.fetch;
const stub = (handler) => { globalThis.fetch = handler; };
const modelsBody = (ids) => ({ ok: true, status: 200, json: async () => ({ data: ids.map((id) => ({ id })) }) });

try {
  // 1. Wrong/expired key -> 401 on both endpoints -> keyAuthFailed.
  stub(async () => ({ ok: false, status: 401, json: async () => ({}) }));
  const auth = await validateConfiguredAtlasModels(settings);
  check("wrong_key_flagged_authfailed", auth.keyAuthFailed === true && auth.ok === false, JSON.stringify({ keyAuthFailed: auth.keyAuthFailed, ok: auth.ok }));

  // 2. Valid key, catalog MISSING one configured model -> reported as missing, ok=false.
  const withoutImage = allModelIds.filter((id) => id !== settings.models.imageModel);
  stub(async () => modelsBody(withoutImage));
  const missing = await validateConfiguredAtlasModels(settings);
  check("missing_model_detected", missing.ok === false && missing.missing.some((m) => m.modelId === settings.models.imageModel), JSON.stringify(missing.missing));
  check("missing_not_flagged_as_authfailed", missing.keyAuthFailed === false);

  // 2b. A missing "writer" model (creativeLlmModel) is caught on the LLM endpoint — doctor stops a
  // false-green when the strong creative model is mistyped/removed, not just the vision llmModel.
  const withoutCreative = allModelIds.filter((id) => id !== settings.models.creativeLlmModel);
  stub(async () => modelsBody(withoutCreative));
  const missingCreative = await validateConfiguredAtlasModels(settings);
  check(
    "missing_creative_model_detected_on_llm_endpoint",
    missingCreative.ok === false &&
      missingCreative.missing.some((m) => m.field === "creativeLlmModel" && m.endpoint === "llm"),
    JSON.stringify(missingCreative.missing)
  );

  // 3. Valid key, all configured models present -> ok, nothing missing.
  stub(async () => modelsBody(allModelIds));
  const ok = await validateConfiguredAtlasModels(settings);
  check("all_models_present_ok", ok.ok === true && ok.missing.length === 0 && ok.keyAuthFailed === false, `checked=${ok.checkedModelCount}`);
  check("checked_all_configured_models", ok.checkedModelCount === 8, `checked=${ok.checkedModelCount}`);

  // 4. Network failure (fetch throws) -> fail-OPEN: probeSkipped, not keyAuthFailed, not a hard "missing".
  stub(async () => { throw new Error("ENETUNREACH"); });
  const net = await validateConfiguredAtlasModels(settings);
  check("network_failure_fails_open", net.probeSkipped === true && net.keyAuthFailed === false && net.missing.length === 0, JSON.stringify({ probeSkipped: net.probeSkipped }));
} finally {
  globalThis.fetch = realFetch;
}

const failed = checks.filter((c) => !c.pass);
const report = {
  schemaVersion: "cinejelly.atlas-model-preflight-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true,
  networkCallsMade: false,
  nextActions: [
    "Keep GREEN when changing validateConfiguredAtlasModels or the doctor Atlas probe — this is the check that stops a false-green on a wrong key / stale model."
  ]
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
