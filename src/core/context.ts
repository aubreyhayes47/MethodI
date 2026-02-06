import type { Beat, StoryProject } from "../types/story";

const SUMMARY_PREFIX = "[SCENE SUMMARY]";

export type ContextWindow = {
  summary: string;
  recentBeats: Beat[];
};

export function getContextWindow(project: StoryProject, maxRecentBeats = 20): ContextWindow {
  const nonSummaryBeats = project.script_beats.filter((beat) => !beat.isSummary);
  const recentBeats = nonSummaryBeats.slice(-maxRecentBeats);
  const summary = project.scene_summary?.trim()
    ? project.scene_summary.trim()
    : "No summary yet.";

  return {
    summary,
    recentBeats,
  };
}

export function shouldRefreshSummary(project: StoryProject): boolean {
  const nonSummaryCount = project.script_beats.filter((beat) => !beat.isSummary).length;
  if (nonSummaryCount < 10) {
    return false;
  }
  return nonSummaryCount % 10 === 0;
}

export function summaryToBeat(summary: string, index: number): Beat {
  return {
    index,
    speaker: "NARRATOR/STAGE",
    content: `${SUMMARY_PREFIX} ${summary}`,
    timestamp: new Date().toISOString(),
    isSummary: true,
  };
}
