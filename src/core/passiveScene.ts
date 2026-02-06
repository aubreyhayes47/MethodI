import type { Beat, SceneSkeleton, StateTrackerSnapshot } from "../types/story";
import { nowIso } from "../utils/time";

export type PassiveValidationResult = {
  valid: boolean;
  missing: string[];
  repairInstruction: string | null;
  tracker: StateTrackerSnapshot;
};

const DECISION_PATTERNS = ["i will", "i won't", "i choose", "decide", "must", "refuse", "swear"];
const ACTION_PATTERNS = ["steps", "grabs", "draws", "opens", "runs", "strikes", "kneels", "moves"];
const CONSEQUENCE_PATTERNS = ["cost", "lost", "wounded", "blood", "burned", "ruined", "consequence", "price"];

function includesAny(text: string, patterns: string[]): boolean {
  const t = text.toLowerCase();
  return patterns.some((p) => t.includes(p));
}

function lexicalOverlap(text: string, anchor: string): boolean {
  const words = anchor
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3)
    .slice(0, 8);
  if (!words.length) {
    return false;
  }
  const t = text.toLowerCase();
  let hits = 0;
  for (const word of words) {
    if (t.includes(word)) {
      hits += 1;
    }
  }
  return hits >= 2;
}

function findProtagonistBeats(beats: Beat[], protagonist: string): Beat[] {
  const key = protagonist.toLowerCase();
  return beats.filter((b) => b.speaker.toLowerCase() === key || b.speaker.toLowerCase().includes(key));
}

export function analyzePassiveScene(
  beats: Beat[],
  skeleton: SceneSkeleton,
  guidanceOverride: string | null = null,
): PassiveValidationResult {
  const protagonistBeats = findProtagonistBeats(beats, skeleton.protagonist);
  const textAll = beats.map((b) => b.content).join("\n");
  const protagonistText = protagonistBeats.map((b) => b.content).join("\n");

  const hasDecision =
    lexicalOverlap(protagonistText, skeleton.choice) ||
    includesAny(protagonistText, DECISION_PATTERNS) ||
    includesAny(textAll, skeleton.choice.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 5));

  const hasCostOrConsequence =
    lexicalOverlap(textAll, skeleton.cost) ||
    lexicalOverlap(textAll, skeleton.outcome) ||
    includesAny(textAll, CONSEQUENCE_PATTERNS);

  const hasCommitmentOrAction =
    includesAny(protagonistText, DECISION_PATTERNS) ||
    includesAny(protagonistText, ACTION_PATTERNS);

  const missing: string[] = [];
  if (!hasDecision) {
    missing.push("protagonist decision aligned to skeleton.choice");
  }
  if (!hasCostOrConsequence) {
    missing.push("consequence aligned to skeleton.cost or skeleton.outcome");
  }
  if (!hasCommitmentOrAction) {
    missing.push("spoken refusal/commitment or physical action by protagonist");
  }

  const guidanceNote =
    guidanceOverride ??
    (missing.length
      ? `Next beats must include protagonist decision + cost. Missing: ${missing.join(", ")}.`
      : null);

  return {
    valid: missing.length === 0,
    missing,
    repairInstruction: missing.length
      ? `Regenerate to satisfy: ${missing.join(", ")}. Preserve established facts and character voice.`
      : null,
    tracker: {
      timestamp: nowIso(),
      beat_index: beats.length ? beats[beats.length - 1].index : 0,
      protagonist_intent: skeleton.goal,
      protagonist_commitment: hasDecision ? skeleton.choice : null,
      has_decision: hasDecision,
      has_cost_or_consequence: hasCostOrConsequence,
      guidance_note: guidanceNote,
    },
  };
}
