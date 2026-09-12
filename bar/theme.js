/**
 * Which palette this bar is painted in.
 *
 * Deliberately not yozora's theme.ts, and the reason is the whole shape of this repo: the
 * bar is loaded by Zebar straight off disk as ES modules, with no bundler anywhere, so it
 * cannot import a `.ts` file. Rather than vendor a plain-JS fork of the theme store - two
 * copies of the same decisions, one of which nobody would refresh - the bar takes the one
 * piece it actually needs. It has no scrollbars and no form controls, so `color-scheme` has
 * nothing to steer, and it has no picker of its own: on Windows the palette is a line in
 * this repo's own `bar/index.html`. The store, with its storage guards and its light/dark
 * handling, is used where it IS needed - the preview page, which has a build.
 *
 * The one thing worth being careful about is an id that no stylesheet defines. Setting it
 * anyway leaves a bar with no palette at all, painted in whatever the browser defaults to,
 * which looks like a rendering bug rather than a typo. So the value is applied and then read
 * BACK out of the cascade: if `--fg` came through, the palette exists. That validates
 * against the stylesheet itself rather than against a list this file would have to keep in
 * step with it.
 */
export function applyThemeFromQuery(
  doc = document,
  search = doc.defaultView?.location.search ?? "",
) {
  const wanted = new URLSearchParams(search).get("theme");
  if (!wanted) return doc.documentElement.dataset.theme ?? null;

  const root = doc.documentElement;
  const before = root.dataset.theme ?? null;
  root.dataset.theme = wanted;
  const defined = doc.defaultView
    ? doc.defaultView.getComputedStyle(root).getPropertyValue("--fg").trim() !== ""
    : false;
  if (defined) return wanted;

  if (before === null) delete root.dataset.theme;
  else root.dataset.theme = before;
  return before;
}
