/**
 * Stand-in for Zebar's providers so the bar opens in any browser.
 *
 * This exists because the visual half of a status bar is the half worth iterating on, and
 * iterating on it should not require Windows, GlazeWM and a running Zebar.
 */
const TRACKS = [
  { title: "Blue Hour", artist: "Yorushika", isPlaying: true },
  { title: "Departure", artist: "Masayoshi Soeda", isPlaying: true },
  { title: "Lost in Kyoto", artist: "Chill Lofi", isPlaying: false },
];

let tick = 0;
let cpu = 24;
let mem = 61;

function jitter(v, amount, lo, hi) {
  return Math.max(lo, Math.min(hi, v + (Math.random() - 0.5) * amount));
}

function snapshot() {
  tick++;
  cpu = jitter(cpu, 22, 3, 97);
  mem = jitter(mem, 5, 30, 92);
  const now = new Date();
  return {
    workspaces: [
      { name: "1", displayName: "1", hasWindows: true },
      { name: "2", displayName: "2", hasWindows: true },
      { name: "3", displayName: "3", hasWindows: false },
      { name: "4", displayName: "4", hasWindows: false },
    ],
    focusedWorkspace: "2",
    media: TRACKS[Math.floor(tick / 12) % TRACKS.length],
    cpu,
    memory: mem,
    network: "Wi-Fi",
    online: true,
    battery: 78,
    charging: false,
    tempC: 21,
    time: now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    date: now.toLocaleDateString([], { weekday: "short" }),
  };
}

export const mockProviders = {
  initial: snapshot,
  onOutput(cb) {
    setInterval(() => cb(snapshot()), 1000);
  },
};
