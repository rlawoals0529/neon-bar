import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describeFailures, probeContrast } from "./contrast-probe";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Read rather than imported. A JSON import needs an attribute in Node and none in the Vite
 *  build, and the two halves of this repo run in both. */
const themes = JSON.parse(
  readFileSync(resolve(HERE, "../theme/palettes.json"), "utf8"),
) as { id: string; label: string; scheme: "light" | "dark" }[];

/** What scripts/bar-alpha.mjs solved to, read from the file it generated. The stylesheet is
 *  the thing under test, so the expectation has to come from somewhere else. */
const solved = new Map(
  [...readFileSync(resolve(HERE, "../theme/bar-alpha.css"), "utf8")
    .matchAll(/\[data-theme="([^"]+)"\] \{ --bar-alpha: ([\d.]+); \}/g)]
    .map(([, id, alpha]) => [id!, Number(alpha)] as const),
);

test("the document under test is this app", async ({ page }) => {
  // Four repos here once shared two Playwright ports with reuseExistingServer, and a fully
  // green run against somebody else's preview server got as far as being believed. Nothing
  // below means anything until this passes.
  await page.goto("/bar/index.html");
  await expect(page).toHaveTitle("Neon bar");
  await expect(page.locator(".bar .clock")).toBeVisible();
});

test("the manifest and the solved alphas cover the same palettes", () => {
  expect(solved.size).toBe(themes.length);
  expect([...solved.keys()].sort()).toEqual(themes.map((t) => t.id).sort());
});

test("nothing on the bar is read against the desktop", async ({ page }) => {
  await page.goto("/bar/index.html");

  /*
   * The design decision this repo rests on, stated as something a browser can check.
   *
   * A bar floats on a wallpaper, so a palette's contrast guarantees - all computed against
   * an opaque --bg - hold for a piece of text only if there is an opaque surface between it
   * and the desktop. Every readout here sits in an opaque --raised chip for exactly that
   * reason. Comparing two probe runs over a white and a black backdrop would be the obvious
   * check and is a much weaker one: with no failures in either, "the two agree" is satisfied
   * by measuring nothing at all. This asserts the property itself.
   */
  const leaking = await page.evaluate(() => {
    const alphaOf = (c: string): number => {
      const rgb = c.match(/rgba?\(([^)]+)\)/);
      if (rgb) return rgb[1]!.split(/[,\s/]+/).filter(Boolean).map(Number)[3] ?? 1;
      const srgb = c.match(/color\(\s*srgb\s+([^)]+)\)/);
      if (srgb) return srgb[1]!.split(/[\s/]+/).filter(Boolean).map(Number)[3] ?? 1;
      throw new Error(`unreadable background "${c}"`);
    };
    const out: string[] = [];
    for (const el of document.querySelectorAll("body *")) {
      const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent!.trim()).join("");
      if (!text || !el.checkVisibility({ opacityProperty: true })) continue;
      let opaque = false;
      for (let n: Element | null = el; n; n = n.parentElement) {
        if (alphaOf(getComputedStyle(n).backgroundColor) > 0.999) { opaque = true; break; }
      }
      if (!opaque) out.push(`${el.tagName}.${el.getAttribute("class") ?? ""} "${text.slice(0, 20)}"`);
    }
    return out;
  });
  expect(leaking, leaking.join("\n")).toEqual([]);
});

test("the bar is painted at the alpha the solver chose, in every palette", async ({ page }) => {
  await page.goto("/bar/index.html");
  for (const theme of themes) {
    await page.evaluate((id) => document.documentElement.setAttribute("data-theme", id), theme.id);
    const alpha = await page.locator(".bar").evaluate((el) => {
      const c = getComputedStyle(el).backgroundColor;
      const rgb = c.match(/rgba?\(([^)]+)\)/);
      if (rgb) return rgb[1]!.split(/[,\s/]+/).filter(Boolean).map(Number)[3] ?? 1;
      const srgb = c.match(/color\(\s*srgb\s+([^)]+)\)/);
      if (srgb) return srgb[1]!.split(/[\s/]+/).filter(Boolean).map(Number)[3] ?? 1;
      throw new Error(`unreadable .bar background "${c}"`);
    });
    // A hand-picked 0.82 in the stylesheet, or a palette the generated file has not caught
    // up with, both land here rather than on somebody's desktop.
    expect(alpha, `${theme.id} is painted at ${alpha}`).toBeCloseTo(solved.get(theme.id)!, 3);
  }
});

for (const backdrop of ["#ffffff", "#000000"]) {
  test(`the bar clears AA in every palette over a ${backdrop === "#ffffff" ? "white" : "black"} desktop`, async ({ page }) => {
    await page.goto("/bar/index.html");
    const probe = await probeContrast(page, themes, { backdrop });
    // A sweep that silently stops switching measures one palette fifteen times and reports
    // that as full coverage.
    expect(probe.distinctPalettes).toBeGreaterThanOrEqual(themes.length - 1);
    expect(probe.styles, `only saw: ${probe.samples.join(", ")}`).toBeGreaterThan(6);
    // The clock is the readout furthest from the palette work, so if the sweep saw that it saw
    // the bar. Named on the SPAN, because the probe records elements holding text directly and
    // the chip around it holds only more elements.
    expect(probe.classes.join(" ")).toContain("SPAN.time");
    expect(probe.failures, describeFailures(probe.failures)).toEqual([]);
  });
}

test("the preview page clears AA in every palette", async ({ page }) => {
  await page.goto("/preview/");
  await expect(page.locator("#palette button[data-theme]")).toHaveCount(themes.length);
  const probe = await probeContrast(page, themes);
  expect(probe.distinctPalettes).toBeGreaterThanOrEqual(themes.length - 1);
  expect(probe.styles).toBeGreaterThan(9);
  expect(probe.failures, describeFailures(probe.failures)).toEqual([]);
});
