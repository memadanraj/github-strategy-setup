import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NewProjectDialog } from "@/components/studio/NewProjectDialog";

const mocks = vi.hoisted(() => ({
  authGetUser: vi.fn(),
  supabaseFrom: vi.fn(),
  insert: vi.fn(),
  invalidateQueries: vi.fn(),
  navigate: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: mocks.authGetUser },
    from: mocks.supabaseFrom,
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

// Keep this test focused on the form's persistence/error behavior rather than
// Radix portal and pointer-event behavior in jsdom.
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

describe("NewProjectDialog failure handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invalidateQueries.mockResolvedValue(undefined);
    mocks.navigate.mockResolvedValue(undefined);
    mocks.supabaseFrom.mockReturnValue({ insert: mocks.insert });
  });

  it("recovers from a rejected auth request and re-enables submit", async () => {
    mocks.authGetUser.mockRejectedValueOnce(new Error("network failure"));
    render(<NewProjectDialog><button>Open dialog</button></NewProjectDialog>);

    fireEvent.click(screen.getByRole("button", { name: "Create project" }));

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith(
        "Could not create the project. Check your connection and try again.",
      );
    });
    expect(screen.getByRole("button", { name: "Create project" })).toBeEnabled();
    expect(mocks.supabaseFrom).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("does not navigate or report success when the project insert fails", async () => {
    mocks.authGetUser.mockResolvedValueOnce({ data: { user: { id: "user-1" } }, error: null });
    mocks.insert.mockReturnValue({
      select: () => ({
        single: () => Promise.resolve({ data: null, error: { message: "insert denied" } }),
      }),
    });
    render(<NewProjectDialog><button>Open dialog</button></NewProjectDialog>);

    fireEvent.click(screen.getByRole("button", { name: "Create project" }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("insert denied"));
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Create project" })).toBeEnabled();
  });
});
