import { ScriptGenerationOutputSchema, type ScriptGenerationOutput } from "../types/story";

type ParseResult = {
  parsed: ScriptGenerationOutput | null;
  error?: string;
  recoveredFromSubstring?: boolean;
};

export function parseScriptJson(raw: string): ParseResult {
  const direct = safeParse(raw);
  if (direct.parsed) {
    return direct;
  }

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const slice = raw.slice(firstBrace, lastBrace + 1);
    const recovered = safeParse(slice);
    if (recovered.parsed) {
      return { ...recovered, recoveredFromSubstring: true };
    }
  }

  return {
    parsed: null,
    error: direct.error ?? "Could not parse JSON output.",
  };
}

function safeParse(input: string): ParseResult {
  try {
    const candidate = JSON.parse(input);
    const validated = ScriptGenerationOutputSchema.safeParse(candidate);
    if (!validated.success) {
      return { parsed: null, error: validated.error.message };
    }
    return { parsed: validated.data };
  } catch (error) {
    return {
      parsed: null,
      error: error instanceof Error ? error.message : "Unknown JSON parse error",
    };
  }
}
