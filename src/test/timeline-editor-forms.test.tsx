import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CaptionCueEditor, ClipInspectorForm, TimelineSettingsForm } from "@/components/studio/TimelineEditForms";

const caption = {
  id: "caption-1",
  text: "Original caption",
  start_seconds: 1,
  end_seconds: 2,
  position: "bottom",
};

const clip = {
  id: "clip-1",
  clip_type: "video",
  start_seconds: 1,
  duration_seconds: 5,
  source_start_seconds: 0,
  volume: 1,
};

describe("timeline editing forms", () => {
  it("does not write caption text while typing, and saves text/timing in one patch", async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    render(<CaptionCueEditor caption={caption} selected={false} onSelect={vi.fn()} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText("Caption text"), { target: { value: "Edited caption" } });
    fireEvent.change(screen.getByLabelText("Start (seconds)"), { target: { value: "1.25" } });
    fireEvent.change(screen.getByLabelText("End (seconds)"), { target: { value: "2.75" } });

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Unsaved changes");

    fireEvent.click(screen.getByRole("button", { name: "Save caption" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("caption-1", {
      text: "Edited caption",
      start_seconds: 1.25,
      end_seconds: 2.75,
    }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save caption" })).toBeDisabled());
  });

  it("saves all clip timing and level drafts in one update, not one request per keystroke", async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    render(<ClipInspectorForm clip={clip} onSave={onSave} onDelete={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Start (seconds)"), { target: { value: "3.25" } });
    fireEvent.change(screen.getByLabelText("Duration (seconds)"), { target: { value: "6.5" } });
    fireEvent.change(screen.getByLabelText("Source in (seconds)"), { target: { value: "0.5" } });
    fireEvent.change(screen.getByLabelText("Volume"), { target: { value: "0.75" } });

    expect(onSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Save clip changes" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("clip-1", {
      start_seconds: 3.25,
      duration_seconds: 6.5,
      source_start_seconds: 0.5,
      volume: 0.75,
    }));
  });

  it("does not persist timeline settings until save and submits both values together", async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    render(<TimelineSettingsForm settings={{ fps: 30, grid_seconds: 1 }} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText("FPS"), { target: { value: "60" } });
    fireEvent.change(screen.getByLabelText("Grid (seconds)"), { target: { value: "0.5" } });
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ fps: 60, grid_seconds: 0.5 }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save settings" })).toBeDisabled());
  });

  it("keeps timeline settings draft visible if save fails", async () => {
    const onSave = vi.fn().mockResolvedValue(false);
    render(<TimelineSettingsForm settings={{ fps: 30, grid_seconds: 1 }} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText("Grid (seconds)"), { target: { value: "2.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(screen.getByLabelText("Grid (seconds)")).toHaveValue(2.5);
    expect(screen.getByRole("status")).toHaveTextContent("Unsaved changes");
  });

  it("keeps unsaved clip values available when the save fails", async () => {
    const onSave = vi.fn().mockResolvedValue(false);
    render(<ClipInspectorForm clip={clip} onSave={onSave} onDelete={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Start (seconds)"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Save clip changes" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(screen.getByLabelText("Start (seconds)")).toHaveValue(4);
    expect(screen.getByRole("status")).toHaveTextContent("Unsaved changes");
  });
});
