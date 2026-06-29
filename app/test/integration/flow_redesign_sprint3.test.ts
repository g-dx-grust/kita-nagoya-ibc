import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { cleanupAll } from "../helpers/cleanup";
import {
  createTestMaterial,
  createTestProductionPlan,
  createTestProduct,
  createTestPurchaseOrder,
  createTestStockMovement,
  createTestWorkArea,
} from "../helpers/factories";
import { disconnectTestPrisma, getTestPrisma } from "../helpers/prisma";

describe("Flow redesign Sprint 3 tentative gate", () => {
  const prisma = getTestPrisma();

  beforeEach(async () => {
    await cleanupAll(prisma);
  });

  afterAll(async () => {
    await cleanupAll(prisma);
    await disconnectTestPrisma();
  });

  it("単票 tentative-confirm は入荷予定で裏付けできる draft を仮確定にする", async () => {
    const { plan, material } = await seedBomPlan({ plannedQuantity: 100 });
    await createTestPurchaseOrder(prisma, {
      itemType: "raw_material",
      itemId: material.id,
      quantity: 100,
      status: "ordered_unconfirmed",
      expectedArrivalDate: new Date("2026-07-09T00:00:00.000Z"),
    });

    const response = await tentativeConfirm(plan.id);
    const json = await response.json();
    const updated = await prisma.productionPlan.findUniqueOrThrow({ where: { id: plan.id } });

    expect(response.status).toBe(200);
    expect(json.backing.canTentativeConfirm).toBe(true);
    expect(updated.status).toBe("tentative_confirmed");
  });

  it("hard_shortage の tentative-confirm は失敗する", async () => {
    const { plan } = await seedBomPlan({ plannedQuantity: 100 });

    const response = await tentativeConfirm(plan.id);
    const json = await response.json();
    const updated = await prisma.productionPlan.findUniqueOrThrow({ where: { id: plan.id } });

    expect(response.status).toBe(400);
    expect(json.error).toBe("plan_not_tentative_confirmable");
    expect(json.details.blockingRequirements[0]).toMatchObject({ shortageType: "hard_shortage" });
    expect(updated.status).toBe("draft");
  });

  it("requirement 0件の tentative-confirm は失敗する", async () => {
    const workArea = await createTestWorkArea(prisma);
    const product = await createTestProduct(prisma, { defaultWorkAreaId: workArea.id });
    const plan = await createTestProductionPlan(prisma, {
      productId: product.id,
      workAreaId: workArea.id,
      date: new Date("2026-07-10T00:00:00.000Z"),
      plannedQuantity: 10,
      status: "draft",
    });
    const { recalculateProductionPlan } = await import("@/lib/plan-engine");
    await recalculateProductionPlan(plan.id, { refreshMaterialForecast: false });

    const response = await tentativeConfirm(plan.id);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe("plan_not_tentative_confirmable");
    expect(json.details.blockingRequirements[0].reason).toBe("BOM未登録または所要量未計算です。");
  });

  it("tentative_confirmed は canConfirm=true なら confirmed に進む", async () => {
    const { plan, material } = await seedBomPlan({
      plannedQuantity: 80,
      status: "tentative_confirmed",
      stockQuantity: 100,
    });

    const response = await confirmPlan(plan.id);
    const json = await response.json();
    const updated = await prisma.productionPlan.findUniqueOrThrow({ where: { id: plan.id } });

    expect(response.status).toBe(200);
    expect(json.backing.canConfirm).toBe(true);
    expect(updated.status).toBe("confirmed");
    await expect(plannedReserveCount(material.id)).resolves.toBe(1);
  });

  it("unconfirmed_dependency が残る予定は confirmed に進めない", async () => {
    const { plan, material } = await seedBomPlan({
      plannedQuantity: 100,
      status: "tentative_confirmed",
    });
    await createTestPurchaseOrder(prisma, {
      itemType: "raw_material",
      itemId: material.id,
      quantity: 100,
      status: "ordered_unconfirmed",
      expectedArrivalDate: new Date("2026-07-09T00:00:00.000Z"),
    });

    const response = await confirmPlan(plan.id);
    const json = await response.json();
    const updated = await prisma.productionPlan.findUniqueOrThrow({ where: { id: plan.id } });

    expect(response.status).toBe(400);
    expect(json.error).toBe("plan_not_confirmable");
    expect(json.details.blockingRequirements[0]).toMatchObject({ shortageType: "unconfirmed_dependency" });
    expect(updated.status).toBe("tentative_confirmed");
  });

  it("below_safety は confirmed を妨げない", async () => {
    const { plan } = await seedBomPlan({
      plannedQuantity: 80,
      status: "tentative_confirmed",
      stockQuantity: 100,
      safetyStockQuantity: 50,
    });

    const response = await confirmPlan(plan.id);
    const json = await response.json();
    const updated = await prisma.productionPlan.findUniqueOrThrow({ where: { id: plan.id } });

    expect(response.status).toBe(200);
    expect(json.backing.canConfirm).toBe(true);
    expect(updated.status).toBe("confirmed");
  });

  it("bulk tentative-confirm は eligible のみ成功し、不適格行を理由付きで返す", async () => {
    const eligible = await seedBomPlan({ plannedQuantity: 100, date: "2026-07-10" });
    await createTestPurchaseOrder(prisma, {
      itemType: "raw_material",
      itemId: eligible.material.id,
      quantity: 100,
      status: "ordered_unconfirmed",
      expectedArrivalDate: new Date("2026-07-09T00:00:00.000Z"),
    });
    const ineligible = await seedBomPlan({ plannedQuantity: 100, date: "2026-07-11" });

    const { POST } = await import("@/app/api/production-plans/bulk-tentative-confirm/route");
    const response = await POST(jsonRequest("/api/production-plans/bulk-tentative-confirm", {
      ids: [eligible.plan.id, ineligible.plan.id],
    }));
    const json = await response.json();
    const rows = await prisma.productionPlan.findMany({
      where: { id: { in: [eligible.plan.id, ineligible.plan.id] } },
      select: { id: true, status: true },
    });
    const statusById = new Map(rows.map((row) => [row.id, row.status]));

    expect(response.status).toBe(200);
    expect(json.tentativeConfirmed).toBe(1);
    expect(json.skipped).toBe(1);
    expect(statusById.get(eligible.plan.id)).toBe("tentative_confirmed");
    expect(statusById.get(ineligible.plan.id)).toBe("draft");
    expect(json.results.find((row: { id: string }) => row.id === ineligible.plan.id)).toMatchObject({
      status: "skipped",
      reason: "plan_not_tentative_confirmable",
    });
  });

  it("bulk confirm は eligible のみ成功し、不適格行を理由付きで返す", async () => {
    const eligible = await seedBomPlan({
      plannedQuantity: 80,
      status: "tentative_confirmed",
      stockQuantity: 100,
      date: "2026-07-10",
    });
    const ineligible = await seedBomPlan({
      plannedQuantity: 100,
      status: "tentative_confirmed",
      date: "2026-07-11",
    });
    await createTestPurchaseOrder(prisma, {
      itemType: "raw_material",
      itemId: ineligible.material.id,
      quantity: 100,
      status: "ordered_unconfirmed",
      expectedArrivalDate: new Date("2026-07-10T00:00:00.000Z"),
    });

    const { POST } = await import("@/app/api/production-plans/bulk-confirm/route");
    const response = await POST(jsonRequest("/api/production-plans/bulk-confirm", {
      ids: [eligible.plan.id, ineligible.plan.id],
    }));
    const json = await response.json();
    const rows = await prisma.productionPlan.findMany({
      where: { id: { in: [eligible.plan.id, ineligible.plan.id] } },
      select: { id: true, status: true },
    });
    const statusById = new Map(rows.map((row) => [row.id, row.status]));

    expect(response.status).toBe(200);
    expect(json.confirmed).toBe(1);
    expect(json.skipped).toBe(1);
    expect(statusById.get(eligible.plan.id)).toBe("confirmed");
    expect(statusById.get(ineligible.plan.id)).toBe("tentative_confirmed");
    expect(json.results.find((row: { id: string }) => row.id === ineligible.plan.id)).toMatchObject({
      status: "skipped",
      reason: "plan_not_confirmable",
    });
  });

  it("PO expectedArrivalDate 入力後に draft が tentative_confirmed へ自動昇格する", async () => {
    const { plan, material } = await seedBomPlan({ plannedQuantity: 100 });
    const po = await createTestPurchaseOrder(prisma, {
      itemType: "raw_material",
      itemId: material.id,
      quantity: 100,
      status: "ordered_unconfirmed",
      expectedArrivalDate: null,
    });

    const response = await updatePurchaseOrder(po.id, { expectedArrivalDate: "2026-07-09" });
    const updated = await prisma.productionPlan.findUniqueOrThrow({ where: { id: plan.id } });
    const audit = await prisma.auditLog.findFirst({ where: { action: "auto_tentative_confirm", entityId: plan.id } });

    expect(response.status).toBe(200);
    expect(updated.status).toBe("tentative_confirmed");
    expect(audit).toBeTruthy();
  });

  it("PO expectedArrivalDate 後ろ倒しで tentative_confirmed が draft へ自動降格する", async () => {
    const { plan, material } = await seedBomPlan({
      plannedQuantity: 100,
      status: "tentative_confirmed",
    });
    const po = await createTestPurchaseOrder(prisma, {
      itemType: "raw_material",
      itemId: material.id,
      quantity: 100,
      status: "ordered_unconfirmed",
      expectedArrivalDate: new Date("2026-07-09T00:00:00.000Z"),
    });

    const response = await updatePurchaseOrder(po.id, { expectedArrivalDate: "2026-07-20" });
    const updated = await prisma.productionPlan.findUniqueOrThrow({ where: { id: plan.id } });
    const audit = await prisma.auditLog.findFirst({ where: { action: "auto_demote_to_draft", entityId: plan.id } });

    expect(response.status).toBe(200);
    expect(updated.status).toBe("draft");
    expect(audit?.afterJson).toContain("tentative_confirm_gate_failed");
  });

  it("PO取消で tentative_confirmed が draft へ自動降格する", async () => {
    const { plan, material } = await seedBomPlan({
      plannedQuantity: 100,
      status: "tentative_confirmed",
    });
    const po = await createTestPurchaseOrder(prisma, {
      itemType: "raw_material",
      itemId: material.id,
      quantity: 100,
      status: "ordered_unconfirmed",
      expectedArrivalDate: new Date("2026-07-09T00:00:00.000Z"),
    });

    const response = await updatePurchaseOrder(po.id, { status: "cancelled" });
    const updated = await prisma.productionPlan.findUniqueOrThrow({ where: { id: plan.id } });

    expect(response.status).toBe(200);
    expect(updated.status).toBe("draft");
  });

  it("confirmed/completed/cancelled は自動昇格・降格しない", async () => {
    const workArea = await createTestWorkArea(prisma);
    const product = await createTestProduct(prisma, {
      defaultWorkAreaId: workArea.id,
      unit: "袋",
    });
    await prisma.productionCapacity.create({
      data: {
        productId: product.id,
        workAreaId: workArea.id,
        unitsPerPersonHour: 100,
        standardPeople: 1,
      },
    });
    const material = await createTestMaterial(prisma, { unit: "kg" });
    await prisma.productBomItem.create({
      data: {
        productId: product.id,
        itemType: "raw_material",
        itemId: material.id,
        quantityPerUnit: 1,
        unit: "kg",
      },
    });
    const confirmed = await createPlanAndRequirements(product.id, workArea.id, "confirmed", "2026-07-10");
    const completed = await createPlanAndRequirements(product.id, workArea.id, "completed", "2026-07-11");
    const cancelled = await createPlanAndRequirements(product.id, workArea.id, "cancelled", "2026-07-12");
    const po = await createTestPurchaseOrder(prisma, {
      itemType: "raw_material",
      itemId: material.id,
      quantity: 1000,
      status: "ordered_unconfirmed",
      expectedArrivalDate: null,
    });

    const response = await updatePurchaseOrder(po.id, { expectedArrivalDate: "2026-07-09" });
    const rows = await prisma.productionPlan.findMany({
      where: { id: { in: [confirmed.id, completed.id, cancelled.id] } },
      select: { id: true, status: true },
    });
    const statusById = new Map(rows.map((row) => [row.id, row.status]));

    expect(response.status).toBe(200);
    expect(statusById.get(confirmed.id)).toBe("confirmed");
    expect(statusById.get(completed.id)).toBe("completed");
    expect(statusById.get(cancelled.id)).toBe("cancelled");
  });

  it("既存 draft→confirmed は canConfirm=true の場合だけ通る", async () => {
    const confirmable = await seedBomPlan({
      plannedQuantity: 80,
      stockQuantity: 100,
      date: "2026-07-10",
    });
    const blocked = await seedBomPlan({ plannedQuantity: 100, date: "2026-07-11" });

    const okResponse = await confirmPlan(confirmable.plan.id);
    const blockedResponse = await confirmPlan(blocked.plan.id);
    const okPlan = await prisma.productionPlan.findUniqueOrThrow({ where: { id: confirmable.plan.id } });
    const blockedPlan = await prisma.productionPlan.findUniqueOrThrow({ where: { id: blocked.plan.id } });

    expect(okResponse.status).toBe(200);
    expect(okPlan.status).toBe("confirmed");
    expect(blockedResponse.status).toBe(400);
    expect(blockedPlan.status).toBe("draft");
  });

  it("汎用 PUT では status=confirmed を送っても確定できない", async () => {
    const { plan } = await seedBomPlan({
      plannedQuantity: 80,
      stockQuantity: 100,
      date: "2026-07-10",
    });

    const response = await updateProductionPlan(plan.id, { status: "confirmed" });
    const json = await response.json();
    const updated = await prisma.productionPlan.findUniqueOrThrow({ where: { id: plan.id } });

    expect(response.status).toBe(400);
    expect(json.error).toBe("production_plan_status_transition_requires_dedicated_api");
    expect(updated.status).toBe("draft");
  });

  it("汎用 PUT では status=tentative_confirmed を送っても仮確定できない", async () => {
    const { plan, material } = await seedBomPlan({
      plannedQuantity: 100,
      date: "2026-07-10",
    });
    await createTestPurchaseOrder(prisma, {
      itemType: "raw_material",
      itemId: material.id,
      quantity: 100,
      status: "ordered_unconfirmed",
      expectedArrivalDate: new Date("2026-07-09T00:00:00.000Z"),
    });

    const response = await updateProductionPlan(plan.id, { status: "tentative_confirmed" });
    const json = await response.json();
    const updated = await prisma.productionPlan.findUniqueOrThrow({ where: { id: plan.id } });

    expect(response.status).toBe(400);
    expect(json.error).toBe("production_plan_status_transition_requires_dedicated_api");
    expect(updated.status).toBe("draft");
  });

  it("汎用 PUT の通常編集は壊れない", async () => {
    const { plan } = await seedBomPlan({
      plannedQuantity: 80,
      stockQuantity: 100,
      date: "2026-07-10",
    });

    const response = await updateProductionPlan(plan.id, {
      plannedQuantity: 70,
      note: "Sprint3.5 通常編集",
    });
    const json = await response.json();
    const updated = await prisma.productionPlan.findUniqueOrThrow({ where: { id: plan.id } });

    expect(response.status).toBe(200);
    expect(json.plan.plannedQuantity).toBe(70);
    expect(updated.status).toBe("draft");
    expect(updated.note).toBe("Sprint3.5 通常編集");
  });

  it("月中の confirmed inbound が後続 plan の確定可否に反映される", async () => {
    const { plan, material } = await seedBomPlan({
      plannedQuantity: 100,
      status: "tentative_confirmed",
      date: "2026-07-10",
    });
    await createTestStockMovement(prisma, {
      itemType: "raw_material",
      itemId: material.id,
      quantity: 100,
      movementType: "INBOUND_CONFIRMED",
      movementDate: new Date("2026-07-05T00:00:00.000Z"),
      status: "CONFIRMED",
      sourceType: "purchase_order",
      sourceId: `received-${material.id}`,
    });

    const response = await confirmPlan(plan.id);
    const json = await response.json();
    const updated = await prisma.productionPlan.findUniqueOrThrow({ where: { id: plan.id } });

    expect(response.status).toBe(200);
    expect(json.backing.canConfirm).toBe(true);
    expect(updated.status).toBe("confirmed");
  });

  it("月中の actual consumption と adjustment が後続 plan の確定可否に反映される", async () => {
    const { plan, material } = await seedBomPlan({
      plannedQuantity: 100,
      status: "tentative_confirmed",
      stockQuantity: 120,
      date: "2026-07-10",
    });
    await createTestStockMovement(prisma, {
      itemType: "raw_material",
      itemId: material.id,
      quantity: -20,
      movementType: "ACTUAL_MATERIAL_USE",
      movementDate: new Date("2026-07-04T00:00:00.000Z"),
      status: "CONFIRMED",
      sourceType: "daily_report",
      sourceId: `actual-${material.id}`,
    });
    await createTestStockMovement(prisma, {
      itemType: "raw_material",
      itemId: material.id,
      quantity: -30,
      movementType: "adjustment",
      movementDate: new Date("2026-07-05T00:00:00.000Z"),
      status: "CONFIRMED",
      sourceType: "manual_inventory",
      sourceId: `adjustment-${material.id}`,
    });

    const response = await confirmPlan(plan.id);
    const json = await response.json();
    const updated = await prisma.productionPlan.findUniqueOrThrow({ where: { id: plan.id } });

    expect(response.status).toBe(400);
    expect(json.error).toBe("plan_not_confirmable");
    expect(json.details.blockingRequirements[0]).toMatchObject({ shortageType: "hard_shortage" });
    expect(updated.status).toBe("tentative_confirmed");
  });

  it("completed plan は予定 requirement として二重に引かず、実績 movement のみ反映する", async () => {
    const workArea = await createTestWorkArea(prisma);
    const product = await createTestProduct(prisma, {
      defaultWorkAreaId: workArea.id,
      unit: "袋",
    });
    await prisma.productionCapacity.create({
      data: {
        productId: product.id,
        workAreaId: workArea.id,
        unitsPerPersonHour: 100,
        standardPeople: 1,
      },
    });
    const material = await createTestMaterial(prisma, { unit: "kg" });
    await prisma.productBomItem.create({
      data: {
        productId: product.id,
        itemType: "raw_material",
        itemId: material.id,
        quantityPerUnit: 1,
        unit: "kg",
      },
    });
    await createTestStockMovement(prisma, {
      itemType: "raw_material",
      itemId: material.id,
      quantity: 140,
      movementType: "opening",
      movementDate: new Date("2026-06-30T00:00:00.000Z"),
      status: "CONFIRMED",
    });
    const completed = await createPlanAndRequirements(product.id, workArea.id, "completed", "2026-07-05", 50);
    await createTestStockMovement(prisma, {
      itemType: "raw_material",
      itemId: material.id,
      quantity: -50,
      movementType: "ACTUAL_MATERIAL_USE",
      movementDate: new Date("2026-07-05T00:00:00.000Z"),
      status: "CONFIRMED",
      sourceType: "daily_report",
      sourceId: `completed-${completed.id}`,
    });
    const later = await createPlanAndRequirements(product.id, workArea.id, "tentative_confirmed", "2026-07-10", 90);

    const response = await confirmPlan(later.id);
    const json = await response.json();
    const updated = await prisma.productionPlan.findUniqueOrThrow({ where: { id: later.id } });

    expect(response.status).toBe(200);
    expect(json.backing.canConfirm).toBe(true);
    expect(updated.status).toBe("confirmed");
  });

  async function seedBomPlan({
    plannedQuantity,
    status = "draft",
    stockQuantity = 0,
    safetyStockQuantity = 0,
    date = "2026-07-10",
  }: {
    plannedQuantity: number;
    status?: string;
    stockQuantity?: number;
    safetyStockQuantity?: number;
    date?: string;
  }) {
    const workArea = await createTestWorkArea(prisma);
    const product = await createTestProduct(prisma, {
      defaultWorkAreaId: workArea.id,
      unit: "袋",
    });
    await prisma.productionCapacity.create({
      data: {
        productId: product.id,
        workAreaId: workArea.id,
        unitsPerPersonHour: 100,
        standardPeople: 1,
      },
    });
    const material = await createTestMaterial(prisma, {
      unit: "kg",
      safetyStockQuantity,
    });
    await prisma.productBomItem.create({
      data: {
        productId: product.id,
        itemType: "raw_material",
        itemId: material.id,
        quantityPerUnit: 1,
        unit: "kg",
      },
    });
    if (stockQuantity > 0) {
      await createTestStockMovement(prisma, {
        itemType: "raw_material",
        itemId: material.id,
        quantity: stockQuantity,
        movementType: "opening",
        movementDate: new Date("2026-06-30T00:00:00.000Z"),
      });
    }
    const plan = await createTestProductionPlan(prisma, {
      productId: product.id,
      workAreaId: workArea.id,
      date: new Date(`${date}T00:00:00.000Z`),
      plannedQuantity,
      status,
    });
    const { recalculateProductionPlan } = await import("@/lib/plan-engine");
    await recalculateProductionPlan(plan.id, { refreshMaterialForecast: false });
    return { workArea, product, material, plan };
  }

  async function plannedReserveCount(materialId: string) {
    return prisma.stockMovement.count({
      where: {
        itemType: "raw_material",
        itemId: materialId,
        sourceType: "production_plan",
        status: "PLANNED",
      },
    });
  }

  async function createPlanAndRequirements(
    productId: string,
    workAreaId: string,
    status: string,
    date: string,
    plannedQuantity = 100,
  ) {
    const plan = await createTestProductionPlan(prisma, {
      productId,
      workAreaId,
      date: new Date(`${date}T00:00:00.000Z`),
      plannedQuantity,
      status,
    });
    const { recalculateProductionPlan } = await import("@/lib/plan-engine");
    await recalculateProductionPlan(plan.id, { refreshMaterialForecast: false });
    return plan;
  }
});

async function tentativeConfirm(planId: string) {
  const { POST } = await import("@/app/api/production-plans/[id]/tentative-confirm/route");
  return POST(new Request(`http://test.local/api/production-plans/${planId}/tentative-confirm`, { method: "POST" }), {
    params: Promise.resolve({ id: planId }),
  });
}

async function confirmPlan(planId: string) {
  const { POST } = await import("@/app/api/production-plans/[id]/confirm/route");
  return POST(new Request(`http://test.local/api/production-plans/${planId}/confirm`, { method: "POST" }), {
    params: Promise.resolve({ id: planId }),
  });
}

async function updatePurchaseOrder(id: string, body: Record<string, unknown>) {
  const { PUT } = await import("@/app/api/purchase-orders/[id]/route");
  return PUT(jsonRequest(`/api/purchase-orders/${id}`, body, "PUT"), {
    params: Promise.resolve({ id }),
  });
}

async function updateProductionPlan(id: string, body: Record<string, unknown>) {
  const { PUT } = await import("@/app/api/production-plans/[id]/route");
  return PUT(jsonRequest(`/api/production-plans/${id}`, body, "PUT"), {
    params: Promise.resolve({ id }),
  });
}

function jsonRequest(path: string, body: unknown, method = "POST") {
  return new Request(`http://test.local${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
