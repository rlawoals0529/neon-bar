/**
 * Rendering is separated from data on purpose: `render(state)` is a pure function of a
 * plain object, so the bar can be driven by Zebar on Windows or by the mock in preview/
 * in any browser. Anything that reads from `zebar` directly would only be testable on
 * a machine running Zebar.
 */

const el = (sel) => document.querySelector(sel);

const pct = (n) => (n == null ? "--" : `${Math.round(n)}%`);

function meter(value, hot = 85) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  return `<span class="meter${v >= hot ? " hot" : ""}"><i style="width:${v}%"></i></span>`;
}

function workspaces(list, focusedName) {
  if (!list?.length) return "";
  return list
    .map((w) => {
      const state = w.name === focusedName ? "focused" : w.hasWindows ? "populated" : "empty";
      return `<button type="button" data-state="${state}" data-ws="${w.name}">${w.displayName ?? w.name}</button>`;
    })
    .join("");
}

function media(m) {
  if (!m?.title) return `<span class="label">nothing playing</span>`;
  const bars = `<span class="eq"><i></i><i></i><i></i><i></i></span>`;
  const artist = m.artist ? `<span class="artist">${m.artist}</span>` : "";
  return `${bars}<span class="title">${m.title}</span>${artist}`;
}

export function render(state) {
  el(".ws").innerHTML = workspaces(state.workspaces, state.focusedWorkspace);

  const mediaChip = el(".media");
  mediaChip.classList.toggle("paused", state.media?.isPlaying === false);
  mediaChip.innerHTML = media(state.media);

  el(".cpu").innerHTML = `<span class="label">cpu</span>${meter(state.cpu)}<span class="value">${pct(state.cpu)}</span>`;
  el(".mem").innerHTML = `<span class="label">ram</span>${meter(state.memory)}<span class="value">${pct(state.memory)}</span>`;

  const net = el(".net");
  net.innerHTML = `<span class="dot${state.online ? " on" : ""}"></span><span class="value">${state.network ?? "offline"}</span>`;

  const batt = el(".batt");
  if (state.battery == null) {
    batt.hidden = true;
  } else {
    batt.hidden = false;
    batt.innerHTML =
      `<span class="label">${state.charging ? "chg" : "bat"}</span>` +
      meter(state.battery, 101) +
      `<span class="value">${pct(state.battery)}</span>`;
  }

  const weather = el(".weather");
  if (state.tempC == null) {
    weather.hidden = true;
  } else {
    weather.hidden = false;
    weather.innerHTML = `<span class="value">${Math.round(state.tempC)}°</span>`;
  }

  el(".clock").innerHTML =
    `<span class="time">${state.time ?? "--:--"}</span><span class="date">${state.date ?? ""}</span>`;
}
