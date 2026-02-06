import { CharacterSchema, type Character } from "../types/story";

export function loadCharacterRoster(): Character[] {
  const modules = import.meta.glob("../../assets/characters/*.json", {
    eager: true,
  }) as Record<string, { default: unknown } | unknown>;

  const parsed: Character[] = [];

  for (const value of Object.values(modules)) {
    const data =
      typeof value === "object" && value !== null && "default" in value
        ? (value as { default: unknown }).default
        : value;

    const result = CharacterSchema.safeParse(data);
    if (result.success) {
      parsed.push(result.data);
    }
  }

  return parsed.sort((a, b) => a.name.localeCompare(b.name));
}
