import { describe, expect, it } from "vitest";
import { OllamaClient } from "../ollama/client";

describe("Ollama client integration", () => {
  it("lists models when Ollama is available", async () => {
    const client = new OllamaClient("http://127.0.0.1:11434");
    const connected = await client.checkConnection();

    if (!connected) {
      return;
    }

    const models = await client.listModels();
    expect(Array.isArray(models)).toBe(true);
  });
});
