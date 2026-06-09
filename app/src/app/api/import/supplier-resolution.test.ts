import { describe, expect, it } from "vitest";
import { resolveSupplierId } from "@/lib/supplier-resolution";

// Pure CSV 仕入先解決ロジックのユニットテスト。DB には触れない。
// 共有 lib (materials / packaging-materials の両取込ルートが import して使う)。
// マスター名称(Supplier.name)の完全一致で解決し、ヒットしなければ
// 勝手に新規作成せず警告だけ返すことを保証する (CLAUDE.md: 曖昧な手入力名称をキーにしない)。
describe("resolveSupplierId", () => {
  const supplierByName = new Map<string, string>([
    ["丸三紙器", "sup_1"],
    ["北名古屋資材", "sup_2"],
  ]);

  it("resolves an exact name match to its supplier id", () => {
    expect(resolveSupplierId("丸三紙器", supplierByName)).toEqual({ supplierId: "sup_1" });
  });

  it("trims surrounding whitespace before matching", () => {
    expect(resolveSupplierId("  北名古屋資材 ", supplierByName)).toEqual({ supplierId: "sup_2" });
  });

  it("leaves supplierId untouched (undefined) when the column is empty", () => {
    expect(resolveSupplierId("", supplierByName)).toEqual({});
    expect(resolveSupplierId("   ", supplierByName)).toEqual({});
    expect(resolveSupplierId(undefined, supplierByName)).toEqual({});
  });

  it("does NOT auto-create on a typo: nulls the link and warns", () => {
    const result = resolveSupplierId("丸三紙噐", supplierByName); // typo
    expect(result.supplierId).toBeNull();
    expect(result.warning).toContain("丸三紙噐");
  });

  it("is case/whitespace sensitive beyond trimming (partial names do not match)", () => {
    const result = resolveSupplierId("丸三", supplierByName);
    expect(result.supplierId).toBeNull();
    expect(result.warning).toBeTruthy();
  });
});
