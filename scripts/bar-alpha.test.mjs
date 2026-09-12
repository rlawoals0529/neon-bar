/**
 * The solver, tested on colours whose answer can be worked out by hand.
 *
 * The point of these is not that the arithmetic is right - it is four lines of WCAG - but
 * that the SEARCH is. Two versions of this script gave comfortable answers for the wrong
 * reason: one swept downward from opaque and stopped at the first failure, so it never saw
 * the passing region below it; the other checked white and black only, and missed that the
 * worst wallpaper is the one whose luminance MATCHES the outline. Each of those has a test
 * here that the earlier version fails.
 */
import { describe, expect, it } from "vitest";
import {
  BACKDROPS, FLOOR, UI_MIN,
  composite, contrast, luminance, parseColour, readPalettes, render, solveAll, solveAlpha, worstCase,
} from "./bar-alpha.mjs";

describe("colour reading", () => {
  it("reads the two notations a generated palette uses", () => {
    expect(parseColour("#ff7a4d")).toEqual([255, 122, 77]);
    expect(parseColour("hsl(0 0% 100%)")).toEqual([255, 255, 255]);
    expect(parseColour("hsl(15 10.2% 6.5%)")).toEqual([18, 16, 15]);
  });

  it("throws on a notation it does not know rather than guessing", () => {
    // A colour silently read as black solves to a number that means nothing, and nothing
    // downstream would ever notice.
    expect(() => parseColour("color(srgb 1 0 0)")).toThrow(/cannot read the colour/);
    expect(() => parseColour("rgb(255 0 0)")).toThrow(/cannot read the colour/);
  });
});

describe("contrast", () => {
  it("matches the two anchors everyone knows", () => {
    expect(contrast([255, 255, 255], [0, 0, 0])).toBeCloseTo(21, 5);
    expect(contrast([119, 119, 119], [119, 119, 119])).toBeCloseTo(1, 5);
  });

  it("is symmetric, so the order of the arguments cannot matter", () => {
    expect(contrast([12, 30, 90], [200, 180, 170])).toBeCloseTo(contrast([200, 180, 170], [12, 30, 90]), 9);
  });
});

describe("worstCase", () => {
  const bg = [18, 15, 15];
  const outline = [125, 87, 73];

  it("at full opacity is just the palette's own ratio", () => {
    expect(worstCase(bg, outline, 1)).toBeCloseTo(contrast(outline, bg), 9);
  });

  it("finds a wallpaper that white and black both miss", () => {
    // The bug the first version of this script shipped, in its clearest form. A mostly
    // see-through bar over BLACK reads 3.33:1 and over WHITE 3.33:1, so a check of the two
    // extremes signs it off - while the grey whose luminance lands on the outline erases it
    // completely, at 1.00:1. The extremes are not the worst case; the crossing point is.
    const extremesOnly = [[255, 255, 255], [0, 0, 0]];
    expect(worstCase([0, 0, 0], outline, 0.25, extremesOnly)).toBeGreaterThan(UI_MIN);
    expect(worstCase([0, 0, 0], outline, 0.25, BACKDROPS)).toBeCloseTo(1, 2);
  });

  it("catches the alpha this bar actually shipped with", () => {
    // 0.82 was the hand-picked number in the stylesheet before any of this was measured.
    expect(worstCase(bg, outline, 0.82, BACKDROPS)).toBeLessThan(2);
  });

  it("gets worse as the bar gets more transparent", () => {
    const ratios = [1, 0.95, 0.9, 0.82, 0.7].map((a) => worstCase(bg, outline, a));
    for (let i = 1; i < ratios.length; i++) expect(ratios[i]).toBeLessThan(ratios[i - 1]);
  });
});

describe("solveAlpha", () => {
  it("returns the most transparent alpha that passes, not the first one from the top", () => {
    // An outline with real headroom: white on a near-black background. It survives a long way
    // down, and a downward sweep that breaks on the first failure would answer 1 instead.
    const answer = solveAlpha([10, 10, 12], [255, 255, 255]);
    expect(answer).toBeLessThan(1);
    expect(worstCase([10, 10, 12], [255, 255, 255], answer)).toBeGreaterThanOrEqual(UI_MIN);
  });

  it("never answers below the floor, even when a lower alpha would pass", () => {
    const answer = solveAlpha([10, 10, 12], [255, 255, 255]);
    expect(answer).toBeGreaterThanOrEqual(FLOOR);
  });

  it("falls back to fully opaque when no transparency is safe", () => {
    // An outline sitting on the 3:1 line has nothing left to spend on a wallpaper, so the
    // only alpha that passes is the one the palette was measured at: 1.
    expect(solveAlpha([18, 16, 15], [125, 87, 73], BACKDROPS, 0.6)).toBe(1);
  });

  it("throws rather than answer an alpha that fails", () => {
    // Reached only if the caller skipped solveAll's check. Answering 1 anyway would put a
    // number in the stylesheet that the browser test then has to catch.
    expect(() => solveAlpha([26, 26, 26], [42, 42, 42])).toThrow(/nothing passes/);
  });

  it("answers something that actually passes, whatever it answers", () => {
    for (const [bg, outline] of [
      [[18, 15, 15], [125, 87, 73]],
      [[250, 248, 252], [120, 110, 130]],
      [[10, 10, 12], [255, 255, 255]],
    ]) {
      expect(worstCase(bg, outline, solveAlpha(bg, outline))).toBeGreaterThanOrEqual(UI_MIN);
    }
  });
});

describe("composite", () => {
  it("at alpha 1 is the layer itself and at 0 is what is behind it", () => {
    expect(composite([10, 20, 30], [200, 210, 220], 1)).toEqual([10, 20, 30]);
    expect(composite([10, 20, 30], [200, 210, 220], 0)).toEqual([200, 210, 220]);
  });
});

describe("reading the vendored stylesheet", () => {
  const css = `
[data-theme="a"] { --bg: hsl(15 10.2% 6.5%); --edge-strong: #7d5749; }
[data-theme="b"] { --bg: hsl(0 0% 98%); --edge-strong: #6a6a6a; }
`;

  it("finds every palette and its tokens", () => {
    const read = readPalettes(css);
    expect([...read.keys()]).toEqual(["a", "b"]);
    expect(read.get("a")["edge-strong"]).toBe("#7d5749");
  });

  it("refuses a palette missing a token it needs", () => {
    expect(() => solveAll(`[data-theme="a"] { --bg: hsl(0 0% 10%); }`)).toThrow(/no --edge-strong/);
  });

  it("refuses a stylesheet with no palettes at all rather than writing an empty file", () => {
    // Silently writing nothing is how a broken vendor step becomes a page with no palettes.
    expect(() => solveAll("/* nothing here */")).toThrow(/declared no palettes/);
  });

  it("refuses a palette whose outline already fails at full opacity", () => {
    // No alpha can fix that, and quietly writing 1 would hide a broken palette upstream.
    expect(() => solveAll(`[data-theme="x"] { --bg: hsl(0 0% 10%); --edge-strong: #2a2a2a; }`))
      .toThrow(/No alpha can fix that/);
  });

  it("renders one line per palette carrying the opaque ratio", () => {
    const text = render(solveAll(css));
    expect(text).toMatch(/\[data-theme="a"\] \{ --bar-alpha: [\d.]+; \} \/\* outline \d\.\d\d:1 opaque \*\//);
    expect(text.split("\n").filter((l) => l.startsWith("[data-theme"))).toHaveLength(2);
  });
});

describe("luminance", () => {
  it("is 0 for black and 1 for white", () => {
    expect(luminance([0, 0, 0])).toBeCloseTo(0, 9);
    expect(luminance([255, 255, 255])).toBeCloseTo(1, 9);
  });
});
