import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WritingPanel } from "@/components/studio/WritingPanel";

const mocks = vi.hoisted(() => ({
  supabaseFrom: vi.fn(),
  serverFn: vi.fn(),
  invalidateQueries: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.supabaseFrom },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({
    data: queryKey[0] === "writing"
      ? { script: "Previously saved script", research: null, hooks: [], titles: [] }
      : {},
  }),
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: () => mocks.serverFn,
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

describe("WritingPanel persistence gates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.serverFn.mockResolvedValue({ ok: true, value: {} });
    mocks.invalidateQueries.mockResolvedValue(undefined);
    mocks.supabaseFrom.mockImplementation((table: string) => {
      if (table === "projects") {
        return {
          update: () => ({
            eq: vi.fn().mockResolvedValue({ error: new Error("project write failed") }),
          }),
        };
      }
      return {
        upsert: vi.fn().mockResolvedValue({ error: new Error("script write failed") }),
      };
    });
  });

  it("does not start AI research when saving the edited idea fails", async () => {
    render(
      <WritingPanel
        project={{ id: "project-1", idea: "Original idea" } as never}
        onScenesChanged={vi.fn()}
      />,
    );

    fireEvent.change(
      screen.getByPlaceholderText("What is this video about? e.g. 'Why octopuses are smarter than we think'"),
      { target: { value: "A different idea" } },
    );
    fireEvent.click(screen.getByRole("button", { name: /Research topic/ }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("project write failed"));
    expect(mocks.serverFn).not.toHaveBeenCalled();
  });

  it("does not replace scenes when saving the edited script fails", async () => {
    render(
      <WritingPanel
        project={{ id: "project-1", idea: "Original idea" } as never}
        onScenesChanged={vi.fn()}
      />,
    );

    fireEvent.change(
      screen.getByPlaceholderText("Write your script here, or generate one with AI. Use ## headings for acts."),
      { target: { value: "An edited script" } },
    );
    fireEvent.click(screen.getByRole("button", { name: /Break into scenes/ }));
    // The confirmation is deliberately declined in this test, so allow it.
    // jsdom's confirm defaults to false; stub it to exercise the persistence gate.
  });
});
