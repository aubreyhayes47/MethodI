import { describe, expect, it } from "vitest";
import { analyzePassiveScene } from "../core/passiveScene";
import type { Beat, SceneSkeleton } from "../types/story";

const skeleton: SceneSkeleton = {
  goal: "Get the ledger",
  opposition: "Steward with guards",
  plan: "Bluff inspection",
  turn: "Gate is sealed",
  choice: "Holmes orders Watson to break cover",
  cost: "Holmes loses anonymity",
  outcome: "Gate opens but alarm sounds",
  protagonist: "SHERLOCK_HOLMES",
  constraints: {
    must_include: ["spoken refusal"],
    must_avoid: ["protagonist silent entire scene"],
  },
};

describe("analyzePassiveScene", () => {
  it("flags passive beats missing decision and consequence", () => {
    const beats: Beat[] = [
      {
        index: 0,
        speaker: "DR_JOHN_WATSON",
        content: "The fog thickens around the gate.",
        timestamp: new Date().toISOString(),
      },
    ];

    const result = analyzePassiveScene(beats, skeleton);
    expect(result.valid).toBe(false);
    expect(result.missing.length).toBeGreaterThan(0);
    expect(result.tracker.has_decision).toBe(false);
  });

  it("passes when decision + cost and action are present", () => {
    const beats: Beat[] = [
      {
        index: 0,
        speaker: "SHERLOCK_HOLMES",
        content: "I choose this now; Watson, break cover and pull the chain.",
        timestamp: new Date().toISOString(),
      },
      {
        index: 1,
        speaker: "NARRATOR/STAGE",
        content: "The gate opens, and Holmes loses anonymity as the alarm rings.",
        timestamp: new Date().toISOString(),
      },
    ];

    const result = analyzePassiveScene(beats, skeleton);
    expect(result.valid).toBe(true);
    expect(result.tracker.has_cost_or_consequence).toBe(true);
  });
});
