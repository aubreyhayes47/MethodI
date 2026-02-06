import { describe, expect, it } from "vitest";
import { parseSceneSkeletonJson } from "../core/sceneSkeletonParser";

describe("parseSceneSkeletonJson", () => {
  it("parses direct skeleton json", () => {
    const raw = JSON.stringify({
      goal: "Steal the ledger",
      opposition: "Guard captain",
      plan: "Distract and lift keys",
      turn: "Captain spots the decoy",
      choice: "Holmes reveals his identity",
      cost: "Loses anonymity",
      outcome: "Gate opens but alarm spreads",
      protagonist: "SHERLOCK_HOLMES",
      constraints: {
        must_include: ["spoken refusal"],
        must_avoid: ["protagonist silent entire scene"],
      },
    });

    const result = parseSceneSkeletonJson(raw);
    expect(result.parsed?.protagonist).toBe("SHERLOCK_HOLMES");
    expect(result.parsed?.constraints.must_include.length).toBe(1);
  });

  it("recovers skeleton json from wrapped text", () => {
    const raw = `noise {"goal":"Recover map","opposition":"Storm","plan":"Cross marsh","turn":"Bridge collapses","choice":"Alice cuts the tether","cost":"She loses supplies","outcome":"They survive with less food","protagonist":"ALICE","constraints":{"must_include":[],"must_avoid":[]}} trailer`;
    const result = parseSceneSkeletonJson(raw);
    expect(result.parsed?.goal).toBe("Recover map");
    expect(result.recoveredFromSubstring).toBe(true);
  });

  it("normalizes missing constraints arrays", () => {
    const raw = JSON.stringify({
      goal: "g",
      opposition: "o",
      plan: "p",
      turn: "t",
      choice: "c",
      cost: "x",
      outcome: "y",
      protagonist: "ALICE",
      constraints: {},
    });
    const result = parseSceneSkeletonJson(raw);
    expect(result.parsed?.constraints.must_include).toEqual([]);
    expect(result.parsed?.constraints.must_avoid).toEqual([]);
  });
});
