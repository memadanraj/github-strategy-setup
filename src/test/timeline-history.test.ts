import { describe, expect, it } from "vitest";
import {
  createTimelineClipEdit,
  MAX_TIMELINE_UNDO_STEPS,
  recordTimelineEdit,
  takeTimelineRedo,
  takeTimelineUndo,
  type TimelineHistory,
} from "@/lib/timeline-history";

const emptyHistory: TimelineHistory = { undo: [], redo: [] };

describe("timeline clip edit history", () => {
  it("records only changed supported fields", () => {
    const edit = createTimelineClipEdit("clip-1", {
      start_seconds: 1,
      duration_seconds: 4,
      volume: 1,
    }, {
      start_seconds: 3,
      duration_seconds: 4,
      volume: 0.5,
      project_id: "other-project",
    });
    expect(edit).toEqual({
      clipId: "clip-1",
      before: { start_seconds: 1, volume: 1 },
      after: { start_seconds: 3, volume: 0.5 },
    });
  });

  it("ignores unsupported values and no-op patches", () => {
    expect(createTimelineClipEdit("clip-1", { start_seconds: 1 }, { start_seconds: 1 })).toBeNull();
    expect(createTimelineClipEdit("clip-1", { start_seconds: 1 }, { start_seconds: Number.NaN })).toBeNull();
  });

  it("undoes in last-in-first-out order and moves edits to redo", () => {
    const first = createTimelineClipEdit("clip-1", { start_seconds: 1 }, { start_seconds: 2 });
    const second = createTimelineClipEdit("clip-1", { volume: 1 }, { volume: 0.5 });
    const history = recordTimelineEdit(recordTimelineEdit(emptyHistory, first), second);
    const undoSecond = takeTimelineUndo(history);
    expect(undoSecond.edit).toEqual(second);
    expect(undoSecond.history.undo).toEqual([first]);
    expect(undoSecond.history.redo).toEqual([second]);
    const undoFirst = takeTimelineUndo(undoSecond.history);
    expect(undoFirst.edit).toEqual(first);
    expect(undoFirst.history.undo).toEqual([]);
    expect(undoFirst.history.redo).toEqual([second, first]);
  });

  it("redo restores undone edit order", () => {
    const edit = createTimelineClipEdit("clip-1", { start_seconds: 1 }, { start_seconds: 2 });
    const withEdit = recordTimelineEdit(emptyHistory, edit);
    const undone = takeTimelineUndo(withEdit);
    const redone = takeTimelineRedo(undone.history);
    expect(redone.edit).toEqual(edit);
    expect(redone.history.undo).toEqual([edit]);
    expect(redone.history.redo).toEqual([]);
  });

  it("clears redo history after a new edit and bounds history length", () => {
    const edit = createTimelineClipEdit("clip-1", { start_seconds: 1 }, { start_seconds: 2 });
    const withEdit = recordTimelineEdit(emptyHistory, edit);
    const undone = takeTimelineUndo(withEdit);
    expect(undone.history.redo).toHaveLength(1);
    const branched = recordTimelineEdit(undone.history, createTimelineClipEdit("clip-2", { volume: 1 }, { volume: 0.5 }));
    expect(branched.redo).toEqual([]);

    let longHistory = emptyHistory;
    for (let index = 0; index < MAX_TIMELINE_UNDO_STEPS + 10; index += 1) {
      longHistory = recordTimelineEdit(longHistory, createTimelineClipEdit("clip-1", { start_seconds: index }, { start_seconds: index + 1 }));
    }
    expect(longHistory.undo).toHaveLength(MAX_TIMELINE_UNDO_STEPS);
  });
});
