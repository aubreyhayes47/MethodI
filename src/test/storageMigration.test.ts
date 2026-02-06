import { describe, expect, it } from "vitest";
import { StoryProjectSchema } from "../types/story";

describe("project schema backward compatibility", () => {
  it("loads legacy project payload without outline fields", () => {
    const legacy = {
      id: "old_1",
      title: "Legacy",
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
      premise: "Recover ledger",
      tone: "Victorian",
      length_target: "short",
      script_beats: [],
      final_prose_versions: [],
      scene_summary: "",
    };

    const parsed = StoryProjectSchema.safeParse(legacy);
    expect(parsed.success).toBe(true);
  });
});
