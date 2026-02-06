import type { ModelConfig, OllamaModelTag } from "../types/story";

type GenerateOptions = {
  stream?: boolean;
  signal?: AbortSignal;
  onToken?: (chunk: string) => void;
};

type GenerateResponse = {
  text: string;
};

type OllamaGenerateChunk = {
  response?: string;
  done?: boolean;
};

export class OllamaClient {
  private baseUrl: string;

  constructor(baseUrl = "http://127.0.0.1:11434") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/$/, "");
  }

  async checkConnection(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { method: "GET" });
      return res.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<OllamaModelTag[]> {
    const res = await fetch(`${this.baseUrl}/api/tags`, { method: "GET" });
    if (!res.ok) {
      throw new Error("Failed to list models. Is Ollama running?");
    }
    const data = (await res.json()) as { models?: OllamaModelTag[] };
    return data.models ?? [];
  }

  async generate(
    prompt: string,
    config: ModelConfig,
    options: GenerateOptions = {},
  ): Promise<GenerateResponse> {
    const body = {
      model: config.model,
      prompt,
      stream: options.stream ?? true,
      options: {
        temperature: config.temperature,
        top_p: config.top_p,
        num_ctx: config.num_ctx,
        num_predict: config.num_predict,
      },
    };

    const res = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: options.signal,
    });

    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      throw new Error(`Ollama generation failed: ${res.status} ${msg}`.trim());
    }

    if (!(options.stream ?? true)) {
      const data = (await res.json()) as { response?: string };
      return { text: data.response ?? "" };
    }

    if (!res.body) {
      throw new Error("Ollama stream did not return a body.");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullText = "";
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }
        let chunk: OllamaGenerateChunk;
        try {
          chunk = JSON.parse(line) as OllamaGenerateChunk;
        } catch {
          continue;
        }

        const token = chunk.response ?? "";
        if (token) {
          fullText += token;
          options.onToken?.(token);
        }
      }
    }

    if (buffer.trim()) {
      try {
        const chunk = JSON.parse(buffer) as OllamaGenerateChunk;
        const token = chunk.response ?? "";
        if (token) {
          fullText += token;
          options.onToken?.(token);
        }
      } catch {
        // Ignore trailing malformed chunk.
      }
    }

    return { text: fullText };
  }
}
