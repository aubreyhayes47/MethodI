import { useEffect, useMemo, useState } from "react";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import "./App.css";
import {
  generateNarrativePass,
  generatePremiseSuggestion,
  generateSceneSkeleton,
  generateScriptBeats,
  maybeRefreshSummary,
} from "./core/storyEngine";
import { estimateTokens } from "./core/token";
import { buildScriptPrompt } from "./core/promptBuilders";
import { useOllama } from "./hooks/useOllama";
import { loadCharacterRoster } from "./storage/characterRoster";
import {
  exportText,
  listProjects,
  loadSettings,
  saveProject,
  saveSettings,
} from "./storage/projectStorage";
import {
  defaultSettings,
  type AppSettings,
  type Beat,
  type Character,
  type SceneSkeleton,
  type StateTrackerSnapshot,
  type StoryProject,
} from "./types/story";
import { formatDateTime, nowIso, uid } from "./utils/time";

const TONES = ["Victorian", "Modern", "Noir", "Mythic", "Comedic", "Horror"];
const LENGTHS = [
  { key: "short", label: "Short (~800-1500 words)" },
  { key: "medium", label: "Medium (~1500-3000 words)" },
  { key: "long", label: "Long (~3000-6000 words)" },
] as const;
const TIME_PERIOD_PRESETS = [
  "Victorian Era",
  "Regency",
  "Medieval",
  "Early 20th Century",
  "Contemporary",
  "Other",
] as const;

type Screen = "home" | "wizard" | "script" | "narrative";

function App() {
  const roster = useMemo(() => loadCharacterRoster(), []);
  const [screen, setScreen] = useState<Screen>("home");
  const [projects, setProjects] = useState<StoryProject[]>([]);
  const [project, setProject] = useState<StoryProject | null>(null);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState<string | null>(null);
  const [modelTags, setModelTags] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [sceneStatus, setSceneStatus] = useState("continue");
  const [sceneNotes, setSceneNotes] = useState({ tension: 0, mystery: 0, romance: 0 });
  const [scriptRawStream, setScriptRawStream] = useState("");
  const [narrativeDraft, setNarrativeDraft] = useState("");
  const [batchBeats, setBatchBeats] = useState(3);
  const [showScriptSettingsModal, setShowScriptSettingsModal] = useState(false);
  const [showSkeletonPanel, setShowSkeletonPanel] = useState(true);

  const { client, abort, beginStream, endStream, isStreaming } = useOllama(settings.ollamaBaseUrl);

  useEffect(() => {
    void init();
  }, []);

  async function init() {
    const [savedProjects, savedSettings] = await Promise.all([listProjects(), loadSettings()]);
    setProjects(savedProjects.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1)));
    setSettings(savedSettings);
    await refreshOllamaStatus();
  }

  useEffect(() => {
    client.setBaseUrl(settings.ollamaBaseUrl);
  }, [client, settings.ollamaBaseUrl]);

  useEffect(() => {
    void refreshOllamaStatus();
  }, [settings.ollamaBaseUrl]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshOllamaStatus();
    }, 7000);
    return () => window.clearInterval(timer);
  }, [settings.ollamaBaseUrl]);

  useEffect(() => {
    function onKeyDown(ev: KeyboardEvent) {
      const isCmdEnter = (ev.ctrlKey || ev.metaKey) && ev.key === "Enter";
      const isFinalPass = isCmdEnter && ev.shiftKey;

      if (ev.key === "Escape") {
        if (showScriptSettingsModal) {
          setShowScriptSettingsModal(false);
          return;
        }
        abort();
        setStatus("Generation stopped.");
      } else if (screen === "script" && project && isCmdEnter && !isFinalPass) {
        ev.preventDefault();
        void onGenerateNextBeat();
      } else if (screen === "script" && project && isFinalPass) {
        ev.preventDefault();
        void onFinalNarrativePass();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [screen, project, settings, showScriptSettingsModal]);

  async function refreshOllamaStatus() {
    try {
      const ok = await client.checkConnection();
      setConnected(ok);
      if (!ok) {
        setModelTags([]);
        return;
      }
      const models = await client.listModels();
      setModelTags(models.map((m) => m.name));
      if (models.length > 0 && !models.find((m) => m.name === settings.modelConfig.model)) {
        const next = {
          ...settings,
          modelConfig: {
            ...settings.modelConfig,
            model: models[0].name,
          },
        };
        setSettings(next);
        await saveSettings(next);
      }
    } catch {
      setConnected(false);
      setModelTags([]);
    }
  }

  async function persistProject(next: StoryProject) {
    await saveProject(next);
    setProject(next);
    setProjects((prev) => {
      const rest = prev.filter((p) => p.id !== next.id);
      return [next, ...rest].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
    });
  }

  function createBlankProject(): StoryProject {
    return {
      id: uid("project"),
      title: "Untitled Story",
      created_at: nowIso(),
      updated_at: nowIso(),
      selected_characters: [],
      setting: "",
      premise: "",
      tone: "Victorian",
      length_target: "short",
      script_beats: [],
      final_prose_versions: [],
      scene_summary: "",
      outline_mode_enabled: settings.defaultOutlineMode,
      scene_skeleton_locked: false,
      state_tracker_snapshots: [],
      passive_warning: null,
      pending_guidance_note: null,
    };
  }

  async function onGenerateNextBeat() {
    if (!project) {
      return;
    }

    setError(null);
    setStatus("Generating next beat...");
    setScriptRawStream("");
    const signal = beginStream();

    try {
      let activeProject = project;
      if (activeProject.outline_mode_enabled && !activeProject.scene_skeleton) {
        const skeleton = await generateSceneSkeleton({
          client,
          project: activeProject,
          settings,
          signal,
        });
        activeProject = {
          ...activeProject,
          scene_skeleton: skeleton,
          passive_warning: null,
          pending_guidance_note: null,
          updated_at: nowIso(),
        };
        await persistProject(activeProject);
      }

      const output = await generateScriptBeats({
        client,
        project: activeProject,
        settings,
        beatsToGenerate: 1,
        signal,
        onRawStream: (chunk) => {
          setScriptRawStream((prev) => (prev + chunk).slice(-3000));
        },
      });

      const merged: StoryProject = {
        ...activeProject,
        script_beats: [...activeProject.script_beats, ...output.newBeats],
        updated_at: nowIso(),
        passive_warning: output.passiveWarning,
        state_tracker_snapshots: output.trackerSnapshot
          ? [...(activeProject.state_tracker_snapshots ?? []), output.trackerSnapshot]
          : activeProject.state_tracker_snapshots,
      };

      const refresh = await maybeRefreshSummary(client, merged, settings);
      if (refresh.summary) {
        merged.scene_summary = refresh.summary;
      }
      if (refresh.trackerSnapshot) {
        merged.state_tracker_snapshots = [...(merged.state_tracker_snapshots ?? []), refresh.trackerSnapshot];
      }
      if (refresh.guidanceNote) {
        merged.pending_guidance_note = refresh.guidanceNote;
      }

      await persistProject(merged);
      setSceneStatus(output.sceneStatus);
      setSceneNotes(output.notes);
      setStatus(output.repairApplied ? "Beat generated (constraint repair applied)." : "Beat generated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate beat.");
      setStatus("Generation failed.");
    } finally {
      endStream();
    }
  }

  async function onRunScene() {
    if (!project) {
      return;
    }

    setError(null);
    setStatus(`Running scene for ${batchBeats} beats...`);

    let current = project;
    const signal = beginStream();

    try {
      if (current.outline_mode_enabled && !current.scene_skeleton) {
        const skeleton = await generateSceneSkeleton({
          client,
          project: current,
          settings,
          signal,
        });
        current = {
          ...current,
          scene_skeleton: skeleton,
          updated_at: nowIso(),
        };
      }

      for (let i = 0; i < batchBeats; i += 1) {
        const output = await generateScriptBeats({
          client,
          project: current,
          settings,
          beatsToGenerate: 1,
          signal,
        });

        current = {
          ...current,
          script_beats: [...current.script_beats, ...output.newBeats],
          updated_at: nowIso(),
          passive_warning: output.passiveWarning,
          state_tracker_snapshots: output.trackerSnapshot
            ? [...(current.state_tracker_snapshots ?? []), output.trackerSnapshot]
            : current.state_tracker_snapshots,
        };

        setSceneStatus(output.sceneStatus);
        setSceneNotes(output.notes);

        const refresh = await maybeRefreshSummary(client, current, settings);
        if (refresh.summary) {
          current.scene_summary = refresh.summary;
        }
        if (refresh.trackerSnapshot) {
          current.state_tracker_snapshots = [...(current.state_tracker_snapshots ?? []), refresh.trackerSnapshot];
        }
        if (refresh.guidanceNote) {
          current.pending_guidance_note = refresh.guidanceNote;
        }
      }

      await persistProject(current);
      setStatus("Scene run complete.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scene batch failed.");
      setStatus("Scene run interrupted.");
    } finally {
      endStream();
    }
  }

  async function onRegenerateLast() {
    if (!project || !project.script_beats.length) {
      return;
    }

    const trimmed = {
      ...project,
      script_beats: project.script_beats.slice(0, -1),
      updated_at: nowIso(),
    };
    await persistProject(trimmed);

    setProject(trimmed);
    await onGenerateNextBeat();
  }

  async function onRegenerateBeat(index: number) {
    if (!project) {
      return;
    }

    const originalProject = project;
    const targetPosition = originalProject.script_beats.findIndex((beat) => beat.index === index);
    if (targetPosition === -1) {
      return;
    }

    const baseBeats = originalProject.script_beats
      .filter((beat) => beat.index !== index)
      .map((beat, beatIndex) => ({ ...beat, index: beatIndex }));
    const baseProject: StoryProject = {
      ...originalProject,
      script_beats: baseBeats,
      updated_at: nowIso(),
    };

    setError(null);
    setStatus(`Regenerating beat ${index + 1}...`);
    const signal = beginStream();

    try {
      const output = await generateScriptBeats({
        client,
        project: baseProject,
        settings,
        beatsToGenerate: 1,
        signal,
      });

      const regenerated = output.newBeats[0];
      if (!regenerated) {
        throw new Error("No beat returned by model.");
      }

      const inserted = [
        ...baseBeats.slice(0, targetPosition),
        { ...regenerated, index: targetPosition, timestamp: nowIso() },
        ...baseBeats.slice(targetPosition),
      ].map((beat, beatIndex) => ({ ...beat, index: beatIndex }));

      const nextProject: StoryProject = {
        ...baseProject,
        script_beats: inserted,
        updated_at: nowIso(),
        passive_warning: output.passiveWarning,
        state_tracker_snapshots: output.trackerSnapshot
          ? [...(baseProject.state_tracker_snapshots ?? []), output.trackerSnapshot]
          : baseProject.state_tracker_snapshots,
      };

      const refresh = await maybeRefreshSummary(client, nextProject, settings);
      if (refresh.summary) {
        nextProject.scene_summary = refresh.summary;
      }
      if (refresh.trackerSnapshot) {
        nextProject.state_tracker_snapshots = [...(nextProject.state_tracker_snapshots ?? []), refresh.trackerSnapshot];
      }
      if (refresh.guidanceNote) {
        nextProject.pending_guidance_note = refresh.guidanceNote;
      }

      await persistProject(nextProject);
      setSceneStatus(output.sceneStatus);
      setSceneNotes(output.notes);
      setStatus(`Beat ${index + 1} regenerated.`);
    } catch (err) {
      setProject(originalProject);
      setError(err instanceof Error ? err.message : "Failed to regenerate beat.");
      setStatus("Beat regeneration failed.");
    } finally {
      endStream();
    }
  }

  async function onGenerateSkeleton(force = false) {
    if (!project) {
      return;
    }
    setError(null);
    setStatus(force ? "Regenerating scene skeleton..." : "Generating scene skeleton...");
    const signal = beginStream();
    try {
      if (!force && project.scene_skeleton && project.scene_skeleton_locked) {
        setStatus("Skeleton is locked.");
        return;
      }
      const skeleton = await generateSceneSkeleton({
        client,
        project,
        settings,
        signal,
      });
      const next: StoryProject = {
        ...project,
        scene_skeleton: skeleton,
        outline_mode_enabled: true,
        scene_skeleton_locked: project.scene_skeleton_locked ?? false,
        passive_warning: null,
        pending_guidance_note: null,
        updated_at: nowIso(),
      };
      await persistProject(next);
      setStatus("Scene skeleton ready.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate scene skeleton.");
      setStatus("Scene skeleton generation failed.");
    } finally {
      endStream();
    }
  }

  function updateSkeleton(patch: Partial<SceneSkeleton>) {
    if (!project || !project.scene_skeleton) {
      return;
    }
    const next: StoryProject = {
      ...project,
      scene_skeleton: {
        ...project.scene_skeleton,
        ...patch,
      },
      updated_at: nowIso(),
    };
    void persistProject(next);
  }

  async function onFinalNarrativePass(revisionInstruction?: string) {
    if (!project || !project.script_beats.length) {
      return;
    }

    setError(null);
    setStatus("Generating final narrative pass...");
    setNarrativeDraft("");
    const signal = beginStream();

    try {
      const prose = await generateNarrativePass({
        client,
        project,
        settings,
        signal,
        revisionInstruction,
        onToken: (token) => setNarrativeDraft((prev) => prev + token),
      });

      const version = {
        id: uid("prose"),
        created_at: nowIso(),
        model_config: settings.modelConfig,
        prose_text: prose,
      };

      const next = {
        ...project,
        final_prose_versions: [version, ...project.final_prose_versions],
        updated_at: nowIso(),
      };
      await persistProject(next);
      setNarrativeDraft(prose);
      setScreen("narrative");
      setStatus("Narrative pass complete.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Narrative pass failed.");
      setStatus("Narrative pass failed.");
    } finally {
      endStream();
    }
  }

  function updateBeat(index: number, patch: Partial<Beat>) {
    if (!project) {
      return;
    }
    const nextBeats = project.script_beats.map((b) => (b.index === index ? { ...b, ...patch } : b));
    const next = { ...project, script_beats: nextBeats, updated_at: nowIso() };
    void persistProject(next);
  }

  function deleteBeat(index: number) {
    if (!project) {
      return;
    }
    const beats = project.script_beats
      .filter((b) => b.index !== index)
      .map((b, i) => ({ ...b, index: i }));
    const next = { ...project, script_beats: beats, updated_at: nowIso() };
    void persistProject(next);
  }

  async function onExport(ext: "md" | "txt") {
    if (!project) {
      return;
    }
    const prose = project.final_prose_versions[0]?.prose_text ?? narrativeDraft;
    if (!prose) {
      return;
    }

    const defaultName = `${project.title.replace(/\s+/g, "_").toLowerCase()}.${ext}`;

    try {
      const path = await saveDialog({
        defaultPath: defaultName,
        filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
      });

      if (!path) {
        return;
      }

      const payload =
        ext === "md"
          ? `# ${project.title}\n\n${prose}\n`
          : `${project.title}\n\n${prose}\n`;

      await exportText(path, payload);
      setStatus(`Exported ${ext.toUpperCase()} to ${path}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
    }
  }

  async function onCopyNarrative() {
    if (!project) {
      return;
    }
    const prose = project.final_prose_versions[0]?.prose_text ?? narrativeDraft;
    if (!prose) {
      return;
    }
    await navigator.clipboard.writeText(prose);
    setStatus("Narrative copied.");
  }

  function currentPromptBudget(): string {
    if (!project) {
      return "0 / 0";
    }
    const prompt = buildScriptPrompt(project, 1);
    const tokens = estimateTokens(prompt);
    return `${tokens} / ${settings.modelConfig.num_ctx}`;
  }

  if (screen === "home") {
    return (
      <main className="app">
        <header className="topbar">
          <h1>Method I</h1>
          <Status connected={connected} status={status} />
        </header>

        <section className="card">
          <h2>Library</h2>
          <button
            className="primary"
            onClick={() => {
              setProject(createBlankProject());
              setScreen("wizard");
            }}
          >
            New Story
          </button>

          <div className="project-list">
            {projects.length === 0 && <p>No projects yet.</p>}
            {projects.map((p) => (
              <button
                key={p.id}
                className="list-item"
                onClick={() => {
                  setProject(p);
                  setScreen(p.final_prose_versions.length ? "narrative" : "script");
                }}
              >
                <strong>{p.title}</strong>
                <span>Last edited {formatDateTime(p.updated_at)}</span>
              </button>
            ))}
          </div>
        </section>

        {error && <div className="error">{error}</div>}
      </main>
    );
  }

  if (screen === "wizard" && project) {
    return (
      <Wizard
        project={project}
        roster={roster}
        settings={settings}
        connected={connected}
        onBack={() => setScreen("home")}
        onSuggestPremise={async (setting, tone, cast) => {
          const text = await generatePremiseSuggestion(client, settings, setting, tone, cast);
          setConnected(true);
          return text;
        }}
        onSaveSettings={async (next) => {
          setSettings(next);
          await saveSettings(next);
        }}
        modelTags={modelTags}
        onSubmit={async (draft) => {
          await persistProject(draft);
          setScreen("script");
        }}
      />
    );
  }

  if (screen === "script" && project) {
    const latestTracker: StateTrackerSnapshot | null =
      project.state_tracker_snapshots && project.state_tracker_snapshots.length
        ? project.state_tracker_snapshots[project.state_tracker_snapshots.length - 1]
        : null;

    return (
      <main className="app script-layout">
        <header className="topbar">
          <h1>{project.title}</h1>
          <Status connected={connected} status={status} />
        </header>

        <section className="panel transcript-panel">
          <h2>Script Room</h2>
          <div className="row-actions">
            <label className="inline-check">
              <input
                type="checkbox"
                checked={!!project.outline_mode_enabled}
                onChange={(e) => {
                  const next = {
                    ...project,
                    outline_mode_enabled: e.currentTarget.checked,
                    updated_at: nowIso(),
                  };
                  void persistProject(next);
                }}
              />
              Use Scene Skeleton
            </label>
            {project.outline_mode_enabled && (
              <button onClick={() => setShowSkeletonPanel((prev) => !prev)}>
                {showSkeletonPanel ? "Hide Skeleton" : "Show Skeleton"}
              </button>
            )}
          </div>
          {project.passive_warning && <div className="warning">{project.passive_warning}</div>}
          {latestTracker && (
            <div className="tracker-box">
              <div><strong>Intent:</strong> {latestTracker.protagonist_intent}</div>
              <div><strong>Commitment:</strong> {latestTracker.protagonist_commitment ?? "none yet"}</div>
              <div className="small">
                Decision: {latestTracker.has_decision ? "yes" : "no"} | Cost/Consequence:{" "}
                {latestTracker.has_cost_or_consequence ? "yes" : "no"}
              </div>
            </div>
          )}
          {project.outline_mode_enabled && showSkeletonPanel && (
            <SceneSkeletonPanel
              skeleton={project.scene_skeleton}
              locked={!!project.scene_skeleton_locked}
              onLockChange={(locked) => {
                const next = { ...project, scene_skeleton_locked: locked, updated_at: nowIso() };
                void persistProject(next);
              }}
              onGenerate={() => void onGenerateSkeleton(false)}
              onRegenerate={() => void onGenerateSkeleton(true)}
              onUpdate={(patch) => updateSkeleton(patch)}
            />
          )}
          <p className="small">
            Scene status: <strong>{sceneStatus}</strong> | Tension {sceneNotes.tension} | Mystery {sceneNotes.mystery} | Romance {sceneNotes.romance}
          </p>
          <p className="small">Token/context budget: {currentPromptBudget()}</p>
          <div className="transcript-list">
            {project.script_beats.map((beat) => (
              <div key={`${beat.index}-${beat.timestamp}`} className="beat-row">
                <div className="beat-head">
                  <strong>{beat.speaker}</strong>
                  <span>{formatDateTime(beat.timestamp)}</span>
                </div>
                <textarea
                  value={beat.content}
                  onChange={(e) => updateBeat(beat.index, { content: e.currentTarget.value })}
                  rows={3}
                />
                <div className="row-actions">
                  <button onClick={() => updateBeat(beat.index, { pinned: !beat.pinned })}>
                    {beat.pinned ? "Unpin" : "Pin"}
                  </button>
                  <button onClick={() => void onRegenerateBeat(beat.index)} disabled={isStreaming}>
                    Regenerate
                  </button>
                  <button onClick={() => updateBeat(beat.index, { content: beat.content })}>Save Edit</button>
                  <button onClick={() => deleteBeat(beat.index)}>Delete</button>
                </div>
              </div>
            ))}
          </div>

          <details>
            <summary>Raw model stream (debug)</summary>
            <pre className="raw-stream">{scriptRawStream || "(empty)"}</pre>
          </details>
        </section>

        <aside className="panel controls-panel">
          <h3>Controls</h3>
          <button className="primary" onClick={() => void onGenerateNextBeat()} disabled={isStreaming}>
            Generate Next Beat (Ctrl/Cmd+Enter)
          </button>

          <label>
            Run Scene (N beats)
            <input
              type="number"
              min={1}
              max={10}
              value={batchBeats}
              onChange={(e) => setBatchBeats(Number(e.currentTarget.value) || 1)}
            />
          </label>
          <button onClick={() => void onRunScene()} disabled={isStreaming}>
            Run Scene
          </button>

          <button onClick={() => abort()}>Stop (Esc)</button>
          <button onClick={() => void onRegenerateLast()} disabled={isStreaming || project.script_beats.length === 0}>
            Regenerate Last
          </button>
          <button className="primary" onClick={() => void onFinalNarrativePass()} disabled={isStreaming}>
            Final Narrative Pass (Ctrl/Cmd+Shift+Enter)
          </button>

          <button
            onClick={() => {
              setScreen("narrative");
              setNarrativeDraft(project.final_prose_versions[0]?.prose_text ?? "");
            }}
          >
            Open Narrative Output
          </button>
        </aside>

        <footer className="footer-actions">
          <button onClick={() => setShowScriptSettingsModal(true)}>Settings</button>
          <button onClick={() => setScreen("home")}>Back to Home</button>
        </footer>
        {showScriptSettingsModal && (
          <div className="modal-backdrop" onClick={() => setShowScriptSettingsModal(false)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Script Room Settings</h3>
                <button onClick={() => setShowScriptSettingsModal(false)}>Close</button>
              </div>
              <SettingsPanel
                settings={settings}
                onChange={async (next) => {
                  setSettings(next);
                  await saveSettings(next);
                }}
                modelTags={modelTags}
                onRefreshModels={() => void refreshOllamaStatus()}
              />
            </div>
          </div>
        )}
        {error && <div className="error">{error}</div>}
      </main>
    );
  }

  if (screen === "narrative" && project) {
    const prose = project.final_prose_versions[0]?.prose_text ?? narrativeDraft;

    return (
      <main className="app">
        <header className="topbar">
          <h1>Narrative Output</h1>
          <Status connected={connected} status={status} />
        </header>

        <section className="card">
          <h2>{project.title}</h2>
          <pre className="prose-text">{prose || "No narrative version yet. Run Final Narrative Pass."}</pre>

          <div className="row-actions">
            <button onClick={() => void onExport("md")}>Export MD</button>
            <button onClick={() => void onExport("txt")}>Export TXT</button>
            <button onClick={() => void onCopyNarrative()}>Copy</button>
            <button
              onClick={() => {
                if (!prose) {
                  return;
                }
                const version = {
                  id: uid("prose"),
                  created_at: nowIso(),
                  model_config: settings.modelConfig,
                  prose_text: prose,
                };
                const next = {
                  ...project,
                  final_prose_versions: [version, ...project.final_prose_versions],
                  updated_at: nowIso(),
                };
                void persistProject(next);
              }}
            >
              Save Version
            </button>
            <button
              onClick={() => {
                const instruction = prompt("Revision instruction:");
                if (!instruction) {
                  return;
                }
                void onFinalNarrativePass(instruction);
              }}
            >
              Revise Prose
            </button>
          </div>

          <h3>Versions</h3>
          <div className="project-list">
            {project.final_prose_versions.map((version) => (
              <button
                key={version.id}
                className="list-item"
                onClick={() => setNarrativeDraft(version.prose_text)}
              >
                <strong>{formatDateTime(version.created_at)}</strong>
                <span>{version.model_config.model}</span>
              </button>
            ))}
          </div>
        </section>

        <footer className="footer-actions">
          <button onClick={() => setScreen("script")}>Back to Script Room</button>
          <button onClick={() => setScreen("home")}>Home</button>
        </footer>

        {error && <div className="error">{error}</div>}
      </main>
    );
  }

  return <main className="app">Loading...</main>;
}

function Status({ connected, status }: { connected: boolean; status: string }) {
  return (
    <div className="status-wrap">
      <span className={`dot ${connected ? "on" : "off"}`} />
      <span>Ollama {connected ? "connected" : "disconnected"}</span>
      <span className="small">{status}</span>
    </div>
  );
}

function Wizard(props: {
  project: StoryProject;
  roster: Character[];
  settings: AppSettings;
  connected: boolean;
  modelTags: string[];
  onBack: () => void;
  onSuggestPremise: (setting: string, tone: string, cast: Character[]) => Promise<string>;
  onSaveSettings: (settings: AppSettings) => Promise<void>;
  onSubmit: (project: StoryProject) => Promise<void>;
}) {
  const [title, setTitle] = useState(props.project.title);
  const [selectedIds, setSelectedIds] = useState<string[]>(props.project.selected_characters.map((c) => c.id));
  const [setting, setSetting] = useState(props.project.setting);
  const [timePeriodPreset, setTimePeriodPreset] = useState<(typeof TIME_PERIOD_PRESETS)[number]>("Victorian Era");
  const [customTimePeriod, setCustomTimePeriod] = useState("");
  const [premise, setPremise] = useState(props.project.premise);
  const [tone, setTone] = useState(props.project.tone);
  const [lengthTarget, setLengthTarget] = useState<"short" | "medium" | "long">(
    props.project.length_target,
  );
  const [outlineMode, setOutlineMode] = useState<boolean>(
    props.project.outline_mode_enabled ?? props.settings.defaultOutlineMode,
  );
  const [busy, setBusy] = useState(false);
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [showWizardSettingsModal, setShowWizardSettingsModal] = useState(false);

  const selectedCast = props.roster.filter((c) => selectedIds.includes(c.id));
  const resolvedTimePeriod =
    customTimePeriod.trim() || (timePeriodPreset === "Other" ? "" : timePeriodPreset);
  const invalidTimePeriod = timePeriodPreset === "Other" && !customTimePeriod.trim();
  const canStart =
    selectedCast.length >= 2 &&
    selectedCast.length <= 6 &&
    !!premise.trim() &&
    !!setting.trim() &&
    !!resolvedTimePeriod &&
    !invalidTimePeriod;

  function toggleCharacter(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id);
      }
      if (prev.length >= 6) {
        return prev;
      }
      return [...prev, id];
    });
  }

  return (
    <main className="app">
      <header className="topbar">
        <h1>New Story Wizard</h1>
        <Status connected={props.connected} status={busy ? "Working..." : "Ready"} />
      </header>

      <section className="card">
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.currentTarget.value)} />
        </label>

        <h3>Select Characters (2-6)</h3>
        <div className="character-grid">
          {props.roster.map((character) => (
            <button
              type="button"
              key={character.id}
              className={`character-card ${selectedIds.includes(character.id) ? "selected" : ""}`}
              onClick={() => toggleCharacter(character.id)}
            >
              <strong>{character.name}</strong>
              <span>{character.source_work}</span>
            </button>
          ))}
        </div>

        <label>
          Setting
          <input
            value={setting}
            onChange={(e) => setSetting(e.currentTarget.value)}
            placeholder="Foggy London streets, 1891"
          />
        </label>

        <label>
          Time Period Preset
          <select
            value={timePeriodPreset}
            onChange={(e) =>
              setTimePeriodPreset(e.currentTarget.value as (typeof TIME_PERIOD_PRESETS)[number])
            }
          >
            {TIME_PERIOD_PRESETS.map((preset) => (
              <option key={preset} value={preset}>
                {preset}
              </option>
            ))}
          </select>
        </label>

        <label>
          Custom Time Period (optional)
          <input
            value={customTimePeriod}
            onChange={(e) => setCustomTimePeriod(e.currentTarget.value)}
            placeholder="e.g., Late 19th century"
          />
        </label>
        {invalidTimePeriod && (
          <p className="small validation">Choose a custom time period when preset is Other.</p>
        )}

        <label>
          Tone / Style
          <select value={tone} onChange={(e) => setTone(e.currentTarget.value)}>
            {TONES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label>
          Premise
          <textarea value={premise} onChange={(e) => setPremise(e.currentTarget.value)} rows={4} />
        </label>

        <div className="row-actions">
          <button
            onClick={async () => {
              if (!selectedCast.length) {
                return;
              }
              setWizardError(null);
              setBusy(true);
              try {
                const suggestion = await props.onSuggestPremise(
                  `${setting} (${resolvedTimePeriod || "Unspecified era"})`,
                  tone,
                  selectedCast,
                );
                setPremise(suggestion);
              } catch (err) {
                setWizardError(err instanceof Error ? err.message : "Failed to suggest premise.");
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy || selectedCast.length < 2}
          >
            Suggest Premise
          </button>
        </div>

        <label>
          Length Target
          <select value={lengthTarget} onChange={(e) => setLengthTarget(e.currentTarget.value as "short" | "medium" | "long")}>
            {LENGTHS.map((l) => (
              <option key={l.key} value={l.key}>
                {l.label}
              </option>
            ))}
          </select>
        </label>

        <label className="inline-check">
          <input
            type="checkbox"
            checked={outlineMode}
            onChange={(e) => setOutlineMode(e.currentTarget.checked)}
          />
          Generate a Scene Skeleton before writing
        </label>

        <div className="row-actions">
          <button onClick={() => setShowWizardSettingsModal(true)}>Settings</button>
          <button onClick={props.onBack}>Cancel</button>
          <button
            className="primary"
            disabled={!canStart}
            onClick={async () => {
              if (!canStart) {
                return;
              }
              setWizardError(null);
              try {
                await props.onSubmit({
                  ...props.project,
                  title: title.trim() || "Untitled Story",
                  selected_characters: selectedCast,
                  setting: `${setting.trim()} (${resolvedTimePeriod.trim()})`,
                  premise: premise.trim(),
                  tone,
                  length_target: lengthTarget,
                  outline_mode_enabled: outlineMode,
                  scene_skeleton: undefined,
                  scene_skeleton_locked: false,
                  state_tracker_snapshots: [],
                  passive_warning: null,
                  pending_guidance_note: null,
                  updated_at: nowIso(),
                });
              } catch (err) {
                setWizardError(err instanceof Error ? err.message : "Failed to start Script Room.");
              }
            }}
          >
            Start Script Room
          </button>
        </div>
        {!canStart && (
          <p className="small validation">
            Select 2-6 characters and fill Setting, Premise, and Time Period to continue.
          </p>
        )}
        {wizardError && <div className="error">{wizardError}</div>}
        {showWizardSettingsModal && (
          <div className="modal-backdrop" onClick={() => setShowWizardSettingsModal(false)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Wizard Settings</h3>
                <button onClick={() => setShowWizardSettingsModal(false)}>Close</button>
              </div>
              <SettingsPanel
                settings={props.settings}
                onChange={props.onSaveSettings}
                modelTags={props.modelTags}
              />
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function SceneSkeletonPanel(props: {
  skeleton?: SceneSkeleton;
  locked: boolean;
  onLockChange: (locked: boolean) => void;
  onGenerate: () => void;
  onRegenerate: () => void;
  onUpdate: (patch: Partial<SceneSkeleton>) => void;
}) {
  return (
    <div className="skeleton-box">
      <div className="row-actions">
        <strong>Scene Skeleton</strong>
        <button onClick={props.onGenerate} disabled={props.locked && !!props.skeleton}>
          Generate
        </button>
        <button onClick={props.onRegenerate}>Regenerate Skeleton</button>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={props.locked}
            onChange={(e) => props.onLockChange(e.currentTarget.checked)}
          />
          Lock Skeleton
        </label>
      </div>
      {!props.skeleton && <p className="small">No skeleton yet. Generate one to enforce decision + consequence.</p>}
      {props.skeleton && (
        <div className="skeleton-grid">
          <label>
            Protagonist
            <input
              value={props.skeleton.protagonist}
              onChange={(e) => props.onUpdate({ protagonist: e.currentTarget.value })}
              disabled={props.locked}
            />
          </label>
          <label>
            Goal
            <textarea
              rows={2}
              value={props.skeleton.goal}
              onChange={(e) => props.onUpdate({ goal: e.currentTarget.value })}
              disabled={props.locked}
            />
          </label>
          <label>
            Opposition
            <textarea
              rows={2}
              value={props.skeleton.opposition}
              onChange={(e) => props.onUpdate({ opposition: e.currentTarget.value })}
              disabled={props.locked}
            />
          </label>
          <label>
            Plan
            <textarea
              rows={2}
              value={props.skeleton.plan}
              onChange={(e) => props.onUpdate({ plan: e.currentTarget.value })}
              disabled={props.locked}
            />
          </label>
          <label>
            Turn
            <textarea
              rows={2}
              value={props.skeleton.turn}
              onChange={(e) => props.onUpdate({ turn: e.currentTarget.value })}
              disabled={props.locked}
            />
          </label>
          <label>
            Choice
            <textarea
              rows={2}
              value={props.skeleton.choice}
              onChange={(e) => props.onUpdate({ choice: e.currentTarget.value })}
              disabled={props.locked}
            />
          </label>
          <label>
            Cost
            <textarea
              rows={2}
              value={props.skeleton.cost}
              onChange={(e) => props.onUpdate({ cost: e.currentTarget.value })}
              disabled={props.locked}
            />
          </label>
          <label>
            Outcome
            <textarea
              rows={2}
              value={props.skeleton.outcome}
              onChange={(e) => props.onUpdate({ outcome: e.currentTarget.value })}
              disabled={props.locked}
            />
          </label>
          <label>
            Must Include (one per line)
            <textarea
              rows={3}
              value={props.skeleton.constraints.must_include.join("\n")}
              onChange={(e) =>
                props.onUpdate({
                  constraints: {
                    ...props.skeleton!.constraints,
                    must_include: e.currentTarget.value
                      .split("\n")
                      .map((x) => x.trim())
                      .filter(Boolean),
                  },
                })
              }
              disabled={props.locked}
            />
          </label>
          <label>
            Must Avoid (one per line)
            <textarea
              rows={3}
              value={props.skeleton.constraints.must_avoid.join("\n")}
              onChange={(e) =>
                props.onUpdate({
                  constraints: {
                    ...props.skeleton!.constraints,
                    must_avoid: e.currentTarget.value
                      .split("\n")
                      .map((x) => x.trim())
                      .filter(Boolean),
                  },
                })
              }
              disabled={props.locked}
            />
          </label>
        </div>
      )}
    </div>
  );
}

function SettingsPanel(props: {
  settings: AppSettings;
  modelTags: string[];
  onChange: (next: AppSettings) => Promise<void>;
  onRefreshModels?: () => void;
}) {
  const { settings } = props;

  async function patch(next: Partial<AppSettings>) {
    await props.onChange({ ...settings, ...next });
  }

  async function patchModelConfig(next: Partial<AppSettings["modelConfig"]>) {
    await props.onChange({
      ...settings,
      modelConfig: {
        ...settings.modelConfig,
        ...next,
      },
    });
  }

  return (
    <div className="settings-box">
      <h3>Settings</h3>
      <label>
        Ollama Base URL
        <input
          value={settings.ollamaBaseUrl}
          onChange={(e) => void patch({ ollamaBaseUrl: e.currentTarget.value })}
        />
      </label>

      <label>
        Model
        <input
          list="model-tags"
          value={settings.modelConfig.model}
          onChange={(e) => void patchModelConfig({ model: e.currentTarget.value })}
        />
        <datalist id="model-tags">
          {props.modelTags.map((tag) => (
            <option key={tag} value={tag} />
          ))}
        </datalist>
      </label>

      {props.onRefreshModels && <button onClick={props.onRefreshModels}>Refresh Models</button>}

      <label>
        Temperature
        <input
          type="number"
          step="0.05"
          min={0}
          max={2}
          value={settings.modelConfig.temperature}
          onChange={(e) => void patchModelConfig({ temperature: Number(e.currentTarget.value) })}
        />
      </label>

      <label>
        Top P
        <input
          type="number"
          step="0.05"
          min={0}
          max={1}
          value={settings.modelConfig.top_p}
          onChange={(e) => void patchModelConfig({ top_p: Number(e.currentTarget.value) })}
        />
      </label>

      <label>
        Context Size (num_ctx)
        <input
          type="number"
          min={1024}
          max={65536}
          step={256}
          value={settings.modelConfig.num_ctx}
          onChange={(e) => void patchModelConfig({ num_ctx: Number(e.currentTarget.value) })}
        />
      </label>

      <label>
        Max Tokens (num_predict)
        <input
          type="number"
          min={64}
          max={4096}
          step={32}
          value={settings.modelConfig.num_predict}
          onChange={(e) => void patchModelConfig({ num_predict: Number(e.currentTarget.value) })}
        />
      </label>

      <label>
        Style Pacing
        <input
          type="range"
          min={0}
          max={100}
          value={settings.stylePacing}
          onChange={(e) => void patch({ stylePacing: Number(e.currentTarget.value) })}
        />
      </label>

      <label>
        Style Atmosphere
        <input
          type="range"
          min={0}
          max={100}
          value={settings.styleAtmosphere}
          onChange={(e) => void patch({ styleAtmosphere: Number(e.currentTarget.value) })}
        />
      </label>

      <label className="inline-check">
        <input
          type="checkbox"
          checked={settings.defaultOutlineMode}
          onChange={(e) => void patch({ defaultOutlineMode: e.currentTarget.checked })}
        />
        Default to Outline Mode
      </label>

      <label>
        Repair Beats Count
        <input
          type="number"
          min={1}
          max={6}
          value={settings.repairBeatsCount}
          onChange={(e) => void patch({ repairBeatsCount: Number(e.currentTarget.value) || 2 })}
        />
      </label>
    </div>
  );
}

export default App;
