import {
  BaseDirectory,
  exists,
  mkdir,
  readTextFile,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import { z } from "zod";
import {
  AppSettingsSchema,
  SceneSkeletonSchema,
  StateTrackerSnapshotSchema,
  StoryProjectSchema,
  defaultSettings,
  type AppSettings,
  type SceneSkeleton,
  type StateTrackerSnapshot,
  type StoryProject,
} from "../types/story";

const PROJECT_DIR = "projects";
const PROJECT_INDEX_FILE = "projects/index.json";
const SETTINGS_FILE = "settings.json";

const StoryProjectArraySchema = z.array(StoryProjectSchema);

function normalizeProject(project: StoryProject): StoryProject {
  let skeleton: SceneSkeleton | undefined;
  if (project.scene_skeleton) {
    const candidate = SceneSkeletonSchema.safeParse(project.scene_skeleton);
    if (candidate.success) {
      skeleton = candidate.data;
    }
  }
  const snapshots = (project.state_tracker_snapshots ?? [])
    .map((s) => {
      const parsed = StateTrackerSnapshotSchema.safeParse(s);
      return parsed.success ? parsed.data : null;
    })
    .filter((s): s is StateTrackerSnapshot => !!s);

  return {
    ...project,
    outline_mode_enabled: project.outline_mode_enabled ?? false,
    scene_skeleton_locked: project.scene_skeleton_locked ?? false,
    scene_skeleton: skeleton,
    state_tracker_snapshots: snapshots,
    passive_warning: project.passive_warning ?? null,
    pending_guidance_note: project.pending_guidance_note ?? null,
  };
}

function normalizeSettings(settings: Partial<AppSettings>): AppSettings {
  return {
    ...defaultSettings,
    ...settings,
    modelConfig: {
      ...defaultSettings.modelConfig,
      ...(settings.modelConfig ?? {}),
    },
  };
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function ensureProjectDir() {
  if (!isTauriRuntime()) {
    return;
  }
  await mkdir(PROJECT_DIR, {
    baseDir: BaseDirectory.AppData,
    recursive: true,
  }).catch(() => undefined);
}

async function readJsonFile<T>(
  path: string,
  schema: z.ZodType<T>,
  fallback: T,
): Promise<T> {
  try {
    if (!isTauriRuntime()) {
      const raw = localStorage.getItem(path);
      if (!raw) {
        return fallback;
      }
      const parsed = JSON.parse(raw);
      return schema.parse(parsed);
    }

    const found = await exists(path, { baseDir: BaseDirectory.AppData });
    if (!found) {
      return fallback;
    }
    const raw = await readTextFile(path, { baseDir: BaseDirectory.AppData });
    const parsed = JSON.parse(raw);
    return schema.parse(parsed);
  } catch {
    try {
      const raw = localStorage.getItem(path);
      if (!raw) {
        return fallback;
      }
      const parsed = JSON.parse(raw);
      return schema.parse(parsed);
    } catch {
      return fallback;
    }
  }
}

async function writeJsonFile(path: string, value: unknown): Promise<void> {
  const serialized = JSON.stringify(value, null, 2);

  if (!isTauriRuntime()) {
    localStorage.setItem(path, serialized);
    return;
  }

  try {
    if (path.includes("/")) {
      const parent = path.split("/").slice(0, -1).join("/");
      if (parent) {
        await mkdir(parent, {
          baseDir: BaseDirectory.AppData,
          recursive: true,
        }).catch(() => undefined);
      }
    }

    await writeTextFile(path, serialized, {
      baseDir: BaseDirectory.AppData,
    });
  } catch {
    localStorage.setItem(path, serialized);
  }
}

export async function listProjects(): Promise<StoryProject[]> {
  await ensureProjectDir();
  const projects = await readJsonFile(PROJECT_INDEX_FILE, StoryProjectArraySchema, []);
  return projects.map(normalizeProject);
}

export async function saveProject(project: StoryProject): Promise<void> {
  const parsed = normalizeProject(StoryProjectSchema.parse(project));
  const all = await listProjects();
  const idx = all.findIndex((p) => p.id === parsed.id);

  if (idx >= 0) {
    all[idx] = parsed;
  } else {
    all.unshift(parsed);
  }

  await writeJsonFile(PROJECT_INDEX_FILE, all);
}

export async function loadProject(projectId: string): Promise<StoryProject | null> {
  const all = await listProjects();
  return all.find((p) => p.id === projectId) ?? null;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await writeJsonFile(SETTINGS_FILE, AppSettingsSchema.parse(normalizeSettings(settings)));
}

export async function loadSettings(): Promise<AppSettings> {
  const raw = await readJsonFile<unknown>(SETTINGS_FILE, z.any(), defaultSettings);
  const normalized = normalizeSettings((raw as Partial<AppSettings>) ?? defaultSettings);
  const validated = AppSettingsSchema.safeParse(normalized);
  if (!validated.success) {
    return defaultSettings;
  }
  return validated.data;
}

export async function exportText(path: string, contents: string): Promise<void> {
  if (!isTauriRuntime()) {
    throw new Error("Export only available in Tauri runtime.");
  }
  await writeTextFile(path, contents);
}
