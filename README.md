# Method I

Method I is a local-first desktop app for creating stories with AI, running fully on your machine with Ollama.

## Why Use Method I

- Write story scenes collaboratively with local models
- Keep your drafts and model output private
- Turn generated scene beats into polished prose
- Export final stories to Markdown or plain text

## What You Can Do

- Create and manage stories in a local library
- Start with a guided story setup (characters, setting, premise, tone, length)
- Generate scene beats and edit them as you go
- Optionally use outline mode for stronger structure
- Run a Final Narrative Pass to convert beats into prose
- Export your finished draft as `.md` or `.txt`

## Quick Start

### 1. Install requirements

- Node.js 20+
- Rust + Tauri prerequisites for your OS: <https://tauri.app/start/prerequisites/>
- Ollama: <https://ollama.com/download>

### 2. Start Ollama and add a model

```bash
ollama serve
ollama pull llama3.1:8b-instruct
ollama list
```

### 3. Install the app dependencies

```bash
npm install
```

### 4. Launch Method I

```bash
npm run tauri -- dev
```

## Typical Workflow

1. Open Method I and confirm status shows `Ollama connected`.
2. Click `New Story`.
3. Choose 2-6 characters and set story inputs.
4. Generate beats with `Generate Next Beat` or `Run Scene`.
5. Edit, pin, or delete beats as needed.
6. (Optional) Enable scene skeleton/outline mode.
7. Run `Final Narrative Pass`.
8. Export `.md` or `.txt`.

## Keyboard Shortcuts

- `Ctrl/Cmd+Enter`: Generate Next Beat
- `Ctrl/Cmd+Shift+Enter`: Final Narrative Pass
- `Esc`: Stop generation

## Troubleshooting

### Ollama disconnected

- Make sure `ollama serve` is running.
- Check Ollama URL in Settings (default: `http://127.0.0.1:11434`).
- Click `Refresh Models`.

### Model not found

```bash
ollama pull <model-name>
```

Then refresh models or restart the app.

## Privacy and Safety

- Model I/O stays local.
- No account is required.
- No telemetry, cloud sync, or mandatory external API calls.
- Built-in local safety filtering blocks:
  - explicit sexual content involving minors
  - instructions for wrongdoing
