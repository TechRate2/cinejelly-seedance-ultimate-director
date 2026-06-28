/**
 * Private source-pattern registry.
 *
 * This file keeps public-doc/repo/prompt lineage in backend evidence only.
 * UI contracts may use the distilled pattern behavior, but must not expose
 * source names, repo names, URLs, or upstream workflow labels to customers.
 */

import type { ReviewApprovalSurface } from "../types/review-approval.js";
import type { ProductionStageName } from "../types/stage.js";

export type PrivateSourcePatternCategory =
  | "agent_workflow"
  | "director_workflow"
  | "prompt_corpus"
  | "platform_structure"
  | "video_planning"
  | "visual_bible";

export type PrivateSourcePatternLicensePosture =
  | "public_docs_observation"
  | "mit_licensed_structure"
  | "cc_by_4_0_distilled_structure"
  | "attribution_required_distilled_structure"
  | "cinejelly_owned";

export type PrivateSourcePatternId =
  | "anil_seedance2_comfyui_consistent_character_workflow"
  | "calesthio_openmontage"
  | "cinejelly_operator_remake_patterns"
  | "cinejelly_short_director_pipe_contract"
  | "cinejelly_short_prompt_corpus"
  | "emily_seedance_2"
  | "emily_seedance_skill_os_mit"
  | "gswithjeff_autogen"
  | "harry_moneyprinterturbo"
  | "hereandnow_langgraph_workflows"
  | "hereandnow_langgraph_workflows_short_label"
  | "higgsfield_cinematic_prompt_guide"
  | "higgsfield_product_to_video_guide"
  | "higgsfield_public_product_reference_observation"
  | "higgsfield_skills_mit"
  | "hkuds_videoagent"
  | "hkuds_vimax"
  | "hkuds_vimax_reference_consistency_patterns"
  | "jiaminchen_directorbench"
  | "nirdiamant_genai_agents_content"
  | "openai_image_reference_board_workflow"
  | "osidemedia_higgsfield_prompt_skill_mit"
  | "shubhamsaboo_awesome_llm_apps"
  | "topview_public_api_docs_workflow_structure"
  | "topview_workflow_mode_observation"
  | "vericontext_vibeframe"
  | "vericontext_vibeframe_storyboard_to_video_workflow"
  | "video_db_director"
  | "youmind_awesome_seedance_2_prompts"
  | "youmind_awesome_seedance_2_prompts_cc_by_distilled_structure"
  | "youmind_awesome_seedance_2_prompts_distilled_3817_cc_by_4_0"
  | "zerolu_awesome_seedance"
  | "zerolu_awesome_seedance_prompt_pattern_attribution";

export interface PrivateSourcePatternRecord {
  readonly id: PrivateSourcePatternId;
  readonly label: string;
  readonly category: PrivateSourcePatternCategory;
  readonly licensePosture: PrivateSourcePatternLicensePosture;
  readonly visibility: "internal_only";
  readonly uiExposure: "never";
  readonly runtimePolicy: "distilled_structure_only_no_verbatim_copy";
  readonly commercialPolicy: "allowed_for_backend_evidence_subject_to_license_and_source_review";
}

export const PRIVATE_SOURCE_PATTERN_REGISTRY_POLICY = {
  visibility: "internal_only",
  uiExposure: "never",
  runtimePolicy: "distilled_structure_only_no_verbatim_copy",
  promptPolicy: "no_raw_third_party_prompt_or_template_text_in_runtime_handoff",
  commercialPolicy: "use_public_docs_or_license-compatible_structure_only_keep_lineage_in_internal_audit"
} as const;

const RECORDS = [
  record("topview_workflow_mode_observation", "Topview AI workflow-mode observation", "platform_structure", "public_docs_observation"),
  record("higgsfield_public_product_reference_observation", "Higgsfield public product/reference workflow observation", "platform_structure", "public_docs_observation"),
  record("cinejelly_short_director_pipe_contract", "CineJelly Short Director pipe contract", "director_workflow", "cinejelly_owned"),
  record("openai_image_reference_board_workflow", "OpenAI image-generation reference-board workflow", "visual_bible", "public_docs_observation"),
  record("anil_seedance2_comfyui_consistent_character_workflow", "Anil-matcha/seedance2-comfyui consistent-character workflow", "visual_bible", "public_docs_observation"),
  record("hkuds_vimax_reference_consistency_patterns", "HKUDS/ViMax reference-selection and consistency patterns", "visual_bible", "public_docs_observation"),
  record("vericontext_vibeframe_storyboard_to_video_workflow", "vericontext/vibeframe storyboard-to-video workflow", "visual_bible", "public_docs_observation"),
  record("cinejelly_short_prompt_corpus", "CineJelly short prompt corpus", "prompt_corpus", "cinejelly_owned"),
  record("youmind_awesome_seedance_2_prompts_distilled_3817_cc_by_4_0", "YouMind-OpenLab/awesome-seedance-2-prompts:distilled-3817-cc-by-4.0", "prompt_corpus", "cc_by_4_0_distilled_structure"),
  record("emily_seedance_skill_os_mit", "Emily2040/seedance-2.0:seedance-skill-os-mit", "prompt_corpus", "mit_licensed_structure"),
  record("zerolu_awesome_seedance_prompt_pattern_attribution", "ZeroLu/awesome-seedance:prompt-pattern-attribution", "prompt_corpus", "attribution_required_distilled_structure"),
  record("topview_public_api_docs_workflow_structure", "Topview AI public API/docs:workflow-structure-observation", "platform_structure", "public_docs_observation"),
  record("higgsfield_product_to_video_guide", "Higgsfield official product-to-video guide:public-structure-observation", "platform_structure", "public_docs_observation"),
  record("higgsfield_cinematic_prompt_guide", "Higgsfield official cinematic prompt guide:public-structure-observation", "platform_structure", "public_docs_observation"),
  record("higgsfield_skills_mit", "higgsfield-ai/skills:mit-licensed-marketing-studio-and-virality-structure", "platform_structure", "mit_licensed_structure"),
  record("osidemedia_higgsfield_prompt_skill_mit", "OSideMedia/higgsfield-ai-prompt-skill:mit-licensed-structure", "platform_structure", "mit_licensed_structure"),
  record("youmind_awesome_seedance_2_prompts_cc_by_distilled_structure", "YouMind-OpenLab/awesome-seedance-2-prompts:cc-by-distilled-structure", "platform_structure", "cc_by_4_0_distilled_structure"),
  record("cinejelly_operator_remake_patterns", "CineJelly operator-approved source-video remake patterns", "platform_structure", "cinejelly_owned"),
  record("calesthio_openmontage", "calesthio/OpenMontage", "video_planning", "public_docs_observation"),
  record("hkuds_vimax", "HKUDS/ViMax", "video_planning", "public_docs_observation"),
  record("hkuds_videoagent", "HKUDS/VideoAgent", "video_planning", "public_docs_observation"),
  record("video_db_director", "video-db/Director", "director_workflow", "public_docs_observation"),
  record("vericontext_vibeframe", "vericontext/vibeframe", "video_planning", "public_docs_observation"),
  record("harry_moneyprinterturbo", "harry0703/MoneyPrinterTurbo", "video_planning", "public_docs_observation"),
  record("jiaminchen_directorbench", "jiaminchen-1031/DirectorBench", "director_workflow", "public_docs_observation"),
  record("hereandnow_langgraph_workflows", "hereandnowai/master-langgraph-workflows-in-python-20-real-world-agent-projects-by-hereandnow-ai", "agent_workflow", "public_docs_observation"),
  record("hereandnow_langgraph_workflows_short_label", "hereandnowai/master-langgraph-workflows-in-python-20-real-world-agent-projects", "agent_workflow", "public_docs_observation"),
  record("nirdiamant_genai_agents_content", "nirdiamant/genai_agents:ContentIntelligence", "agent_workflow", "public_docs_observation"),
  record("gswithjeff_autogen", "gswithjeff/autogen-multi-agent-workflow", "agent_workflow", "public_docs_observation"),
  record("shubhamsaboo_awesome_llm_apps", "Shubhamsaboo/awesome-llm-apps", "agent_workflow", "public_docs_observation"),
  record("youmind_awesome_seedance_2_prompts", "YouMind-OpenLab/awesome-seedance-2-prompts", "prompt_corpus", "cc_by_4_0_distilled_structure"),
  record("zerolu_awesome_seedance", "ZeroLu/awesome-seedance", "prompt_corpus", "attribution_required_distilled_structure"),
  record("emily_seedance_2", "Emily2040/seedance-2.0", "director_workflow", "mit_licensed_structure")
] as const;

export const PRIVATE_SOURCE_PATTERN_REGISTRY: Readonly<Record<PrivateSourcePatternId, PrivateSourcePatternRecord>> =
  Object.fromEntries(RECORDS.map((item) => [item.id, item])) as Readonly<Record<PrivateSourcePatternId, PrivateSourcePatternRecord>>;

const SNAPSHOT_PATHS: Partial<Record<PrivateSourcePatternId, string>> = {
  emily_seedance_2: "external/upstream/seedance-2.0/references/reference-workflow.md",
  hkuds_vimax: "external/upstream/vimax/agent_runtime/session_index.py",
  vericontext_vibeframe: "external/upstream/vibeframe/README.md"
};

export const SHORT_CORE_SOURCE_PATTERN_IDS = [
  "calesthio_openmontage",
  "hkuds_vimax",
  "hkuds_videoagent",
  "video_db_director",
  "vericontext_vibeframe"
] as const;

export const SHORT_PRODUCT_SOURCE_PATTERN_IDS = [
  "calesthio_openmontage",
  "hkuds_videoagent",
  "vericontext_vibeframe"
] as const;

export const SHORT_BRAND_SOURCE_PATTERN_IDS = [
  "calesthio_openmontage",
  "vericontext_vibeframe"
] as const;

export const SHORT_AGENT_SOURCE_PATTERN_IDS = [
  "hereandnow_langgraph_workflows",
  "nirdiamant_genai_agents_content",
  "gswithjeff_autogen",
  "shubhamsaboo_awesome_llm_apps",
  "youmind_awesome_seedance_2_prompts",
  "zerolu_awesome_seedance"
] as const;

export const SHORT_PROMPT_CORPUS_SOURCE_PATTERN_IDS = [
  "youmind_awesome_seedance_2_prompts_distilled_3817_cc_by_4_0",
  "emily_seedance_skill_os_mit",
  "zerolu_awesome_seedance_prompt_pattern_attribution"
] as const;

export const SHORT_PLATFORM_TEMPLATE_CORPUS_SOURCE_PATTERN_IDS = [
  "topview_public_api_docs_workflow_structure",
  "higgsfield_product_to_video_guide",
  "higgsfield_cinematic_prompt_guide",
  "higgsfield_skills_mit",
  "osidemedia_higgsfield_prompt_skill_mit",
  "youmind_awesome_seedance_2_prompts_cc_by_distilled_structure",
  "cinejelly_operator_remake_patterns"
] as const;

export const SHORT_VISUAL_BIBLE_SOURCE_PATTERN_IDS = [
  "openai_image_reference_board_workflow",
  "anil_seedance2_comfyui_consistent_character_workflow",
  "hkuds_vimax_reference_consistency_patterns",
  "vericontext_vibeframe_storyboard_to_video_workflow",
  "cinejelly_short_prompt_corpus"
] as const;

export const SHORT_VIDEO_PIPE_SOURCE_PATTERN_IDS = [
  "topview_workflow_mode_observation",
  "higgsfield_public_product_reference_observation",
  "cinejelly_short_director_pipe_contract"
] as const;

export const SHORT_DIRECTOR_SOURCE_PATTERN_IDS = [
  "emily_seedance_2",
  "calesthio_openmontage",
  "youmind_awesome_seedance_2_prompts",
  "video_db_director"
] as const;

export const SHORT_COMMERCIAL_READINESS_SOURCE_PATTERN_IDS = [
  ...SHORT_AGENT_SOURCE_PATTERN_IDS,
  "calesthio_openmontage",
  "vericontext_vibeframe"
] as const;

export const SHORT_CHANNEL_STYLE_SOURCE_PATTERN_IDS = [
  "nirdiamant_genai_agents_content",
  "gswithjeff_autogen",
  "youmind_awesome_seedance_2_prompts",
  "zerolu_awesome_seedance",
  "calesthio_openmontage",
  "vericontext_vibeframe"
] as const;

export const LONG_FORM_REVIEW_SOURCE_PATTERN_IDS = [
  "hkuds_vimax",
  "hkuds_videoagent",
  "vericontext_vibeframe"
] as const;

export const LONG_FORM_TIMELINE_SOURCE_PATTERN_IDS = [
  "hkuds_vimax",
  "hkuds_videoagent",
  "vericontext_vibeframe",
  "harry_moneyprinterturbo"
] as const;

export const LONG_FORM_CREATIVE_INTELLIGENCE_SOURCE_PATTERN_IDS = [
  "hkuds_vimax",
  "hkuds_videoagent",
  "vericontext_vibeframe",
  "calesthio_openmontage",
  "jiaminchen_directorbench",
  "harry_moneyprinterturbo",
  "youmind_awesome_seedance_2_prompts"
] as const;

export const LONG_FORM_READINESS_SOURCE_PATTERN_IDS = [
  "hereandnow_langgraph_workflows_short_label",
  "nirdiamant_genai_agents_content",
  "gswithjeff_autogen",
  "shubhamsaboo_awesome_llm_apps",
  "youmind_awesome_seedance_2_prompts",
  "zerolu_awesome_seedance",
  "hkuds_vimax",
  "hkuds_videoagent",
  "vericontext_vibeframe",
  "calesthio_openmontage",
  "jiaminchen_directorbench"
] as const;

export const LONG_DIRECTOR_SOURCE_PATTERN_IDS = [
  "emily_seedance_2",
  "calesthio_openmontage",
  "hkuds_vimax",
  "vericontext_vibeframe"
] as const;

export const VIDEO_RENDER_STRATEGY_SOURCE_PATTERN_IDS = [
  "hkuds_videoagent",
  "vericontext_vibeframe",
  "harry_moneyprinterturbo"
] as const;

export const RENDER_SCHEDULER_SOURCE_PATTERN_IDS = LONG_FORM_REVIEW_SOURCE_PATTERN_IDS;

export const POSTPRODUCTION_ASSET_SOURCE_PATTERN_IDS = [
  "harry_moneyprinterturbo",
  "vericontext_vibeframe"
] as const;

export const MATERIAL_SOURCING_SOURCE_PATTERN_IDS = [
  "harry_moneyprinterturbo"
] as const;

export const PHASE6_VALIDATION_READINESS_SOURCE_PATTERN_IDS = [
  "vericontext_vibeframe",
  "harry_moneyprinterturbo"
] as const;

export const PHASE6_RENDER_VALIDATION_SOURCE_PATTERN_IDS = [
  "vericontext_vibeframe",
  "harry_moneyprinterturbo",
  "calesthio_openmontage"
] as const;

export const DIRECTOR_STYLE_BENCHMARK_SOURCE_PATTERN_IDS = [
  "jiaminchen_directorbench",
  "vericontext_vibeframe"
] as const;

export const REVIEW_APPROVAL_SOURCE_PATTERN_IDS: Readonly<Record<ReviewApprovalSurface, readonly PrivateSourcePatternId[]>> = {
  scene: ["calesthio_openmontage", "hkuds_vimax", "hkuds_videoagent"],
  audio: ["harry_moneyprinterturbo", "jiaminchen_directorbench"],
  caption: ["harry_moneyprinterturbo", "vericontext_vibeframe"],
  claim: ["calesthio_openmontage", "vericontext_vibeframe"]
};

export const PRODUCTION_STAGE_SOURCE_PATTERN_IDS: Readonly<Record<ProductionStageName, readonly PrivateSourcePatternId[]>> = {
  plan: ["hkuds_vimax", "vericontext_vibeframe"],
  storyboard: ["hkuds_vimax", "vericontext_vibeframe"],
  prompt: ["emily_seedance_2", "youmind_awesome_seedance_2_prompts"],
  source_material: ["harry_moneyprinterturbo"],
  render: ["hkuds_vimax", "vericontext_vibeframe"],
  inspect: ["vericontext_vibeframe"],
  repair: ["hkuds_vimax", "vericontext_vibeframe"],
  assemble: ["harry_moneyprinterturbo", "vericontext_vibeframe"],
  deliver: ["vericontext_vibeframe"]
};

export function internalSourcePatternOrigins(ids: readonly PrivateSourcePatternId[]): readonly string[] {
  return ids.map((id) => PRIVATE_SOURCE_PATTERN_REGISTRY[id].label);
}

export function internalSourcePatternOrigin(id: PrivateSourcePatternId): string {
  return PRIVATE_SOURCE_PATTERN_REGISTRY[id].label;
}

export function internalSourcePatternSnapshotPath(id: PrivateSourcePatternId): string {
  return SNAPSHOT_PATHS[id] ?? "external/upstream/source-pattern-registry";
}

export function reviewApprovalSourcePatternOrigins(surface: ReviewApprovalSurface): readonly string[] {
  return internalSourcePatternOrigins(REVIEW_APPROVAL_SOURCE_PATTERN_IDS[surface]);
}

export function productionStageSourcePatternOrigins(stage: ProductionStageName): readonly string[] {
  return internalSourcePatternOrigins(PRODUCTION_STAGE_SOURCE_PATTERN_IDS[stage]);
}

export function privateSourcePatternLabels(): readonly string[] {
  return RECORDS.map((item) => item.label);
}

export function privateSourcePatternUiForbiddenFragments(): readonly string[] {
  return [
    ...privateSourcePatternLabels(),
    "Topview",
    "Higgsfield",
    "OpenMontage",
    "VideoAgent",
    "ViMax",
    "vibeframe",
    "YouMind-OpenLab",
    "ZeroLu",
    "Emily2040",
    "higgsfield-ai",
    "OSideMedia",
    "calesthio/",
    "HKUDS/",
    "video-db/",
    "vericontext/",
    "harry0703/",
    "MoneyPrinterTurbo",
    "jiaminchen-1031/",
    "DirectorBench",
    "nirdiamant/",
    "gswithjeff/",
    "Shubhamsaboo/",
    "hereandnowai/",
    "Anil-matcha/"
  ];
}

export function containsPrivateSourcePatternText(value: string): boolean {
  const lowered = value.toLowerCase();
  return privateSourcePatternUiForbiddenFragments().some((fragment) => lowered.includes(fragment.toLowerCase()));
}

const UI_REDACTION_REPLACEMENTS: readonly (readonly [RegExp, string])[] = [
  [/\bTopview(?: AI)?(?:-style)?\b/gi, "platform-native"],
  [/\bHiggsfield\b/gi, "cinematic"],
  [/\bOpenMontage\b/gi, "storyboard"],
  [/\bVideoAgent\b/gi, "video-agentic"],
  [/\bViMax\b/gi, "reference-consistency"],
  [/\bvibeframe\b/gi, "storyboard-video"],
  [/\bYouMind-OpenLab\/awesome-seedance-2-prompts\b/gi, "prompt-corpus"],
  [/\bZeroLu\/awesome-seedance\b/gi, "prompt-corpus"],
  [/\bEmily2040\/seedance-2\.0\b/gi, "prompt-skill"],
  [/\bhiggsfield-ai\/skills\b/gi, "platform-skill"],
  [/\bOSideMedia\/higgsfield-ai-prompt-skill\b/gi, "platform-skill"],
  [/\bcalesthio\/OpenMontage\b/gi, "storyboard-planning"],
  [/\bHKUDS\/VideoAgent\b/gi, "video-agentic-planning"],
  [/\bHKUDS\/ViMax\b/gi, "reference-consistency-planning"],
  [/\bvideo-db\/Director\b/gi, "director-planning"],
  [/\bvericontext\/vibeframe\b/gi, "storyboard-video-planning"],
  [/\bharry0703\/MoneyPrinterTurbo\b/gi, "postproduction-planning"],
  [/\bjiaminchen-1031\/DirectorBench\b/gi, "director-benchmarking"],
  [/\bMoneyPrinterTurbo\b/gi, "postproduction-planning"],
  [/\bDirectorBench\b/gi, "director-benchmarking"],
  [/moneyprinterturbo/gi, "postproduction-planning"],
  [/directorbench/gi, "director-benchmarking"],
  [/\bnirdiamant\/genai_agents(?::ContentIntelligence)?\b/gi, "content-intelligence"],
  [/\bgswithjeff\/autogen-multi-agent-workflow\b/gi, "multi-agent-workflow"],
  [/\bShubhamsaboo\/awesome-llm-apps\b/gi, "agent-app-patterns"],
  [/\bhereandnowai\/master-langgraph-workflows-in-python-20-real-world-agent-projects-by-hereandnow-ai\b/gi, "agent-graph-workflows"],
  [/\bAnil-matcha\/seedance2-comfyui\b/gi, "consistent-character-workflow"]
];

export function redactPrivateSourcePatternText(value: string): string {
  return UI_REDACTION_REPLACEMENTS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
}

function record(
  id: PrivateSourcePatternId,
  label: string,
  category: PrivateSourcePatternCategory,
  licensePosture: PrivateSourcePatternLicensePosture
): PrivateSourcePatternRecord {
  return {
    id,
    label,
    category,
    licensePosture,
    visibility: "internal_only",
    uiExposure: "never",
    runtimePolicy: "distilled_structure_only_no_verbatim_copy",
    commercialPolicy: "allowed_for_backend_evidence_subject_to_license_and_source_review"
  };
}
