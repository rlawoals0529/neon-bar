#!/usr/bin/env node
/**
 * Re-shoot the README's screenshots from the built bar.
 *
 * They are checked in because a README that renders nothing on npm or in a feed reader is a
 * worse README, and they go stale the moment the palette changes - which is exactly what
 * just happened. Generated rather than captured by hand so "stale" is one command.
 *
 *   npm run build && node scripts/shots.mjs
 */
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";

const SHOTS = [
  { theme: "twilight-comet", file: "docs/preview-twilight-comet.png" },
  { theme: "wisteria-alley", file: "docs/preview-wisteria-alley.png" },
];

const server = spawn("npx", ["vite", "preview", "--port", "4189"], { stdio: "ignore" });
try {
  await wait(2500);
  const browser = await chromium.launch();
  // Twice the pixels, so the bar is not a blurred strip on a laptop display.
  const page = await browser.newPage({ viewport: { width: 1180, height: 38 }, deviceScaleFactor: 2 });
  for (const shot of SHOTS) {
    await page.goto(`http://localhost:4189/bar/index.html?theme=${shot.theme}`);
    // The equaliser animates and the meters transition in; settle before shooting or the
    // two images differ by whatever frame they landed on.
    await wait(1200);
    await page.screenshot({ path: shot.file });
    console.log(`  ${shot.theme} -> ${shot.file}`);
  }
  await browser.close();
} finally {
  server.kill();
}
