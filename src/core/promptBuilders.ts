import type {
  Beat,
  Character,
  LengthTarget,
  StoryProject,
} from "../types/story";
import { getContextWindow } from "./context";

const LENGTH_GUIDANCE: Record<LengthTarget, string> = {
  short: "Target ~800-1500 words in final narrative.",
  medium: "Target ~1500-3000 words in final narrative.",
  long: "Target ~3000-6000 words in final narrative.",
};

function buildCastSection(characters: Character[]): string {
  return characters
    .map((c) => {
      const persona = c.persona_prompt.slice(0, 420);
      return [
        `- ID: ${c.id}`,
        `  Name: ${c.name}`,
        `  Source: ${c.source_work}`,
        `  Voice Style: ${c.voice_style}`,
        `  Motivations: ${c.motivations.join("; ")}`,
        `  Conflicts: ${c.conflicts.join("; ")}`,
        `  Persona snippet: ${persona}`,
      ].join("\n");
    })
    .join("\n");
}

function buildTranscript(beats: Beat[]): string {
  if (!beats.length) {
    return "(No beats yet. Start with an inciting action.)";
  }
  return beats.map((b) => `[${b.index}] ${b.speaker}: ${b.content}`).join("\n");
}

export function buildScriptPrompt(project: StoryProject, beatsToGenerate: number): string {
  const ctx = getContextWindow(project, 20);
  const outlineEnabled = !!project.outline_mode_enabled;
  const skeleton = project.scene_skeleton;
  const tracker =
    project.state_tracker_snapshots && project.state_tracker_snapshots.length
      ? project.state_tracker_snapshots[project.state_tracker_snapshots.length - 1]
      : undefined;
  const guidance = project.pending_guidance_note;

  return `
[SYSTEM ROLE]
You are a screenplay scene engine. You must ACT the scene, not explain it.
Never mention being an AI. Never output meta commentary.

[OUTPUT CONTRACT]
Return ONLY valid JSON. No markdown. No extra text.
Schema:
{
  "beats": [
    {"speaker": "CHARACTER_ID_OR_STAGE", "content": "...", "beat_goal": "optional"}
  ],
  "scene_status": "continue|climax|end",
  "notes": {"tension": 0-10, "mystery": 0-10, "romance": 0-10}
}
Follow outputs like VALID EXAMPLE 1 and VALID EXAMPLE 2.
Do not produce outputs like INVALID EXAMPLE 1 and INVALID EXAMPLE 2.

VALID EXAMPLE 1:
{"beats":[{"speaker":"SHERLOCK_HOLMES","content":"The mud on his cuff came from the river stairs.","beat_goal":"Reveal physical clue"}],"scene_status":"continue","notes":{"tension":6,"mystery":8,"romance":1}}

VALID EXAMPLE 2:
{"beats":[{"speaker":"ELIZABETH_BENNET","content":"If we are to be frightened, let us at least be frightened intelligently."},{"speaker":"NARRATOR/STAGE","content":"A shutter slams in the wind."}],"scene_status":"climax","notes":{"tension":8,"mystery":7,"romance":2}}

INVALID EXAMPLE 1 (DO NOT DO THIS):
Output wrapped in markdown code fences like:
json + object + closing fence

INVALID EXAMPLE 2 (DO NOT DO THIS):
Here is your result:
{"beats":[{"speaker":"ROBIN_HOOD","content":"We move at dusk."}],"scene_status":"end"}

[SCENE SETUP]
Title: ${project.title}
Setting: ${project.setting}
Premise: ${project.premise}
Tone/Style: ${project.tone}
Length target: ${LENGTH_GUIDANCE[project.length_target]}

[CAST]
${buildCastSection(project.selected_characters)}

[SCENE SUMMARY SO FAR]
${ctx.summary}

[RECENT TRANSCRIPT]
${buildTranscript(ctx.recentBeats)}

${outlineEnabled && skeleton
    ? `[SCENE SKELETON]
Goal: ${skeleton.goal}
Opposition: ${skeleton.opposition}
Plan: ${skeleton.plan}
Turn: ${skeleton.turn}
Choice (must appear as protagonist decision): ${skeleton.choice}
Cost: ${skeleton.cost}
Outcome: ${skeleton.outcome}
Protagonist: ${skeleton.protagonist}
Must include: ${skeleton.constraints.must_include.join("; ") || "none"}
Must avoid: ${skeleton.constraints.must_avoid.join("; ") || "none"}
Skeleton locked: ${project.scene_skeleton_locked ? "yes" : "no"}

[OUTLINE ENFORCEMENT]
- Include at least one protagonist decision aligned to Choice.
- Include at least one consequence aligned to Cost or Outcome.
- Include at least one spoken refusal/commitment OR one physical action by protagonist.
` : ""}

${tracker
    ? `[TRACKER]
Intent: ${tracker.protagonist_intent}
Commitment: ${tracker.protagonist_commitment ?? "none yet"}
Has decision: ${tracker.has_decision}
Has cost/consequence: ${tracker.has_cost_or_consequence}
` : ""}

${guidance ? `[GUIDANCE NOTE]\n${guidance}\n` : ""}

[TASK]
Generate exactly ${beatsToGenerate} new beat(s) in character.
Use speakers from cast IDs, or NARRATOR/STAGE only when needed.
Push conflict forward. Keep voices distinct.
Each beat content must be complete and not cut off mid-sentence.
  `.trim();
}

export function buildJsonRepairPrompt(rawOutput: string): string {
  return `
Return valid JSON ONLY matching this exact schema:
{
  "beats": [
    {"speaker": "CHARACTER_ID_OR_STAGE", "content": "...", "beat_goal": "optional"}
  ],
  "scene_status": "continue|climax|end",
  "notes": {"tension": 0-10, "mystery": 0-10, "romance": 0-10}
}
Follow VALID REPAIR EXAMPLE.
Do not produce output like INVALID REPAIR EXAMPLE.

VALID REPAIR EXAMPLE:
{"beats":[{"speaker":"NARRATOR/STAGE","content":"A candle gutters and then steadies."}],"scene_status":"continue","notes":{"tension":5,"mystery":6,"romance":1}}

INVALID REPAIR EXAMPLE (DO NOT DO THIS):
Sure, I fixed it:
{"beats":[{"speaker":"NARRATOR/STAGE","content":"A candle gutters."}],"scene_status":"finished","notes":{"tension":"high"}}

Repair this content into valid JSON:
${rawOutput}
  `.trim();
}

export function buildSceneSkeletonPrompt(project: StoryProject): string {
  const cast = project.selected_characters
    .map((c) => `${c.id}: ${c.name} (${c.voice_style})`)
    .join("\n");

  return `
[ROLE]
Create a scene skeleton before dialogue generation.

[OUTPUT CONTRACT]
Return ONLY valid JSON. No markdown.
{
  "goal": "string",
  "opposition": "string",
  "plan": "string",
  "turn": "string",
  "choice": "string",
  "cost": "string",
  "outcome": "string",
  "protagonist": "CHARACTER_ID_OR_NAME",
  "constraints": {
    "must_include": ["string"],
    "must_avoid": ["string"]
  }
}

VALID EXAMPLE:
{"goal":"Recover the black ledger before dawn.","opposition":"The ledger is held by DRACULA's steward under armed guard.","plan":"SHERLOCK_HOLMES and DR_JOHN_WATSON bluff entry as inspectors.","turn":"The steward recognizes Holmes and bars the inner gate.","choice":"SHERLOCK_HOLMES orders Watson to break cover and seize the gate chain.","cost":"Holmes sacrifices anonymity and becomes a direct target.","outcome":"The gate is opened but Dracula is alerted.","protagonist":"SHERLOCK_HOLMES","constraints":{"must_include":["spoken refusal","physical action"],"must_avoid":["protagonist silent entire scene"]}}

INVALID EXAMPLE (DO NOT DO THIS):
Here is your skeleton:
{"goal":"Find clue"}

[STORY SETUP]
Title: ${project.title}
Setting: ${project.setting}
Premise: ${project.premise}
Tone: ${project.tone}
Cast:
${cast}
  `.trim();
}

export function buildSceneSkeletonRepairPrompt(rawOutput: string): string {
  return `
Return valid JSON ONLY matching this exact schema:
{
  "goal": "string",
  "opposition": "string",
  "plan": "string",
  "turn": "string",
  "choice": "string",
  "cost": "string",
  "outcome": "string",
  "protagonist": "CHARACTER_ID_OR_NAME",
  "constraints": {
    "must_include": ["string"],
    "must_avoid": ["string"]
  }
}

Repair this content into valid JSON:
${rawOutput}
  `.trim();
}

export function buildBeatRepairPrompt(
  project: StoryProject,
  beatsToGenerate: number,
  repairInstruction: string,
): string {
  return `${buildScriptPrompt(project, beatsToGenerate)}\n\n[REPAIR TASK]\n${repairInstruction}`;
}

export function buildSummaryPrompt(project: StoryProject): string {
  const beats = project.script_beats
    .filter((b) => !b.isSummary)
    .slice(-30);

  return `
Summarize this story state in under 200 tokens.
Focus on plot state, relationships, unresolved tensions, and immediate next risks.

Setting: ${project.setting}
Premise: ${project.premise}
Tone: ${project.tone}

Transcript:
${buildTranscript(beats)}
  `.trim();
}

export function buildNarrativePrompt(
  project: StoryProject,
  pacing: number,
  atmosphere: number,
  revisionInstruction?: string,
): string {
  const transcript = buildTranscript(project.script_beats.filter((b) => !b.isSummary));

  return `
[ROLE]
Rewrite the transcript into polished prose fiction.
Do not include speaker labels or meta explanation.

[STYLE]
Tone: ${project.tone}
Length goal: ${LENGTH_GUIDANCE[project.length_target]}
Pacing slider (0-100): ${pacing}
Atmosphere slider (0-100): ${atmosphere}

[REQUIREMENTS]
- Write coherent paragraphs with scene description and action.
- Preserve each character's intent and distinct voice.
- Remove repetition and filler.
- Keep continuity with setup and transcript.

[SETUP]
Title: ${project.title}
Setting: ${project.setting}
Premise: ${project.premise}
Cast: ${project.selected_characters.map((c) => c.name).join(", ")}

[TRANSCRIPT]
${transcript}

${revisionInstruction ? `[REVISION INSTRUCTION]\n${revisionInstruction}\n` : ""}[OUTPUT]
Return only the final narrative prose.
  `.trim();
}

export function buildNarrativeContinuationPrompt(project: StoryProject, partialProse: string): string {
  const tail = partialProse.slice(-1400);
  return `
[ROLE]
Continue the story prose seamlessly from the exact final phrase.
Do not restart. Do not summarize. Do not add headings.

[SETUP]
Title: ${project.title}
Tone: ${project.tone}
Setting: ${project.setting}

[CURRENT ENDING FRAGMENT]
${tail}

[TASK]
Write only the next 1-3 sentences needed to finish the interrupted sentence/paragraph naturally.
Return prose only.
  `.trim();
}

export function buildPremiseSuggestionPrompt(setting: string, tone: string, cast: Character[]): string {
  return `
Generate one compelling story premise in 2-3 sentences.
Avoid cliches. Keep it specific and conflict-driven.
Setting: ${setting}
Tone: ${tone}
Cast: ${cast.map((c) => `${c.name} (${c.source_work})`).join(", ")}
  `.trim();
}
