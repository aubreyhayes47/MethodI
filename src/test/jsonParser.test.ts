import { describe, expect, it } from "vitest";
import { parseScriptJson } from "../core/jsonParser";

describe("parseScriptJson", () => {
  it("parses direct JSON", () => {
    const raw = JSON.stringify({
      beats: [{ speaker: "SHERLOCK_HOLMES", content: "Observe the cuff." }],
      scene_status: "continue",
      notes: { tension: 7, mystery: 8, romance: 1 },
    });

    const result = parseScriptJson(raw);
    expect(result.parsed?.beats.length).toBe(1);
  });

  it("recovers JSON embedded in extra text", () => {
    const raw = `noise>>> {"beats":[{"speaker":"NARRATOR/STAGE","content":"Rain gathers."}],"scene_status":"continue","notes":{"tension":4,"mystery":3,"romance":0}} <<<noise`;
    const result = parseScriptJson(raw);
    expect(result.parsed?.scene_status).toBe("continue");
    expect(result.recoveredFromSubstring).toBe(true);
  });

  it("returns parse error when invalid", () => {
    const result = parseScriptJson("not json");
    expect(result.parsed).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it("rejects invalid scene_status enum", () => {
    const raw = JSON.stringify({
      beats: [{ speaker: "SHERLOCK_HOLMES", content: "Invalid enum case." }],
      scene_status: "finished",
      notes: { tension: 5, mystery: 5, romance: 1 },
    });
    const result = parseScriptJson(raw);
    expect(result.parsed).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it("rejects missing required notes object", () => {
    const raw = JSON.stringify({
      beats: [{ speaker: "DR_JOHN_WATSON", content: "Missing notes." }],
      scene_status: "continue",
    });
    const result = parseScriptJson(raw);
    expect(result.parsed).toBeNull();
    expect(result.error).toBeTruthy();
  });
});
