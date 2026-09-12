/**
 * The preview page: frame the real bar, and let you try every palette on it.
 *
 * The picker is yozora's - `createThemeStore` for the choosing and remembering,
 * `wirePalette` for the keys - because a palette picker that is subtly different on one
 * page out of six is a bug nobody notices until they use two of them in a row.
 *
 * What is local is how the choice REACHES the bar. The bar is a separate document in an
 * iframe, so it is told by reloading it with `?theme=`, rather than by writing an attribute
 * into it. That matters beyond tidiness: it is the same path Zebar takes, so what this page
 * exercises is what Windows runs, and the alternative - reaching through `contentDocument`
 * and setting a property - only works because this page happens to be same-origin, and
 * silently stops working the day the bar moves.
 */
import { createThemeStore, grouped, type Theme } from "../lib/theme";
import { wirePalette } from "../lib/palette-keys";
import manifest from "../theme/palettes.json";

const themes = manifest as unknown as Theme[];
const store = createThemeStore(themes, "rain-lantern", "neon-bar:theme");

const frame = document.querySelector<HTMLIFrameElement>("#bar")!;
const list = document.querySelector<HTMLElement>("#palette")!;
const reading = document.querySelector<HTMLElement>("#reading")!;

/** The alpha the solver landed on for each palette, read out of the generated stylesheet so
 *  the sentence under the picker cannot drift from the number the bar is actually painted at. */
const alphaOf = (id: string): string => {
  const probe = document.createElement("div");
  probe.dataset.theme = id;
  probe.style.display = "none";
  document.body.append(probe);
  const value = getComputedStyle(probe).getPropertyValue("--bar-alpha").trim();
  probe.remove();
  return value || "1";
};

function show(id: string) {
  const applied = store.apply(id);
  // Reload rather than mutate: same path as Zebar, and it proves the bar can start up in any
  // palette rather than only reach one by being poked.
  frame.src = `../bar/index.html?theme=${encodeURIComponent(applied)}`;
  const theme = themes.find((t) => t.id === applied)!;
  reading.textContent =
    `${theme.label} - ${theme.scheme}, bar painted at ${alphaOf(applied)} opacity.`;
}

for (const group of grouped(themes)) {
  const heading = document.createElement("span");
  heading.className = "note scheme";
  heading.textContent = group.label;
  list.append(heading);
  for (const theme of group.themes) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.theme = theme.id;
    button.innerHTML = `<span class="dot"></span><span>${theme.label}</span>`;
    button.querySelector<HTMLElement>(".dot")!.style.background = theme.accent;
    list.append(button);
  }
}

// Applied BEFORE the keys are wired, not after. wirePalette decides which option carries the
// single tab stop from whatever is on the page when it runs, so wiring first and applying
// second leaves the tab stop on the palette in the markup rather than on the saved one.
show(store.initial());

const options = [...list.querySelectorAll<HTMLButtonElement>("button[data-theme]")];
wirePalette(list, options, {
  select: show,
  current: () => document.documentElement.dataset.theme ?? "",
});
