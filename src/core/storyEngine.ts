import { parseScriptJson } from "./jsonParser";
import {
  buildBeatRepairPrompt,
  buildSceneSkeletonPrompt,
  buildSceneSkeletonRepairPrompt,
  buildNarrativeContinuationPrompt,
  buildJsonRepairPrompt,
  buildNarrativePrompt,
  buildPremiseSuggestionPrompt,
  buildScriptPrompt,
  buildSummaryPrompt,
} from "./promptBuilders";
import { parseSceneSkeletonJson } from "./sceneSkeletonParser";
import { analyzePassiveScene } from "./passiveScene";
import { shouldRefreshSummary } from "./context";
import { scanForPolicyViolations } from "./safety";
import type { OllamaClient } from "../ollama/client";
import type {
  AppSettings,
  Beat,
  Character,
  ModelConfig,
  SceneSkeleton,
  ScriptGenerationOutput,
  StateTrackerSnapshot,
  StoryProject,
} from "../types/story";
import { nowIso } from "../utils/time";

const RAW_LOG_KEY = "method_i_raw_model_logs";

function logRawOutput(label: string, content: string): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  const current = localStorage.getItem(RAW_LOG_KEY);
  const parsed = current ? (JSON.parse(current) as Array<{ at: string; label: string; content: string }>) : [];
  parsed.unshift({ at: nowIso(), label, content });
  localStorage.setItem(RAW_LOG_KEY, JSON.stringify(parsed.slice(0, 100)));
}

function toBeats(parsed: ScriptGenerationOutput, startIndex: number): Beat[] {
  return parsed.beats.map((b, offset) => ({
    index: startIndex + offset,
    speaker: b.speaker,
    content: b.content.trim(),
    beat_goal: b.beat_goal,
    timestamp: nowIso(),
  }));
}

function summaryConfig(base: ModelConfig): ModelConfig {
  return {
    ...base,
    temperature: Math.min(base.temperature, 0.5),
    num_predict: 220,
  };
}

function endsLikeCompleteSentence(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  return /[.!?]["')\]]*$/.test(trimmed);
}

export async function generatePremiseSuggestion(
  client: OllamaClient,
  settings: AppSettings,
  setting: string,
  tone: string,
  cast: Character[],
): Promise<string> {
  const prompt = buildPremiseSuggestionPrompt(setting, tone, cast);
  const blocked = scanForPolicyViolations(prompt);
  if (blocked.blocked) {
    throw new Error(blocked.reasons.join(" "));
  }
  const res = await client.generate(prompt, settings.modelConfig, { stream: false });
  return res.text.trim();
}

export async function generateScriptBeats(args: {
  client: OllamaClient;
  project: StoryProject;
  settings: AppSettings;
  beatsToGenerate: number;
  signal: AbortSignal;
  onRawStream?: (chunk: string) => void;
}): Promise<{
  newBeats: Beat[];
  sceneStatus: string;
  notes: ScriptGenerationOutput["notes"];
  passiveWarning: string | null;
  trackerSnapshot: StateTrackerSnapshot | null;
  repairApplied: boolean;
}> {
  const prompt = buildScriptPrompt(args.project, args.beatsToGenerate);
  const safety = scanForPolicyViolations(prompt);
  if (safety.blocked) {
    throw new Error(`Blocked by local safety filter: ${safety.reasons.join(" ")}`);
  }

  let raw = "";
  const response = await args.client.generate(prompt, args.settings.modelConfig, {
    stream: true,
    signal: args.signal,
    onToken: (token) => {
      raw += token;
      args.onRawStream?.(token);
    },
  });

  if (!raw) {
    raw = response.text;
  }

  logRawOutput("script_raw", raw);

  let parsed = parseScriptJson(raw);

  if (!parsed.parsed) {
    const repairPrompt = buildJsonRepairPrompt(raw);
    const repaired = await args.client.generate(repairPrompt, {
      ...args.settings.modelConfig,
      temperature: Math.min(args.settings.modelConfig.temperature, 0.4),
    }, { stream: false, signal: args.signal });

    logRawOutput("script_repair_raw", repaired.text);
    parsed = parseScriptJson(repaired.text);
  }

  if (!parsed.parsed) {
    throw new Error(`Model output was not valid JSON after repair. ${parsed.error ?? ""}`.trim());
  }

  const outboundSafety = scanForPolicyViolations(JSON.stringify(parsed.parsed));
  if (outboundSafety.blocked) {
    throw new Error(`Blocked by local safety filter: ${outboundSafety.reasons.join(" ")}`);
  }

  const startIndex = args.project.script_beats.length;
  let newBeats = toBeats(parsed.parsed, startIndex);
  let passiveWarning: string | null = null;
  let trackerSnapshot: StateTrackerSnapshot | null = null;
  let repairApplied = false;

  if (args.project.outline_mode_enabled && args.project.scene_skeleton) {
    const combined = [...args.project.script_beats, ...newBeats];
    const validation = analyzePassiveScene(combined, args.project.scene_skeleton);
    trackerSnapshot = validation.tracker;

    if (!validation.valid && validation.repairInstruction) {
      const repairCount = Math.max(1, Math.min(args.settings.repairBeatsCount, newBeats.length));
      const baseProject = {
        ...args.project,
        script_beats: [...args.project.script_beats, ...newBeats.slice(0, newBeats.length - repairCount)],
      };

      const repairPrompt = buildBeatRepairPrompt(baseProject, repairCount, validation.repairInstruction);
      const safetyRepair = scanForPolicyViolations(repairPrompt);
      if (safetyRepair.blocked) {
        throw new Error(`Blocked by local safety filter: ${safetyRepair.reasons.join(" ")}`);
      }

      const repaired = await args.client.generate(repairPrompt, args.settings.modelConfig, {
        stream: false,
        signal: args.signal,
      });
      logRawOutput("script_constraint_repair_raw", repaired.text);
      let parsedRepair = parseScriptJson(repaired.text);
      if (!parsedRepair.parsed) {
        const secondRepair = await args.client.generate(
          buildJsonRepairPrompt(repaired.text),
          {
            ...args.settings.modelConfig,
            temperature: Math.min(args.settings.modelConfig.temperature, 0.4),
          },
          { stream: false, signal: args.signal },
        );
        logRawOutput("script_constraint_repair_jsonfix_raw", secondRepair.text);
        parsedRepair = parseScriptJson(secondRepair.text);
      }

      if (parsedRepair.parsed) {
        const repairedBeats = toBeats(parsedRepair.parsed, startIndex + (newBeats.length - repairCount));
        newBeats = [...newBeats.slice(0, newBeats.length - repairCount), ...repairedBeats];
        repairApplied = true;

        const secondValidation = analyzePassiveScene(
          [...args.project.script_beats, ...newBeats],
          args.project.scene_skeleton,
        );
        trackerSnapshot = secondValidation.tracker;
        if (!secondValidation.valid) {
          passiveWarning = "Scene may be passive; consider regenerating.";
        }
      } else {
        passiveWarning = "Scene may be passive; consider regenerating.";
      }
    }
  }

  return {
    newBeats,
    sceneStatus: parsed.parsed.scene_status,
    notes: parsed.parsed.notes,
    passiveWarning,
    trackerSnapshot,
    repairApplied,
  };
}

export async function generateSceneSkeleton(args: {
  client: OllamaClient;
  project: StoryProject;
  settings: AppSettings;
  signal: AbortSignal;
}): Promise<SceneSkeleton> {
  const prompt = buildSceneSkeletonPrompt(args.project);
  const safety = scanForPolicyViolations(prompt);
  if (safety.blocked) {
    throw new Error(`Blocked by local safety filter: ${safety.reasons.join(" ")}`);
  }

  const res = await args.client.generate(prompt, args.settings.modelConfig, {
    stream: false,
    signal: args.signal,
  });
  logRawOutput("skeleton_raw", res.text);
  let parsed = parseSceneSkeletonJson(res.text);
  if (!parsed.parsed) {
    const repairPrompt = buildSceneSkeletonRepairPrompt(res.text);
    const repaired = await args.client.generate(
      repairPrompt,
      {
        ...args.settings.modelConfig,
        temperature: Math.min(args.settings.modelConfig.temperature, 0.4),
      },
      { stream: false, signal: args.signal },
    );
    logRawOutput("skeleton_repair_raw", repaired.text);
    parsed = parseSceneSkeletonJson(repaired.text);
  }

  if (!parsed.parsed) {
    throw new Error(`Model output was not valid SceneSkeleton JSON after repair. ${parsed.error ?? ""}`.trim());
  }

  const outboundSafety = scanForPolicyViolations(JSON.stringify(parsed.parsed));
  if (outboundSafety.blocked) {
    throw new Error(`Blocked by local safety filter: ${outboundSafety.reasons.join(" ")}`);
  }

  return parsed.parsed;
}

export async function maybeRefreshSummary(
  client: OllamaClient,
  project: StoryProject,
  settings: AppSettings,
): Promise<{ summary: string | null; trackerSnapshot: StateTrackerSnapshot | null; guidanceNote: string | null }> {
  if (!shouldRefreshSummary(project)) {
    return { summary: null, trackerSnapshot: null, guidanceNote: null };
  }

  const prompt = buildSummaryPrompt(project);
  const res = await client.generate(prompt, summaryConfig(settings.modelConfig), { stream: false });
  let trackerSnapshot: StateTrackerSnapshot | null = null;
  let guidanceNote: string | null = null;

  if (project.outline_mode_enabled && project.scene_skeleton) {
    const validation = analyzePassiveScene(project.script_beats, project.scene_skeleton);
    trackerSnapshot = validation.tracker;
    if (
      trackerSnapshot.protagonist_commitment === null ||
      (!trackerSnapshot.has_decision && !trackerSnapshot.has_cost_or_consequence)
    ) {
      guidanceNote = "Next beats must include protagonist decision + cost.";
    }
  }

  return {
    summary: res.text.trim(),
    trackerSnapshot,
    guidanceNote,
  };
}

export async function generateNarrativePass(args: {
  client: OllamaClient;
  project: StoryProject;
  settings: AppSettings;
  signal: AbortSignal;
  revisionInstruction?: string;
  onToken?: (token: string) => void;
}): Promise<string> {
  const prompt = buildNarrativePrompt(
    args.project,
    args.settings.stylePacing,
    args.settings.styleAtmosphere,
    args.revisionInstruction,
  );

  const safety = scanForPolicyViolations(prompt);
  if (safety.blocked) {
    throw new Error(`Blocked by local safety filter: ${safety.reasons.join(" ")}`);
  }

  const res = await args.client.generate(prompt, args.settings.modelConfig, {
    stream: true,
    signal: args.signal,
    onToken: args.onToken,
  });

  let prose = res.text.trim();

  for (let i = 0; i < 2; i += 1) {
    if (endsLikeCompleteSentence(prose)) {
      break;
    }

    const continuePrompt = buildNarrativeContinuationPrompt(args.project, prose);
    const continuation = await args.client.generate(
      continuePrompt,
      {
        ...args.settings.modelConfig,
        temperature: Math.min(args.settings.modelConfig.temperature, 0.7),
        num_predict: Math.min(args.settings.modelConfig.num_predict, 220),
      },
      {
        stream: false,
        signal: args.signal,
      },
    );

    const addition = continuation.text.trim();
    if (!addition) {
      break;
    }
    prose = `${prose}${prose.endsWith(" ") ? "" : " "}${addition}`.trim();
    args.onToken?.(` ${addition}`);
  }

  const outSafety = scanForPolicyViolations(prose);
  if (outSafety.blocked) {
    throw new Error(`Blocked by local safety filter: ${outSafety.reasons.join(" ")}`);
  }

  logRawOutput("narrative_output", prose);
  return prose;
}
