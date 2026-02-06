import { SceneSkeletonSchema, type SceneSkeleton } from "../types/story";

type ParseResult = {
  parsed: SceneSkeleton | null;
  error?: string;
  recoveredFromSubstring?: boolean;
};

export function parseSceneSkeletonJson(raw: string): ParseResult {
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
    error: direct.error ?? "Could not parse scene skeleton JSON.",
  };
}

function safeParse(input: string): ParseResult {
  try {
    const candidate = JSON.parse(input);
    const normalized = normalizeSkeleton(candidate);
    const validated = SceneSkeletonSchema.safeParse(normalized);
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

function normalizeSkeleton(candidate: unknown): unknown {
  if (!candidate || typeof candidate !== "object") {
    return candidate;
  }
  const obj = candidate as Record<string, unknown>;
  if (!obj.constraints || typeof obj.constraints !== "object") {
    obj.constraints = {
      must_include: [],
      must_avoid: [],
    };
    return obj;
  }

  const constraints = obj.constraints as Record<string, unknown>;
  obj.constraints = {
    must_include: Array.isArray(constraints.must_include)
      ? constraints.must_include.filter((v) => typeof v === "string")
      : [],
    must_avoid: Array.isArray(constraints.must_avoid)
      ? constraints.must_avoid.filter((v) => typeof v === "string")
      : [],
  };

  return obj;
}
