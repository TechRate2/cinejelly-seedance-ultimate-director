const BASE = "file:///C:/Users/Admin/cinejelly-seedance-ultimate-director/dist";
const { ShortPipelinePlanner } = await import(BASE + "/core/short-pipeline-planner.js");

const planner = new ShortPipelinePlanner();

const cases = [
  // [label, userPrompt, targetDurationSeconds(optional)]
  ["hyphenated 30-second", "Make a 30-second ad for my coffee brand"],
  ["hyphenated 8-minute", "Make an 8-minute drama episode"],
  ["spaced 2 min", "Make a 2 min product demo"],
  ["bare 45s", "Make a 45s teaser"],
  ["bare 120s", "Make a 120s explainer"],
  ["word eight minute", "Make an eight minute short film"],
  ["word two minutes", "Make a two minutes ad"],
  ["decimal 1.5 min", "Make a 1.5 min ad for shoes"],
  ["decimal 2.5 minutes", "Make a 2.5 minutes explainer"],
  ["decimal 0.5 min", "Make a 0.5 min teaser"],
  ["compound 1m30s", "Make a 1m30s clip"],
  ["compound a minute and a half", "Make a minute and a half video"],
  ["range 30-45 seconds", "Make a 30-45 seconds ad"],
  ["mid sentence 90 seconds", "I want, roughly 90 seconds, a fun product reel"],
  ["late sentence 3 minutes", "A cinematic brand story that runs 3 minutes"],
  ["conflict sec-then-min", "Make a 30 second ad... no make it 2 minutes"],
  ["conflict min-then-sec", "Make a 2 minute ad... no make it 30 seconds"],
  ["field vs text (field wins?)", "Make a 2 minute ad", 45],
  ["out-of-range 5s", "Make a 5s bumper"],
  ["out-of-range 600s", "Make a 600 second epic"],
  ["out-of-range 0", "Make a 0 second clip"],
  ["non-integer field", "Make an ad", 90.7],
  ["no duration default", "Make an ad for my coffee brand"],
  ["half minute word", "Make a half minute ad"],
  ["seconds word-form ninety", "Make a ninety second ad"],
  ["min abbrev 5-min", "Make a 5-min explainer"],
  ["60-second exactly (band edge)", "Make a 60-second ad"],
  ["61 second (band edge)", "Make a 61 second ad"],
  ["decimal 1.5 minute singular", "Make a 1.5 minute ad"],
];

function route(secs) {
  return secs > 60 ? "production_bible(long)" : "short-band";
}

function run(label, userPrompt, targetDurationSeconds) {
  try {
    const input = {
      projectId: "p1",
      requestId: "r1",
      generatedAt: new Date("2026-06-19T00:00:00.000Z"),
      userPrompt,
    };
    if (targetDurationSeconds !== undefined) input.targetDurationSeconds = targetDurationSeconds;
    const plan = planner.buildPlan(input);
    const secs = plan.intent.targetDurationSeconds;
    const mode = plan.videoPipePlan?.selectedMode;
    console.log(`${label.padEnd(34)} => ${String(secs).padEnd(6)} route=${route(secs).padEnd(22)} selectedMode=${mode}`);
  } catch (e) {
    console.log(`${label.padEnd(34)} => CRASH: ${e.message}`);
  }
}

for (const [label, prompt, field] of cases) run(label, prompt, field);
