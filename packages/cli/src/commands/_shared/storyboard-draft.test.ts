import { describe, expect, it } from "vitest";

import { draftStoryboardFromBrief } from "./storyboard-draft.js";
import { getVisualStyle } from "./visual-styles.js";

describe("draftStoryboardFromBrief", () => {
  it("drafts concrete apex-story cues instead of placeholders", () => {
    const draft = draftStoryboardFromBrief({
      name: "apex-story",
      brief: "24-second calm mountain sunrise launch video for Apex Ridge",
      durationSec: 24,
      aspect: "16:9",
    });

    expect(draft.storyboardMd).toContain('title: "Apex Ridge"');
    expect(draft.storyboardMd).toContain("## Beat mechanism - Built from files");
    expect(draft.storyboardMd).toContain(
      'narration: "The first light reaches Apex Ridge before the day begins."'
    );
    expect(draft.storyboardMd).toContain("A storyboard becomes files, reports, scenes, and a render plan.");
    expect(draft.storyboardMd).not.toMatch(/Open with the viewer|from the brief|Show the mechanism that makes/);
  });

  it("preserves visual style when drafting from a brief", () => {
    const swiss = getVisualStyle("Swiss Pulse");
    expect(swiss).toBeDefined();

    const draft = draftStoryboardFromBrief({
      name: "my-video",
      brief: "30-second product launch video for Grid Pilot",
      durationSec: 30,
      visualStyle: swiss,
    });

    expect(draft.designMd).toContain("Swiss Pulse");
    expect(draft.designMd).toContain("#0066FF");
    expect(draft.designMd).not.toContain("_hex_");
  });
});
