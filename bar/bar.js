/**
 * Zebar binding. Maps provider output onto the plain state object render() expects.
 *
 * Falls back to the preview mock when the `zebar` module is unavailable, which is how the
 * same files open in a normal browser.
 */
import { render } from "./render.js";
import { applyThemeFromQuery } from "./theme.js";

// Before anything paints. The preview frames this page in an iframe and names the palette in
// the URL; on Windows the palette is the data-theme already in index.html and this is a no-op.
applyThemeFromQuery();

const empty = {
  workspaces: [], focusedWorkspace: null, media: null,
  cpu: null, memory: null, network: null, online: false,
  battery: null, charging: false, tempC: null, time: null, date: null,
};

function fromZebar(out) {
  const gwm = out.glazewm;
  const monitor = gwm?.currentMonitor;
  return {
    workspaces: monitor?.children?.map((w) => ({
      name: w.name,
      displayName: w.displayName ?? w.name,
      hasWindows: (w.children?.length ?? 0) > 0,
    })) ?? [],
    focusedWorkspace: gwm?.focusedWorkspace?.name ?? null,
    media: out.media?.currentSession
      ? {
          title: out.media.currentSession.title,
          artist: out.media.currentSession.artist,
          isPlaying: out.media.currentSession.isPlaying,
        }
      : null,
    cpu: out.cpu?.usage ?? null,
    memory: out.memory?.usage ?? null,
    network: out.network?.defaultInterface?.name ?? null,
    online: Boolean(out.network?.defaultGateway),
    battery: out.battery?.chargePercent ?? null,
    charging: out.battery?.state === "charging",
    tempC: out.weather?.celsiusTemp ?? null,
    time: out.date?.formatted ?? null,
    date: out.date?.dayName ?? null,
  };
}

async function start() {
  let zebar;
  try {
    // Through a variable so a bundler cannot try to resolve it. The preview build has no
    // `zebar` package and never will; a statically visible specifier fails that build
    // instead of falling through to the mock the way it does in a plain browser.
    const host = "zebar";
    zebar = await import(/* @vite-ignore */ host);
  } catch {
    const { mockProviders } = await import("../preview/mock.js");
    render({ ...empty, ...mockProviders.initial() });
    mockProviders.onOutput((s) => render({ ...empty, ...s }));
    return;
  }

  const providers = zebar.createProviderGroup({
    glazewm: { type: "glazewm" },
    media: { type: "media" },
    cpu: { type: "cpu", refreshInterval: 3000 },
    memory: { type: "memory", refreshInterval: 5000 },
    network: { type: "network", refreshInterval: 10000 },
    battery: { type: "battery", refreshInterval: 30000 },
    weather: { type: "weather", refreshInterval: 600000 },
    date: { type: "date", formatting: "h:mm a", refreshInterval: 1000 },
  });

  render({ ...empty, ...fromZebar(providers.outputMap) });
  providers.onOutput((out) => render({ ...empty, ...fromZebar(out) }));

  document.querySelector(".ws").addEventListener("click", (e) => {
    const name = e.target.closest("[data-ws]")?.dataset.ws;
    if (name) providers.outputMap.glazewm?.runCommand(`focus --workspace ${name}`);
  });
}

start();
