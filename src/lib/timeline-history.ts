export type TimelineClipHistoryValue = number | string | null;
export type TimelineClipHistoryPatch = Partial<Record<
  "start_seconds" | "duration_seconds" | "source_start_seconds" | "playback_rate" |
  "volume" | "opacity" | "transition_in" | "transition_out",
  TimelineClipHistoryValue
>>;

export type TimelineClipEdit = {
  clipId: string;
  before: TimelineClipHistoryPatch;
  after: TimelineClipHistoryPatch;
};

export type TimelineHistory = {
  undo: TimelineClipEdit[];
  redo: TimelineClipEdit[];
};

export const MAX_TIMELINE_UNDO_STEPS = 100;

const HISTORY_FIELDS = [
  "start_seconds",
  "duration_seconds",
  "source_start_seconds",
  "playback_rate",
  "volume",
  "opacity",
  "transition_in",
  "transition_out",
] as const;

function historyValue(value: unknown): TimelineClipHistoryValue | undefined {
  if (value === null || value === undefined) return value === undefined ? null : value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") return value;
  return undefined;
}

export function createTimelineClipEdit(
  clipId: string,
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): TimelineClipEdit | null {
  const before: TimelineClipHistoryPatch = {};
  const after: TimelineClipHistoryPatch = {};

  for (const field of HISTORY_FIELDS) {
    if (!(field in patch)) continue;
    const previousValue = historyValue(current[field]);
    const nextValue = historyValue(patch[field]);
    if (previousValue === undefined || nextValue === undefined || Object.is(previousValue, nextValue)) continue;
    before[field] = previousValue;
    after[field] = nextValue;
  }

  if (Object.keys(after).length === 0) return null;
  return { clipId, before, after };
}

export function recordTimelineEdit(
  history: TimelineHistory,
  edit: TimelineClipEdit | null,
): TimelineHistory {
  if (!edit) return history;
  return {
    undo: [...history.undo, edit].slice(-MAX_TIMELINE_UNDO_STEPS),
    redo: [],
  };
}

export function takeTimelineUndo(history: TimelineHistory): { history: TimelineHistory; edit: TimelineClipEdit | null } {
  const edit = history.undo[history.undo.length - 1] ?? null;
  if (!edit) return { history, edit: null };
  return {
    edit,
    history: {
      undo: history.undo.slice(0, -1),
      redo: [...history.redo, edit].slice(-MAX_TIMELINE_UNDO_STEPS),
    },
  };
}

export function takeTimelineRedo(history: TimelineHistory): { history: TimelineHistory; edit: TimelineClipEdit | null } {
  const edit = history.redo[history.redo.length - 1] ?? null;
  if (!edit) return { history, edit: null };
  return {
    edit,
    history: {
      undo: [...history.undo, edit].slice(-MAX_TIMELINE_UNDO_STEPS),
      redo: history.redo.slice(0, -1),
    },
  };
}
