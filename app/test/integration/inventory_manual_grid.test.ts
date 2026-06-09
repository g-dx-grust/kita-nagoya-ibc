import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildEditableGrid, type EditableGridMovement } from "@/lib/inventory-editable-grid";
import { cleanupAll } from "../helpers/cleanup";
import { createTestMaterial } from "../helpers/factories";
import { disconnectTestPrisma, getTestPrisma } from "../helpers/prisma";

async function callSave(body: unknown) {
  const { PUT } = await import("@/app/api/inventory/manual-grid/route");
  const res = await PUT(
    new Request("http://test.local/api/inventory/manual-grid", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return res;
}

function classify(sourceId: string | null): { gridKind: any; gridMonth: string | null } {
  if (!sourceId?.startsWith("grid:")) return { gridKind: null, gridMonth: null };
  const p = sourceId.split(":");
  if (p[3] === "opening") return { gridKind: "opening", gridMonth: p[4] ?? null };
  if (p[4] === "inbound") return { gridKind: "inbound", gridMonth: null };
  if (p[4] === "usage") return { gridKind: "usage", gridMonth: null };
  return { gridKind: null, gridMonth: null };
}

describe("manual-grid batch save (Excelライク セル編集)", () => {
  const prisma = getTestPrisma();

  beforeAll(async () => {
    await cleanupAll(prisma);
  });
  beforeEach(async () => {
    await cleanupAll(prisma);
  });
  afterAll(async () => {
    await cleanupAll(prisma);
    await disconnectTestPrisma();
  });

  it("入荷・使用量・期首・期限を upsert し、grid から読み戻せる", async () => {
    const material = await createTestMaterial(prisma);
    const res = await callSave({
      itemType: "raw_material",
      month: "2026-04",
      openings: [{ itemId: material.id, value: 50 }],
      cells: [
        { itemId: material.id, date: "2026-04-05", inbound: 30, usage: 0, expiry: "2026-10-01", shipping: "2026-09-20" },
        { itemId: material.id, date: "2026-04-06", inbound: 0, usage: 8 },
      ],
    });
    expect(res.status).toBe(200);

    const rows = await prisma.stockMovement.findMany({
      where: { itemType: "raw_material", itemId: material.id },
      orderBy: { effectiveDate: "asc" },
    });
    expect(rows).toHaveLength(3);

    const opening = rows.find((r) => r.movementType === "opening")!;
    expect(opening.quantity).toBe(50);
    expect(opening.effectiveDate.toISOString().slice(0, 10)).toBe("2026-03-31");
    expect(opening.sourceId).toBe(`grid:raw_material:${material.id}:opening:2026-04`);

    const inbound = rows.find((r) => r.movementType === "inbound")!;
    expect(inbound.quantity).toBe(30);
    expect(inbound.expiryDate?.toISOString().slice(0, 10)).toBe("2026-10-01");
    expect(inbound.shippingDeadline?.toISOString().slice(0, 10)).toBe("2026-09-20");

    const usage = rows.find((r) => r.movementType === "shipment_out")!;
    expect(usage.quantity).toBe(-8); // 使用量は負で保存

    // 編集グリッドに読み戻すと初期値として復元される
    const movements: EditableGridMovement[] = rows.map((r) => ({
      itemId: r.itemId,
      effectiveDate: r.effectiveDate.toISOString().slice(0, 10),
      quantity: r.quantity,
      ...classify(r.sourceId),
      expiryDate: r.expiryDate ? r.expiryDate.toISOString().slice(0, 10) : null,
      shippingDeadline: r.shippingDeadline ? r.shippingDeadline.toISOString().slice(0, 10) : null,
    }));
    const grid = buildEditableGrid({
      month: "2026-04",
      items: [{ id: material.id, code: material.materialCode, name: material.name, unit: material.unit }],
      movements,
    });
    const row = grid.rows[0];
    expect(row.gridOpening).toBe(50);
    const d5 = row.days.find((d) => d.date === "2026-04-05")!;
    expect(d5.gridInbound).toBe(30);
    expect(d5.gridExpiry).toBe("2026-10-01");
    const d6 = row.days.find((d) => d.date === "2026-04-06")!;
    expect(d6.gridUsage).toBe(8);

    // 監査ログが残る
    const audit = await prisma.auditLog.findMany({ where: { action: "manual_grid_save" } });
    expect(audit).toHaveLength(1);
  });

  it("再保存で値を更新し、0/空にすると当該movementを削除する", async () => {
    const material = await createTestMaterial(prisma);
    await callSave({
      itemType: "raw_material",
      month: "2026-04",
      openings: [{ itemId: material.id, value: 50 }],
      cells: [{ itemId: material.id, date: "2026-04-05", inbound: 30, usage: 5 }],
    });

    // 入荷を 40 に更新、使用量を 0(削除)、期首を 0(削除)
    await callSave({
      itemType: "raw_material",
      month: "2026-04",
      openings: [{ itemId: material.id, value: 0 }],
      cells: [{ itemId: material.id, date: "2026-04-05", inbound: 40, usage: 0 }],
    });

    const rows = await prisma.stockMovement.findMany({
      where: { itemType: "raw_material", itemId: material.id },
    });
    // opening削除・usage削除 → inbound 1件のみ、数量は上書き(40)で重複しない
    expect(rows).toHaveLength(1);
    expect(rows[0].movementType).toBe("inbound");
    expect(rows[0].quantity).toBe(40);
  });

  it("期限だけ入力した日は数量0の入荷movementを作って期限を保持する", async () => {
    const material = await createTestMaterial(prisma);
    await callSave({
      itemType: "raw_material",
      month: "2026-04",
      cells: [{ itemId: material.id, date: "2026-04-10", inbound: 0, usage: 0, expiry: "2026-12-31" }],
    });
    const rows = await prisma.stockMovement.findMany({
      where: { itemType: "raw_material", itemId: material.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].movementType).toBe("inbound");
    expect(rows[0].quantity).toBe(0);
    expect(rows[0].expiryDate?.toISOString().slice(0, 10)).toBe("2026-12-31");
  });
});
