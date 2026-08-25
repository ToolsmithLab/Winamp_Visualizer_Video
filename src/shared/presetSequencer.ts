import type {
  PresetChangeSource,
  ProjectMSettings
} from "./project";

export interface PresetSequenceEvent {
  index: number;
  time: number;
  presetId: string;
  source: PresetChangeSource;
}

function uint32(value: number): number {
  return Number.isFinite(value) ? value >>> 0 : 0;
}

export function deterministicUnit(seed: number, index: number): number {
  let value = uint32(seed) ^ Math.imul(uint32(index + 1), 0x9e3779b1);
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return ((value ^ (value >>> 15)) >>> 0) / 0x1_0000_0000;
}

export function deterministicShuffle(
  values: readonly string[],
  seed: number,
  cycle = 0
): string[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(
      deterministicUnit(seed ^ Math.imul(cycle + 1, 0x85ebca6b), index) *
        (index + 1)
    );
    [result[index], result[swap]] = [result[swap] as string, result[index] as string];
  }
  return result;
}

function usablePlaylist(
  settings: ProjectMSettings,
  availableIds: readonly string[]
): string[] {
  const available = new Set(availableIds);
  const configured = settings.playlistIds.filter((id) => available.has(id));
  if (configured.length) {
    const playlist = [...new Set(configured)];
    if (
      available.has(settings.presetId) &&
      !playlist.includes(settings.presetId)
    ) {
      playlist.unshift(settings.presetId);
    }
    return playlist;
  }
  if (available.has(settings.presetId)) return [settings.presetId];
  return availableIds.length ? [availableIds[0] as string] : [];
}

export function manualPresetChoice(
  settings: ProjectMSettings,
  availableIds: readonly string[],
  direction: "previous" | "next" | "random"
): string | null {
  const playlist = usablePlaylist(settings, availableIds);
  if (!playlist.length) return null;
  const currentIndex = Math.max(0, playlist.indexOf(settings.presetId));
  if (direction === "previous") {
    return playlist[(currentIndex - 1 + playlist.length) % playlist.length] ?? null;
  }
  if (direction === "next") {
    return playlist[(currentIndex + 1) % playlist.length] ?? null;
  }
  if (playlist.length === 1) return playlist[0] ?? null;
  let selected = Math.floor(
    deterministicUnit(settings.randomSeed, settings.manualRandomCounter) *
      playlist.length
  );
  if (
    settings.autoSwitch.noImmediateRepeat &&
    playlist[selected] === settings.presetId
  ) {
    selected = (selected + 1) % playlist.length;
  }
  return playlist[selected] ?? null;
}

function sequencePreset(
  playlist: readonly string[],
  settings: ProjectMSettings,
  eventIndex: number,
  previous: string
): string {
  if (playlist.length <= 1) return playlist[0] ?? previous;
  if (settings.autoSwitch.order === "sequential") {
    const start = Math.max(
      0,
      playlist.indexOf(settings.sequenceStartPresetId)
    );
    return playlist[(start + eventIndex) % playlist.length] as string;
  }
  const cycle = Math.floor(eventIndex / playlist.length);
  const position = eventIndex % playlist.length;
  const shuffled = deterministicShuffle(playlist, settings.randomSeed, cycle);
  let result = shuffled[position] as string;
  if (
    settings.autoSwitch.noImmediateRepeat &&
    result === previous &&
    playlist.length > 1
  ) {
    result = shuffled[(position + 1) % shuffled.length] as string;
  }
  return result;
}

export function buildPresetSequence(
  settings: ProjectMSettings,
  availableIds: readonly string[],
  durationSeconds: number
): PresetSequenceEvent[] {
  const playlist = usablePlaylist(settings, availableIds);
  if (!playlist.length) return [];
  const duration = Math.max(0, durationSeconds);
  const initial = playlist.includes(settings.sequenceStartPresetId)
    ? settings.sequenceStartPresetId
    : playlist.includes(settings.presetId)
      ? settings.presetId
      : (playlist[0] as string);
  const events: PresetSequenceEvent[] = [
    { index: 0, time: 0, presetId: initial, source: "restore" }
  ];
  if (!settings.autoSwitch.enabled || settings.locked) return events;

  const mode = settings.autoSwitch.mode;
  if (mode === "timeline-markers" || mode === "music-events") {
    const source = mode === "timeline-markers" ? "timeline" : "music";
    const markers = settings.markers.filter(
      (marker) => marker.source === source && marker.time <= duration
    );
    let previous = initial;
    for (const marker of markers) {
      const eventIndex = events.length;
      const presetId =
        marker.presetId && playlist.includes(marker.presetId)
          ? marker.presetId
          : sequencePreset(playlist, settings, eventIndex, previous);
      if (
        settings.autoSwitch.noImmediateRepeat &&
        presetId === previous &&
        playlist.length > 1 &&
        !marker.presetId
      ) {
        continue;
      }
      events.push({
        index: eventIndex,
        time: marker.time,
        presetId,
        source: source === "music" ? "music-event" : "timeline-marker"
      });
      previous = presetId;
    }
    return events;
  }

  const minimum = Math.max(
    1,
    Math.min(
      settings.autoSwitch.minimumSeconds,
      settings.autoSwitch.maximumSeconds
    )
  );
  const maximum = Math.max(
    minimum,
    settings.autoSwitch.maximumSeconds
  );
  let time = 0;
  let previous = initial;
  while (events.length < 100_000) {
    const interval =
      minimum === maximum
        ? Math.max(1, settings.autoSwitch.intervalSeconds)
        : minimum +
          deterministicUnit(settings.randomSeed ^ 0xa511e9b3, events.length) *
            (maximum - minimum);
    time += interval;
    if (time > duration) break;
    const eventIndex = events.length;
    const presetId = sequencePreset(
      playlist,
      settings,
      eventIndex,
      previous
    );
    events.push({
      index: eventIndex,
      time,
      presetId,
      source: "automatic"
    });
    previous = presetId;
  }
  return events;
}

export function presetEventAt(
  events: readonly PresetSequenceEvent[],
  seconds: number
): PresetSequenceEvent | null {
  let selected: PresetSequenceEvent | null = null;
  for (const event of events) {
    if (event.time > seconds + 1e-6) break;
    selected = event;
  }
  return selected;
}
