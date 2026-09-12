#!/usr/bin/env node
/**
 * Solve, per palette, how transparent the bar is allowed to be and still be legible over a
 * desktop nobody here has seen.
 *
 * The problem this exists for
 * ---------------------------
 * yozora computes its contrast guarantees against an OPAQUE --bg. A status bar is not
 * opaque: it floats over a wallpaper, so what a colour is really read against is
 *
 *     alpha * --bg  +  (1 - alpha) * whatever is behind
 *
 * and "whatever is behind" is a photograph of a mountain, or pure black, or pure white.
 * Every guarantee in the palette file is void for anything painted on that surface.
 *
 * Half of the answer is a design decision rather than a number: every piece of TEXT on this
 * bar sits inside an opaque --raised chip. That puts the text back under yozora's own
 * guarantees exactly, whatever the wallpaper, and e2e/contrast.spec.ts proves it by
 * measuring the same page over a white and a black backdrop and requiring the readings to
 * be IDENTICAL rather than merely passing.
 *
 * What is left is the BOUNDARY: the 1px --edge-strong outline that separates a chip from the
 * bar behind it. That one really does sit on the composited surface, and WCAG 1.4.11 wants
 * 3:1 from it.
 *
 * The correction that produced the result
 * ---------------------------------------
 * The first version of this checked white and black and nothing else, and it was wrong in
 * the direction that matters: contrast against a fixed colour is V-shaped in the other
 * colour's luminance, bottoming out where the two MEET rather than at either extreme. A bar
 * checked over white and black alone passes while a mid-grey wallpaper - which is what most
 * photographs blur down to - lands exactly on the outline colour and erases it. Sweeping
 * every grey instead turned a comfortable answer into the real one.
 *
 *   node scripts/bar-alpha.mjs           write theme/bar-alpha.css
 *   node scripts/bar-alpha.mjs --check   fail if the file on disk is not what this solves to
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(HERE, "theme", "palettes.css");
const OUT = join(HERE, "theme", "bar-alpha.css");

/** WCAG 1.4.11: a boundary you need in order to tell one control from another. */
export const UI_MIN = 3;

/**
 * The desktops to survive.
 *
 * Greys rather than hues, and all of them rather than the extremes. Luminance is the only
 * thing contrast is computed from, so every hue at a given luminance gives the same ratio,
 * and 256 steps is exhaustive at 8-bit precision.
 */
export const BACKDROPS = Array.from({ length: 256 }, (_, v) => [v, v, v]);

/** Never go below this however well it solves. A bar you can see straight through stops
 *  reading as a bar, whatever the arithmetic says about its outline. */
export const FLOOR = 0.6;

/**
 * Step of the alpha search.
 *
 * A percentage point, not half of one. The first version stepped by 0.005 and two palettes
 * came back at 0.995, which is not headroom: it is a half-percent of transparency that no
 * eye resolves, that Chromium rounds away when it serialises the composited colour, and that
 * split the generated file into two groups for no reason anybody could act on.
 */
export const STEP = 0.01;

const channel = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};

export const luminance = ([r, g, b]) =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `over` painted at `alpha` on top of `under`. */
export const composite = (over, under, alpha) =>
  [0, 1, 2].map((i) => over[i] * alpha + under[i] * (1 - alpha));

/**
 * Colour literals as they appear in a generated palette: #rrggbb and hsl(h s% l%).
 *
 * Deliberately narrow. A notation this does not know is thrown on rather than guessed at,
 * because a colour silently read as black would solve to a number that means nothing.
 */
export function parseColour(value) {
  const hex = value.trim().match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const hsl = value.trim().match(/^hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)$/i);
  if (hsl) return hslToRgb(Number(hsl[1]), Number(hsl[2]) / 100, Number(hsl[3]) / 100);
  throw new Error(`bar-alpha: cannot read the colour "${value}"`);
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r, g, b].map((v) => Math.round((v + m) * 255));
}

/** Every `[data-theme="id"] { … }` block, as id -> { token: value }. */
export function readPalettes(css) {
  const out = new Map();
  for (const [, id, body] of css.matchAll(/\[data-theme="([^"]+)"\]\s*\{([^}]*)\}/g)) {
    const tokens = {};
    for (const [, name, value] of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) tokens[name] = value.trim();
    out.set(id, tokens);
  }
  return out;
}

/**
 * The worst contrast `boundary` can be reduced to, over any wallpaper, when the surface
 * behind it is `bg` painted at `alpha`.
 *
 * This is the number that decides everything. At alpha 1 it is the palette's own guarantee;
 * below 1 it falls away fast, because the wallpaper is free to be whatever luminance hurts
 * most.
 */
export function worstCase(bg, boundary, alpha, backdrops = BACKDROPS) {
  let worst = Infinity;
  for (const behind of backdrops) {
    const ratio = contrast(boundary, composite(bg, behind, alpha));
    if (ratio < worst) worst = ratio;
  }
  return worst;
}

/**
 * The MOST TRANSPARENT alpha that still clears UI_MIN in the worst case.
 *
 * Swept upward from the floor rather than down from 1, because transparency is what is being
 * maximised: the first alpha that passes on the way up is the answer. Swept at all rather
 * than bisected because worstCase() is not monotonic in alpha.
 *
 * Throws rather than returning a sentinel if nothing in the range passes. It cannot happen
 * for a palette solveAll() has checked - alpha 1 is exactly the ratio that check demands, so
 * 1 is always an answer - and the earlier version, which returned null for the caller to
 * substitute a 1, made a branch nobody could reach look like a case somebody had handled.
 */
export function solveAlpha(bg, boundary, backdrops = BACKDROPS, floor = FLOOR) {
  for (let a = floor; a <= 1 + 1e-9; a += STEP) {
    const alpha = Math.min(1, Math.round(a * 1000) / 1000);
    if (worstCase(bg, boundary, alpha, backdrops) >= UI_MIN) return alpha;
  }
  throw new Error(
    `bar-alpha: nothing passes for outline ${boundary} on ${bg}, not even fully opaque`,
  );
}

export function solveAll(css) {
  const rows = [];
  for (const [id, tokens] of readPalettes(css)) {
    for (const need of ["bg", "edge-strong"]) {
      if (!tokens[need]) throw new Error(`bar-alpha: palette "${id}" has no --${need}`);
    }
    const bg = parseColour(tokens.bg);
    const boundary = parseColour(tokens["edge-strong"]);
    // A palette whose own outline does not clear 3:1 against its own background is broken
    // upstream, and pretending an alpha fixes it would hide that. yozora's check-contrast
    // covers this; failing loudly here is the second lock.
    const opaque = contrast(boundary, bg);
    if (opaque < UI_MIN) {
      throw new Error(
        `bar-alpha: "${id}" has --edge-strong at ${opaque.toFixed(2)}:1 on its own --bg, ` +
        `below ${UI_MIN}. No alpha can fix that; fix the palette in yozora.`,
      );
    }
    rows.push({ id, alpha: solveAlpha(bg, boundary), opaque });
  }
  if (rows.length === 0) throw new Error("bar-alpha: theme/palettes.css declared no palettes");
  return rows;
}

export function render(rows) {
  // Counted on the value, not on whether the sweep ran out: a palette that only passes at
  // exactly 1 and one for which nothing passed are the same fact to a reader.
  const pinned = rows.filter((r) => r.alpha === 1).length;
  return `/* Generated by scripts/bar-alpha.mjs. Do not edit by hand: e2e/contrast.spec.ts measures
   the result in a real browser, so a hand-picked number will not survive it.

   Per palette, the most transparent --bar-alpha at which the chip outline still clears
   ${UI_MIN}:1 against the bar's ground over the WORST wallpaper - not merely over white and black.

   ${pinned} of ${rows.length} solve to 1, and that is the finding rather than a bug. yozora tunes
   --edge-strong to sit just above ${UI_MIN}:1 on its own --bg, so there is no headroom left to
   spend on a desktop: a translucent bar is a bar whose outline a grey wallpaper can erase.
   The comment beside each number is what that outline is worth when the bar is opaque. */

` + rows.map((r) =>
    `[data-theme="${r.id}"] { --bar-alpha: ${r.alpha}; } /* outline ${r.opaque.toFixed(2)}:1 opaque */`,
  ).join("\n") + "\n";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = solveAll(readFileSync(SOURCE, "utf8"));
  const text = render(rows);
  if (process.argv.includes("--check")) {
    const have = readFileSync(OUT, "utf8");
    if (have !== text) {
      console.error("bar-alpha: theme/bar-alpha.css is stale. Run `node scripts/bar-alpha.mjs`.");
      process.exit(1);
    }
    console.log(`bar-alpha: up to date (${rows.length} palettes)`);
  } else {
    for (const r of rows) {
      console.log(`  ${r.id.padEnd(22)} alpha ${String(r.alpha).padEnd(6)} outline ${r.opaque.toFixed(2)}:1 opaque`);
    }
    writeFileSync(OUT, text);
    console.log(`wrote ${rows.length} palettes -> theme/bar-alpha.css`);
  }
}
