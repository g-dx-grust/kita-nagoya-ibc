/* eslint-disable no-console */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Options = {
  apply: boolean;
  resetPriority: boolean;
  kitagoyaOnly: boolean;
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const workAreas = await prisma.workArea.findMany({
    where: { active: true, areaType: "internal", externalFlag: false },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
  });
  const products = await prisma.product.findMany({
    where: {
      active: true,
      ...(options.kitagoyaOnly ? { usedAtKitagoya: true } : {}),
    },
    include: { capacities: { include: { workArea: true } } },
    orderBy: { productCode: "asc" },
  });

  let productCount = 0;
  let skippedNoTemplate = 0;
  let missingToCreate = 0;
  let prioritiesToUpdate = 0;

  const operations: {
    productId: string;
    productCode: string;
    workAreaId: string;
    workAreaName: string;
    action: "create" | "update_priority";
    candidatePriority: number;
    templateWorkAreaName?: string;
  }[] = [];

  for (const product of products) {
    const internalCapacities = product.capacities.filter(
      (capacity) =>
        capacity.active &&
        capacity.workArea.active &&
        capacity.workArea.areaType === "internal" &&
        !capacity.workArea.externalFlag,
    );
    if (internalCapacities.length === 0) {
      skippedNoTemplate++;
      continue;
    }
    productCount++;

    const orderedWorkAreas = orderWorkAreasForProduct(workAreas, product.defaultWorkAreaId);
    const priorityByWorkAreaId = new Map(orderedWorkAreas.map((workArea, index) => [workArea.id, index + 1]));
    const capacityByWorkAreaId = new Map(internalCapacities.map((capacity) => [capacity.workAreaId, capacity]));
    const template =
      internalCapacities.find((capacity) => capacity.workAreaId === product.defaultWorkAreaId) ??
      [...internalCapacities].sort(compareCapacityTemplate)[0];

    for (const workArea of orderedWorkAreas) {
      const candidatePriority = priorityByWorkAreaId.get(workArea.id) ?? workArea.displayOrder;
      const existing = capacityByWorkAreaId.get(workArea.id);
      if (existing) {
        if (existing.candidatePriority == null || options.resetPriority) {
          prioritiesToUpdate++;
          operations.push({
            productId: product.id,
            productCode: product.productCode,
            workAreaId: workArea.id,
            workAreaName: workArea.name,
            action: "update_priority",
            candidatePriority,
          });
        }
        continue;
      }

      missingToCreate++;
      operations.push({
        productId: product.id,
        productCode: product.productCode,
        workAreaId: workArea.id,
        workAreaName: workArea.name,
        action: "create",
        candidatePriority,
        templateWorkAreaName: template.workArea.name,
      });
    }
  }

  console.log("=== 生産能力 部屋候補バックフィル ===");
  console.log(`mode: ${options.apply ? "APPLY" : "dry-run"}`);
  console.log(`products with template capacity: ${productCount}`);
  console.log(`skipped products without capacity: ${skippedNoTemplate}`);
  console.log(`missing rows to create: ${missingToCreate}`);
  console.log(`priorities to update: ${prioritiesToUpdate}`);
  console.log("sample:", operations.slice(0, 10));

  if (!options.apply) {
    console.log("\nDry-run only. Re-run with --apply to write to DB.");
    return;
  }

  const result = await prisma.$transaction(
    async (tx) => {
      let created = 0;
      let updated = 0;
      for (const operation of operations) {
        const product = products.find((p) => p.id === operation.productId);
        if (!product) continue;
        const internalCapacities = product.capacities.filter(
          (capacity) =>
            capacity.active &&
            capacity.workArea.active &&
            capacity.workArea.areaType === "internal" &&
            !capacity.workArea.externalFlag,
        );
        const template =
          internalCapacities.find((capacity) => capacity.workAreaId === product.defaultWorkAreaId) ??
          [...internalCapacities].sort(compareCapacityTemplate)[0];
        if (!template) continue;

        if (operation.action === "update_priority") {
          await tx.productionCapacity.update({
            where: { productId_workAreaId: { productId: operation.productId, workAreaId: operation.workAreaId } },
            data: { candidatePriority: operation.candidatePriority },
          });
          updated++;
          continue;
        }

        await tx.productionCapacity.create({
          data: {
            productId: operation.productId,
            workAreaId: operation.workAreaId,
            unitsPerPersonHour: template.unitsPerPersonHour,
            standardPeople: template.standardPeople,
            standardBreakMinutes: template.standardBreakMinutes,
            candidatePriority: operation.candidatePriority,
            sourceType: "MANUAL",
            locked: false,
            active: true,
            reviewStatus: "needs_review",
            reviewMemo: `全部屋候補の仮追加。${template.workArea.name}の生産能力をコピー。先方確認待ち。`,
            note: `全部屋候補の仮追加: ${template.workArea.name}の能力値をコピー`,
          },
        });
        created++;
      }

      await tx.auditLog.create({
        data: {
          action: "backfill_capacity_room_candidates",
          entityType: "ProductionCapacity",
          afterJson: JSON.stringify({
            created,
            updated,
            skippedNoTemplate,
            resetPriority: options.resetPriority,
            kitagoyaOnly: options.kitagoyaOnly,
          }),
        },
      });

      return { created, updated, skippedNoTemplate };
    },
    { timeout: 120000 },
  );

  console.log("\nApplied:");
  console.log(result);
}

function parseArgs(args: string[]): Options {
  return {
    apply: args.includes("--apply"),
    resetPriority: args.includes("--reset-priority"),
    kitagoyaOnly: args.includes("--kitagoya-only"),
  };
}

function orderWorkAreasForProduct<T extends { id: string }>(workAreas: T[], defaultWorkAreaId: string | null) {
  if (!defaultWorkAreaId || !workAreas.some((workArea) => workArea.id === defaultWorkAreaId)) return workAreas;
  return [
    workAreas.find((workArea) => workArea.id === defaultWorkAreaId)!,
    ...workAreas.filter((workArea) => workArea.id !== defaultWorkAreaId),
  ];
}

function compareCapacityTemplate(
  a: { candidatePriority: number | null; workArea: { displayOrder: number }; unitsPerPersonHour: number },
  b: { candidatePriority: number | null; workArea: { displayOrder: number }; unitsPerPersonHour: number },
) {
  return (
    priorityKey(a.candidatePriority) - priorityKey(b.candidatePriority) ||
    a.workArea.displayOrder - b.workArea.displayOrder ||
    b.unitsPerPersonHour - a.unitsPerPersonHour
  );
}

function priorityKey(priority: number | null | undefined) {
  return priority == null ? Number.MAX_SAFE_INTEGER : priority;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
