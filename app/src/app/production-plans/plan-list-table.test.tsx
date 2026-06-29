import { describe, expect, it } from "vitest";
import { getPlanListBulkActionState } from "./plan-list-table";

describe("getPlanListBulkActionState", () => {
  it("tentative_confirmed を一括確定対象に含める", () => {
    const state = getPlanListBulkActionState(
      [
        { id: "draft-1", status: "draft" },
        { id: "tentative-1", status: "tentative_confirmed" },
        { id: "confirmed-1", status: "confirmed" },
      ],
      ["tentative-1", "confirmed-1"],
    );

    expect(state.tentativeConfirmedIds).toEqual(["tentative-1"]);
    expect(state.draftIds).toEqual([]);
  });

  it("draft の一括操作は仮確定導線になる", () => {
    const state = getPlanListBulkActionState(
      [
        { id: "draft-1", status: "draft" },
        { id: "tentative-1", status: "tentative_confirmed" },
      ],
      ["draft-1"],
    );

    expect(state.draftIds).toEqual(["draft-1"]);
    expect(state.tentativeConfirmedIds).toEqual([]);
  });
});
