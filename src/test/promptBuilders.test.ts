import { describe, expect, it } from "vitest";
import {
  buildJsonRepairPrompt,
  buildNarrativePrompt,
  buildSceneSkeletonPrompt,
  buildScriptPrompt,
  buildSummaryPrompt,
} from "../core/promptBuilders";
import type { StoryProject } from "../types/story";

const baseProject: StoryProject = {
  id: "p1",
  title: "Fog Over Baker Street",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  selected_characters: [
    {
      id: "SHERLOCK_HOLMES",
      name: "Sherlock Holmes",
      source_work: "Doyle",
      public_domain_note: "PD",
      persona_prompt: "Analytic detective.",
      voice_constraints: ["A", "B", "C", "D", "E"],
      motivations: ["Solve", "Protect", "Truth"],
      conflicts: ["Detached", "Proud", "Risk"],
      voice_style: "Precise",
    },
    {
      id: "DR_JOHN_WATSON",
      name: "Dr. John Watson",
      source_work: "Doyle",
      public_domain_note: "PD",
      persona_prompt: "Doctor and observer.",
      voice_constraints: ["A", "B", "C", "D", "E"],
      motivations: ["Protect", "Observe", "Act"],
      conflicts: ["Loyal", "Concern", "Duty"],
      voice_style: "Warm",
    },
  ],
  setting: "London",
  premise: "A missing ledger implicates a nobleman.",
  tone: "Victorian",
  length_target: "short",
  script_beats: [
    {
      index: 0,
      speaker: "SHERLOCK_HOLMES",
      content: "The ash tells us more than the witness.",
      timestamp: new Date().toISOString(),
    },
  ],
  final_prose_versions: [],
  scene_summary: "Holmes suspects a forged alibi.",
};

describe("prompt builders", () => {
  it("builds script prompt with strict JSON contract", () => {
    const prompt = buildScriptPrompt(baseProject, 2);
    expect(prompt).toContain("Return ONLY valid JSON");
    expect(prompt).toContain("VALID EXAMPLE 1");
    expect(prompt).toContain("VALID EXAMPLE 2");
    expect(prompt).toContain("INVALID EXAMPLE 1");
    expect(prompt).toContain("INVALID EXAMPLE 2");
    expect(prompt).toContain("DO NOT DO THIS");
    expect(prompt).toContain("Generate exactly 2 new beat");
    expect(prompt).toContain("Holmes suspects a forged alibi");
  });

  it("builds repair prompt with valid and invalid examples", () => {
    const prompt = buildJsonRepairPrompt("bad output");
    expect(prompt).toContain("VALID REPAIR EXAMPLE");
    expect(prompt).toContain("INVALID REPAIR EXAMPLE");
    expect(prompt).toContain("Do not produce output like INVALID REPAIR EXAMPLE");
  });

  it("builds summary prompt with token guidance", () => {
    const prompt = buildSummaryPrompt(baseProject);
    expect(prompt).toContain("under 200 tokens");
    expect(prompt).toContain("A missing ledger");
  });

  it("builds narrative prompt with style sliders", () => {
    const prompt = buildNarrativePrompt(baseProject, 66, 40, "Make it tighter.");
    expect(prompt).toContain("Pacing slider (0-100): 66");
    expect(prompt).toContain("Make it tighter.");
    expect(prompt).toContain("Return only the final narrative prose");
  });

  it("builds scene skeleton prompt with strict contract", () => {
    const prompt = buildSceneSkeletonPrompt(baseProject);
    expect(prompt).toContain("\"goal\": \"string\"");
    expect(prompt).toContain("VALID EXAMPLE");
    expect(prompt).toContain("INVALID EXAMPLE");
  });
});
