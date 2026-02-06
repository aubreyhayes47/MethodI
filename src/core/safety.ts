import type { SafetyResult } from "../types/story";

const MINOR_TERMS = [
  "minor",
  "child",
  "underage",
  "preteen",
  "teen",
  "schoolgirl",
  "schoolboy",
];

const EXPLICIT_SEXUAL_TERMS = [
  "explicit sex",
  "sexual act",
  "rape",
  "molest",
  "pornographic",
  "incest",
];

const WRONGDOING_TERMS = [
  "how to make a bomb",
  "build a bomb",
  "bypass a lock",
  "steal a car",
  "credit card fraud",
  "poison someone",
  "evade police",
];

export type SafetyCategory = "minor_sexual_content" | "wrongdoing_instructions";

function includesAny(text: string, terms: string[]): boolean {
  const normalized = text.toLowerCase();
  return terms.some((term) => normalized.includes(term));
}

export function scanForPolicyViolations(text: string): SafetyResult {
  const categories: SafetyCategory[] = [];
  const reasons: string[] = [];

  if (includesAny(text, MINOR_TERMS) && includesAny(text, EXPLICIT_SEXUAL_TERMS)) {
    categories.push("minor_sexual_content");
    reasons.push("Detected potential explicit sexual content involving minors.");
  }

  if (includesAny(text, WRONGDOING_TERMS)) {
    categories.push("wrongdoing_instructions");
    reasons.push("Detected instructions for wrongdoing.");
  }

  return {
    blocked: categories.length > 0,
    categories,
    reasons,
  };
}
