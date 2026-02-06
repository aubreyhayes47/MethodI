import { z } from "zod";

export const LengthTargetSchema = z.enum(["short", "medium", "long"]);
export type LengthTarget = z.infer<typeof LengthTargetSchema>;

export const SafetyCategorySchema = z.enum([
  "minor_sexual_content",
  "wrongdoing_instructions",
]);

export const CharacterSchema = z.object({
  id: z.string(),
  name: z.string(),
  source_work: z.string(),
  public_domain_note: z.string(),
  persona_prompt: z.string(),
  voice_constraints: z.array(z.string()).min(5).max(10),
  motivations: z.array(z.string()).min(3).max(6),
  conflicts: z.array(z.string()).min(3).max(6),
  voice_style: z.string(),
  taboo_list: z.array(z.string()).optional(),
});

export type Character = z.infer<typeof CharacterSchema>;

export const BeatSchema = z.object({
  index: z.number().int().nonnegative(),
  speaker: z.string(),
  content: z.string().min(1),
  beat_goal: z.string().optional(),
  timestamp: z.string(),
  pinned: z.boolean().optional(),
  isSummary: z.boolean().optional(),
});

export type Beat = z.infer<typeof BeatSchema>;

export const ModelConfigSchema = z.object({
  model: z.string(),
  temperature: z.number().min(0).max(2),
  top_p: z.number().min(0).max(1),
  num_ctx: z.number().int().positive(),
  num_predict: z.number().int().positive(),
});

export type ModelConfig = z.infer<typeof ModelConfigSchema>;

export const ProseVersionSchema = z.object({
  id: z.string(),
  created_at: z.string(),
  model_config: ModelConfigSchema,
  prose_text: z.string(),
});

export type ProseVersion = z.infer<typeof ProseVersionSchema>;

export const SceneSkeletonSchema = z.object({
  goal: z.string().min(1),
  opposition: z.string().min(1),
  plan: z.string().min(1),
  turn: z.string().min(1),
  choice: z.string().min(1),
  cost: z.string().min(1),
  outcome: z.string().min(1),
  protagonist: z.string().min(1),
  constraints: z.object({
    must_include: z.array(z.string()),
    must_avoid: z.array(z.string()),
  }),
});

export type SceneSkeleton = z.infer<typeof SceneSkeletonSchema>;

export const StateTrackerSnapshotSchema = z.object({
  timestamp: z.string(),
  beat_index: z.number().int().nonnegative(),
  protagonist_intent: z.string(),
  protagonist_commitment: z.string().nullable(),
  has_decision: z.boolean(),
  has_cost_or_consequence: z.boolean(),
  guidance_note: z.string().nullable(),
});

export type StateTrackerSnapshot = z.infer<typeof StateTrackerSnapshotSchema>;

export const StoryProjectSchema = z.object({
  id: z.string(),
  title: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  selected_characters: z.array(CharacterSchema).min(2).max(6),
  setting: z.string(),
  premise: z.string(),
  tone: z.string(),
  length_target: LengthTargetSchema,
  script_beats: z.array(BeatSchema),
  final_prose_versions: z.array(ProseVersionSchema),
  scene_summary: z.string(),
  outline_mode_enabled: z.boolean().optional(),
  scene_skeleton: SceneSkeletonSchema.optional(),
  scene_skeleton_locked: z.boolean().optional(),
  state_tracker_snapshots: z.array(StateTrackerSnapshotSchema).optional(),
  passive_warning: z.string().nullable().optional(),
  pending_guidance_note: z.string().nullable().optional(),
});

export type StoryProject = z.infer<typeof StoryProjectSchema>;

export const ScriptGenerationOutputSchema = z.object({
  beats: z.array(
    z.object({
      speaker: z.string(),
      content: z.string(),
      beat_goal: z.string().optional(),
    }),
  ),
  scene_status: z.enum(["continue", "climax", "end"]),
  notes: z.object({
    tension: z.number().min(0).max(10),
    mystery: z.number().min(0).max(10),
    romance: z.number().min(0).max(10),
  }),
});

export type ScriptGenerationOutput = z.infer<typeof ScriptGenerationOutputSchema>;

export const AppSettingsSchema = z.object({
  ollamaBaseUrl: z.string(),
  modelConfig: ModelConfigSchema,
  stylePacing: z.number().min(0).max(100),
  styleAtmosphere: z.number().min(0).max(100),
  defaultOutlineMode: z.boolean(),
  repairBeatsCount: z.number().int().min(1).max(6),
});

export type AppSettings = z.infer<typeof AppSettingsSchema>;

export const defaultSettings: AppSettings = {
  ollamaBaseUrl: "http://127.0.0.1:11434",
  modelConfig: {
    model: "llama3.1:8b-instruct",
    temperature: 0.8,
    top_p: 0.9,
    num_ctx: 8192,
    num_predict: 512,
  },
  stylePacing: 50,
  styleAtmosphere: 55,
  defaultOutlineMode: false,
  repairBeatsCount: 2,
};

export type OllamaModelTag = {
  name: string;
  size?: number;
  modified_at?: string;
};

export type SafetyResult = {
  blocked: boolean;
  categories: z.infer<typeof SafetyCategorySchema>[];
  reasons: string[];
};
