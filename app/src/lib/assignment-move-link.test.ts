import { describe, expect, it } from "vitest";
import { computeMoveLinks } from "./assignment-move-link";

describe("computeMoveLinks", () => {
  it("単一従業員が複数部屋を移動: 各割当の直前 planId を返す（先頭は null）", () => {
    // emp1: room1(plan-a) 9:00-10:00 → room2(plan-b) 10:00-13:00 → room3(plan-c) 13:00-15:00
    const links = computeMoveLinks([
      { employeeId: "emp1", planId: "plan-a", startTime: "09:00" },
      { employeeId: "emp1", planId: "plan-b", startTime: "10:00" },
      { employeeId: "emp1", planId: "plan-c", startTime: "13:00" },
    ]);
    expect(links.get("emp1", "plan-a")).toBeNull();
    expect(links.get("emp1", "plan-b")).toBe("plan-a");
    expect(links.get("emp1", "plan-c")).toBe("plan-b");
  });

  it("入力順に依存せず開始時刻順で直前を決める", () => {
    const links = computeMoveLinks([
      { employeeId: "emp1", planId: "plan-c", startTime: "13:00" },
      { employeeId: "emp1", planId: "plan-a", startTime: "09:00" },
      { employeeId: "emp1", planId: "plan-b", startTime: "10:00" },
    ]);
    expect(links.get("emp1", "plan-a")).toBeNull();
    expect(links.get("emp1", "plan-b")).toBe("plan-a");
    expect(links.get("emp1", "plan-c")).toBe("plan-b");
  });

  it("従業員が複数いる場合、それぞれ独立に直前リンクを計算する", () => {
    const links = computeMoveLinks([
      // emp1: room1 → room2
      { employeeId: "emp1", planId: "plan-a", startTime: "09:00" },
      { employeeId: "emp1", planId: "plan-b", startTime: "10:00" },
      // emp2: room2 → room1（順序は逆）
      { employeeId: "emp2", planId: "plan-b", startTime: "09:00" },
      { employeeId: "emp2", planId: "plan-a", startTime: "11:00" },
    ]);
    expect(links.get("emp1", "plan-a")).toBeNull();
    expect(links.get("emp1", "plan-b")).toBe("plan-a");
    expect(links.get("emp2", "plan-b")).toBeNull();
    expect(links.get("emp2", "plan-a")).toBe("plan-b");
  });

  it("単一割当のみなら直前は null", () => {
    const links = computeMoveLinks([{ employeeId: "emp1", planId: "plan-a", startTime: "09:00" }]);
    expect(links.get("emp1", "plan-a")).toBeNull();
  });

  it("未知の (従業員, planId) は null", () => {
    const links = computeMoveLinks([{ employeeId: "emp1", planId: "plan-a", startTime: "09:00" }]);
    expect(links.get("emp1", "plan-z")).toBeNull();
    expect(links.get("emp9", "plan-a")).toBeNull();
  });

  it("同一 planId が連続セグメントに分かれても継続扱い（直前=null のまま、移動にしない）", () => {
    // emp1 が plan-a を 9:00-10:00 と 11:00-12:00 の2セグメントで作業し、
    // 間に plan-b（10:00-11:00）を挟む。
    const links = computeMoveLinks([
      { employeeId: "emp1", planId: "plan-a", startTime: "09:00" },
      { employeeId: "emp1", planId: "plan-b", startTime: "10:00" },
      { employeeId: "emp1", planId: "plan-a", startTime: "11:00" },
    ]);
    // plan-a の直前リンクは最初の出現で確定（null）。後続の plan-a セグメントでは上書きしない。
    expect(links.get("emp1", "plan-a")).toBeNull();
    expect(links.get("emp1", "plan-b")).toBe("plan-a");
  });

  it("開始時刻が同値なら planId 昇順で決定的に並べる", () => {
    const links = computeMoveLinks([
      { employeeId: "emp1", planId: "plan-b", startTime: "09:00" },
      { employeeId: "emp1", planId: "plan-a", startTime: "09:00" },
    ]);
    // タイは planId 昇順 → plan-a が先頭(null)、plan-b の直前は plan-a
    expect(links.get("emp1", "plan-a")).toBeNull();
    expect(links.get("emp1", "plan-b")).toBe("plan-a");
  });
});
