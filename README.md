# MethodI

Method I is a local-first desktop storytelling app built with Tauri v2 + React + TypeScript.
It runs fully offline with local models via Ollama.

## Features

- Home / Library with saved projects
- New Story Wizard (2-6 public-domain characters, setting, premise, tone, length)
- Script Room with multi-beat generation and editable transcript
- Optional `Outline mode`: Scene Skeleton -> Act it out -> Final prose
- Robust script JSON parsing with repair pass fallback
- Scene summary refresh every 10 beats for context management
- Final Narrative Pass (transcript -> polished prose)
- Narrative version history
- Export `.md` and `.txt`
- Keyboard shortcuts:
  - `Ctrl/Cmd+Enter`: Generate Next Beat
  - `Ctrl/Cmd+Shift+Enter`: Final Narrative Pass
  - `Esc`: Stop generation
- Local safety filter for:
  - explicit sexual content involving minors
  - instructions for wrongdoing

## Tech Stack

- Desktop shell: Tauri v2
- Frontend: React + TypeScript + Vite
- Local inference: Ollama HTTP API (`/api/tags`, `/api/generate`)
- Persistence: Local JSON (Tauri app data directory)
- Validation: Zod
- Tests: Vitest

## Project Structure

- `src/` React UI and application logic
- `src/core/` prompt builders, context management, parsing, safety
- `src/ollama/` Ollama client with streaming + abort
- `src/storage/` JSON persistence and character loader
- `assets/characters/*.json` built-in public-domain character roster
- `src-tauri/` Tauri backend/plugin wiring

## Prerequisites

1. Node.js 20+
2. Rust toolchain + Tauri prerequisites for your OS:
   - https://tauri.app/start/prerequisites/
3. Ollama installed:
   - https://ollama.com/download

## Ollama Setup

1. Start Ollama:
```bash
ollama serve
```

2. Pull a model (example):
```bash
ollama pull llama3.1:8b-instruct
```

3. Confirm it exists:
```bash
ollama list
```

## Install

```bash
npm install
```

## Run (Desktop Dev)

```bash
npm run tauri dev
```

## Build

```bash
npm run tauri build
```

## Test

```bash
npm test
```

## Usage Flow

1. Open app and verify status shows `Ollama connected`.
2. Click `New Story`.
3. Pick 2-6 characters, set story inputs, and start script room.
4. Use `Generate Next Beat` or `Run Scene`.
5. Edit/pin/delete beats as needed.
6. Optional: enable `Use Scene Skeleton` to enforce decision + consequence structure.
7. Click `Final Narrative Pass`.
8. Export as Markdown or text.

## Troubleshooting

### Ollama disconnected

- Ensure `ollama serve` is running.
- Ensure URL in Settings is correct (default `http://127.0.0.1:11434`).
- Click `Refresh Models`.

### Model not found

- Pull the selected model:
```bash
ollama pull <model-name>
```
- Reopen app or refresh models.

### Script JSON parse errors

Method I already performs:
1. direct parse,
2. brace-substring extraction parse,
3. repair-pass prompt.

Script mode JSON contract examples:

Valid example 1:
```json
{"beats":[{"speaker":"SHERLOCK_HOLMES","content":"The ash on his cuff betrays the river stairs.","beat_goal":"Reveal clue"}],"scene_status":"continue","notes":{"tension":6,"mystery":8,"romance":1}}
```

Valid example 2:
```json
{"beats":[{"speaker":"ELIZABETH_BENNET","content":"Panic is a poor substitute for thought."},{"speaker":"NARRATOR/STAGE","content":"Thunder rolls over the estate."}],"scene_status":"climax","notes":{"tension":8,"mystery":7,"romance":2}}
```

Invalid example 1 (do not do this: markdown wrapper):
```text
```json ... ```
{"beats":[{"speaker":"ALICE","content":"How curious!"}],"scene_status":"continue","notes":{"tension":3,"mystery":5,"romance":0}}
```

Invalid example 2 (do not do this: missing required fields / bad enum):
```json
{"beats":[{"speaker":"ROBIN_HOOD","content":"We ride at dusk."}],"scene_status":"finished"}
```

If still failing, click `Regenerate Last` or lower temperature.

## Notes

- All model I/O stays local.
- No account, telemetry, online sync, or cloud calls are required.
- Outline mode notes: `docs/notes/outline-mode-changelog.md`
