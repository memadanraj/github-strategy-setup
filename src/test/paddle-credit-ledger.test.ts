import { describe, expect, it, vi } from "vitest";
import { addCredits } from "@/lib/paddle.server";

vi.mock("@tanstack/react-start/server-only", () => ({}));

describe("atomic Paddle credit-ledger wrapper", () => {
  it("uses the database idempotency RPC instead of writing the profile balance directly", async () => {
    const db = { rpc: vi.fn().mockResolvedValue({ data: 1500, error: null }) };
    await addCredits(db, "user-1", 500, "purchase", "Paddle credit pack", "paddle:transaction:txn-1:pack");
    expect(db.rpc).toHaveBeenCalledTimes(1);
    expect(db.rpc).toHaveBeenCalledWith("apply_credit_transaction", {
      _user_id: "user-1",
      _amount: 500,
      _kind: "purchase",
      _description: "Paddle credit pack",
      _idempotency_key: "paddle:transaction:txn-1:pack",
    });
  });

  it.each([0, -1, 1.25, 1000001])("rejects invalid grant amount %s before calling the database", async (amount) => {
    const db = { rpc: vi.fn() };
    await expect(addCredits(db, "user-1", amount, "purchase", "test", "paddle:txn-1"))
      .rejects.toThrow("Credit grant amount is invalid.");
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("rejects blank or overlong idempotency keys before calling the database", async () => {
    const db = { rpc: vi.fn() };
    await expect(addCredits(db, "user-1", 100, "purchase", "test", "   "))
      .rejects.toThrow("Credit grant idempotency key is invalid.");
    await expect(addCredits(db, "user-1", 100, "purchase", "test", "x".repeat(201)))
      .rejects.toThrow("Credit grant idempotency key is invalid.");
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("does not mask a failed ledger RPC as a successful grant", async () => {
    const db = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "database unavailable" } }) };
    await expect(addCredits(db, "user-1", 100, "purchase", "test", "paddle:txn-2"))
      .rejects.toThrow("Could not apply the credit ledger transaction.");
  });
});
