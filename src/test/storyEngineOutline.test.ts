import { describe, expect, it } from "vitest";
import { generateScriptBeats } from "../core/storyEngine";
import type { AppSettings, StoryProject } from "../types/story";

const settings: AppSettings = {
  ollamaBaseUrl: "http://127.0.0.1:11434",
  modelConfig: {
    model: "test-model",
    temperature: 0.8,
    top_p: 0.9,
    num_ctx: 4096,
    num_predict: 200,
  },
  stylePacing: 50,
  styleAtmosphere: 50,
  defaultOutlineMode: true,
  repairBeatsCount: 2,
};

const baseProject: StoryProject = {
  id: "p1",
  title: "Outline Test",
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
  outline_mode_enabled: true,
  scene_skeleton_locked: false,
  scene_skeleton: {
    goal: "Get the ledger",
    opposition: "Steward with guards",
    plan: "Bluff inspection",
    turn: "Gate is sealed",
    choice: "Holmes orders Watson to break cover",
    cost: "Holmes loses anonymity",
    outcome: "Gate opens but alarm sounds",
    protagonist: "SHERLOCK_HOLMES",
    constraints: { must_include: [], must_avoid: [] },
  },
  state_tracker_snapshots: [],
  passive_warning: null,
  pending_guidance_note: null,
};

describe("outline orchestration", () => {
  it("triggers one repair pass when initial beats are passive", async () => {
    let callCount = 0;
    const client = {
      generate: async (prompt: string) => {
        callCount += 1;
        if (prompt.includes("[REPAIR TASK]")) {
          return {
            text: JSON.stringify({
              beats: [
                {
                  speaker: "SHERLOCK_HOLMES",
                  content: "I choose this now. Watson, break cover and seize the chain.",
                },
              ],
              scene_status: "continue",
              notes: { tension: 7, mystery: 8, romance: 1 },
            }),
          };
        }

        return {
          text: JSON.stringify({
            beats: [{ speaker: "DR_JOHN_WATSON", content: "The fog drifts over the gate." }],
            scene_status: "continue",
            notes: { tension: 4, mystery: 6, romance: 0 },
          }),
        };
      },
    } as unknown as {
      generate: (prompt: string, ...args: unknown[]) => Promise<{ text: string }>;
    };

    const result = await generateScriptBeats({
      client: client as never,
      project: baseProject,
      settings,
      beatsToGenerate: 1,
      signal: new AbortController().signal,
    });

    expect(callCount).toBeGreaterThanOrEqual(2);
    expect(result.repairApplied).toBe(true);
    expect(result.newBeats[0]?.speaker).toBe("SHERLOCK_HOLMES");
  });
});
