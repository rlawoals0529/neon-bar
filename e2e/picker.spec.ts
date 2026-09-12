import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const themes = JSON.parse(
  readFileSync(resolve(HERE, "../theme/palettes.json"), "utf8"),
) as { id: string; label: string; scheme: "light" | "dark" }[];

const swatches = "#palette button[data-theme]";

test.describe("the bar's own palette", () => {
  test("comes from the query string, which is how the preview and Zebar both name it", async ({ page }) => {
    await page.goto("/bar/index.html?theme=sakura-lake");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "sakura-lake");
  });

  test("falls back to the one in the markup when the query names a palette nobody defines", async ({ page }) => {
    // Applying it anyway leaves a bar with NO palette, painted in browser defaults, which
    // reads as a rendering bug rather than as a typo in a config file.
    await page.goto("/bar/index.html?theme=not-a-palette");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "rain-lantern");
    const fg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--fg").trim());
    expect(fg).not.toBe("");
  });
});

test.describe("the picker", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/preview/");
    await expect(page.locator(swatches)).toHaveCount(themes.length);
  });

  test("is one tab stop, not fifteen", async ({ page }) => {
    const tabbable = await page.locator(swatches).evaluateAll(
      (els) => els.filter((el) => (el as HTMLElement).tabIndex === 0).length);
    expect(tabbable).toBe(1);
    await expect(page.locator("#palette")).toHaveAttribute("role", "radiogroup");
    await expect(page.locator(`${swatches}[aria-checked="true"]`)).toHaveCount(1);
  });

  test("previews as you arrow through it, rather than only on click", async ({ page }) => {
    const first = page.locator(`${swatches}[aria-checked="true"]`);
    const before = await first.getAttribute("data-theme");
    await first.focus();
    await page.keyboard.press("ArrowRight");
    const after = await page.locator(`${swatches}[aria-checked="true"]`).getAttribute("data-theme");
    expect(after).not.toBe(before);
    await expect(page.locator("html")).toHaveAttribute("data-theme", after!);
  });

  test("puts back what you were on when you press Escape", async ({ page }) => {
    const started = await page.locator("html").getAttribute("data-theme");
    await page.locator(`${swatches}[aria-checked="true"]`).focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    expect(await page.locator("html").getAttribute("data-theme")).not.toBe(started);
    await page.keyboard.press("Escape");
    await expect(page.locator("html")).toHaveAttribute("data-theme", started!);
  });

  test("reaches the bar by reloading it, the same way Zebar starts it", async ({ page }) => {
    await page.locator(`${swatches}[data-theme="neko-lantern"]`).click();
    const frame = page.frameLocator("#bar");
    // Not just the URL: the framed document has to have COME UP in that palette, which is
    // what proves the bar can start in any of them rather than only be poked into one.
    await expect(frame.locator("html")).toHaveAttribute("data-theme", "neko-lantern");
    expect(page.locator("#bar")).toBeTruthy();
    await expect(page.locator("#reading")).toContainText("Neko Lantern");
  });

  test("remembers the choice across a reload", async ({ page }) => {
    await page.locator(`${swatches}[data-theme="coral-horizon"]`).click();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "coral-horizon");
    await expect(page.locator(`${swatches}[data-theme="coral-horizon"]`)).toHaveAttribute("aria-checked", "true");
    // The single tab stop has to move with the choice, or a reload lands it on whichever
    // palette the markup happens to name.
    expect(await page.locator(`${swatches}[data-theme="coral-horizon"]`).evaluate(
      (el) => (el as HTMLElement).tabIndex)).toBe(0);
  });
});
