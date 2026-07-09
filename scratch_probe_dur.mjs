const BASE = "file://C:/Users/Admin/cinejelly-seedance-ultimate-director/dist";
const { ShortPipelinePlanner } = await import(BASE + "/core/short-pipeline-planner.js");

const cases = [
  "Make a 1.5 min ad for shoes",
  "Make a 2.5 minutes ad for shoes",
  "Make a 0.5 min ad for shoes",
  "Make a 1.5 minute ad for shoes",
  // controls
  "Make a 90 second ad for shoes",
  "Make a 30 second ad for shoes",
];

for (const userPrompt of cases) {
  const plan = new ShortPipelinePlanner().buildPlan({
    projectId: "p1",
    requestId: "r1",
    generatedAt: new Date("2026-06-19T00:00:00.000Z"),
    userPrompt,
  });
  console.log(JSON.stringify({
    userPrompt,
    targetDurationSeconds: plan.intent.targetDurationSeconds,
    platform: plan.intent.platform,
    aspectRatio: plan.intent.aspectRatio,
    selectedMode: plan.videoPipePlan.selectedMode,
    status: plan.status,
  }));
}
