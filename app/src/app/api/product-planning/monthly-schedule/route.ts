import { randomUUID } from "node:crypto";

import { audit } from "@/lib/audit";
import { loadActiveBreakWindows } from "@/lib/break-windows";
import { created, handleError, parseJson } from "@/lib/http";
import { refreshCumulativeMaterialRequirements } from "@/lib/material-forecast";
import { aggregateMonthlySuggestions } from "@/lib/monthly-production-schedule";
import { simulateMonthlyShiftSchedule } from "@/lib/monthly-shift-simulation";
import { recalculateProductionPlan } from "@/lib/plan-engine";
import { prisma } from "@/lib/prisma";
import { MonthlyProductionScheduleCreateSchema } from "@/lib/schemas";
import { loadMonthlyProductionSchedulePreview } from "@/lib/product-planning-service";
import { kitagoyaPath } from "@/lib/paths";
import { ceilDisplayQuantity } from "@/lib/units";

export async function POST(req: Request) {
  try {
    const body = await parseJson(req, MonthlyProductionScheduleCreateSchema);
    const dateFrom = new Date(body.dateFrom);
    const dateTo = new Date(body.dateTo);
    const productionLeadDays = body.productionLeadDays ?? 1;
    const planningBasis = body.planningBasis ?? "historical_actual";
    const defaultStartTime = body.defaultStartTime ?? "09:00";
    const baselineEndTime = body.baselineEndTime ?? "17:00";

    const preview = await loadMonthlyProductionSchedulePreview({
      dateFrom,
      dateTo,
      productionLeadDays,
      planningBasis,
      existingPlanStatuses: body.replaceExistingDrafts ? ["confirmed"] : ["draft", "confirmed"],
    });
    const items = aggregateMonthlySuggestions(preview.suggestions);
    if (items.length === 0) {
      return created({
        dateFrom: body.dateFrom,
        dateTo: body.dateTo,
        createdCount: 0,
        skipped: [],
        plans: [],
        message:
          planningBasis === "historical_actual"
            ? "前々月前年比予測と既存予定を見た結果、追加の月間生産予定は不要です。"
            : "現在庫、未処理需要、既存予定を見た結果、追加の月間生産予定は不要です。",
      });
    }

    const productIds = [...new Set(items.map((item) => item.productId))];
    const [products, shifts, existingPlans, existingAssignments, breakWindows] = await Promise.all([
      loadProductsForSchedule(productIds),
      prisma.shift.findMany({
        where: {
          date: { gte: dateFrom, lte: dateTo },
          status: { not: "off" },
          employee: { active: true },
        },
        include: { employee: true },
        orderBy: [{ date: "asc" }, { startTime: "asc" }, { employee: { name: "asc" } }],
      }),
      prisma.productionPlan.findMany({
        where: {
          date: { gte: dateFrom, lte: dateTo },
          status: body.replaceExistingDrafts
            ? { in: ["confirmed", "completed"] }
            : { in: ["draft", "confirmed", "completed"] },
        },
        select: {
          id: true,
          date: true,
          workAreaId: true,
          plannedStartTime: true,
          plannedEndTime: true,
        },
        orderBy: [{ date: "asc" }, { plannedStartTime: "asc" }],
      }),
      prisma.productionPlanAssignment.findMany({
        where: {
          productionPlan: {
            date: { gte: dateFrom, lte: dateTo },
            status: body.replaceExistingDrafts
              ? { in: ["confirmed", "completed"] }
              : { in: ["draft", "confirmed", "completed"] },
          },
        },
        include: { productionPlan: true },
      }),
      loadActiveBreakWindows(dateFrom),
    ]);

    const createdPlans: {
      id: string;
      date: string;
      productCode: string;
      productName: string;
      workAreaName: string;
      startTime: string;
      endTime: string;
      quantity: number;
      unit: string;
      assignedCount: number;
      warnings: string[];
    }[] = [];

    const simulation = simulateMonthlyShiftSchedule({
      dateFrom: body.dateFrom,
      dateTo: body.dateTo,
      defaultStartTime,
      baselineEndTime,
      items: items.map((item) => ({
        productId: item.productId,
        productCode: item.productCode,
        productName: item.productName,
        productionType: item.productionType,
        unit: item.unit,
        preferredDate: item.scheduleDate,
        dueDates: item.dueDates,
        quantity: item.suggestedQuantity,
        schedulePriority: item.schedulePriority,
        reasons: item.reasons,
      })),
      products: products.map((product) => ({
        productId: product.id,
        productCode: product.productCode,
        productName: product.officialName,
        productionType: product.productionType as "stock" | "make_to_order" | "both",
        unit: product.unit,
        defaultWorkAreaId: product.defaultWorkAreaId,
        capacities: product.capacities
          .filter(
            (capacity) =>
              capacity.workArea.active &&
              capacity.workArea.areaType === "internal" &&
              !capacity.workArea.externalFlag,
          )
          .map((capacity) => ({
            productId: product.id,
            workAreaId: capacity.workAreaId,
            workAreaName: capacity.workArea.name,
            workAreaDefaultStartTime: capacity.workArea.defaultStartTime,
            workAreaDefaultEndTime: capacity.workArea.defaultEndTime,
            workAreaMaxPeopleCount: capacity.workArea.maxPeopleCount,
            workAreaDisplayOrder: capacity.workArea.displayOrder,
            workAreaAutoScheduleRole: capacity.workArea.autoScheduleRole,
            unitsPerPersonHour: capacity.unitsPerPersonHour,
            standardPeople: capacity.standardPeople,
            standardBreakMinutes: capacity.standardBreakMinutes,
            candidatePriority: capacity.candidatePriority,
          })),
      })),
      shifts: shifts.map((shift) => ({
        employeeId: shift.employeeId,
        employeeName: shift.employee.name,
        date: toDateInput(shift.date),
        startTime: shift.startTime,
        endTime: shift.endTime,
      })),
      existingPlans: existingPlans.map((plan) => ({
        date: toDateInput(plan.date),
        workAreaId: plan.workAreaId,
        startTime: plan.plannedStartTime,
        endTime: plan.plannedEndTime ?? plan.plannedStartTime,
      })),
      existingAssignments: existingAssignments.map((assignment) => ({
        employeeId: assignment.employeeId,
        date: toDateInput(assignment.productionPlan.date),
        startTime: assignment.startTime,
        endTime: assignment.endTime,
      })),
      breakWindows,
    });

    const plansToCreate = simulation.plans.map((simulated) => ({
      id: randomUUID(),
      simulated,
    }));

    await prisma.$transaction(
      async (tx) => {
        if (body.replaceExistingDrafts) {
          await tx.productionPlan.deleteMany({
            where: {
              date: { gte: dateFrom, lte: dateTo },
              status: "draft",
            },
          });
        }

        if (plansToCreate.length > 0) {
          await tx.productionPlan.createMany({
            data: plansToCreate.map(({ id, simulated }) => ({
              id,
              date: new Date(simulated.date),
              productId: simulated.productId,
              productionType: simulated.productionType,
              plannedQuantity: ceilDisplayQuantity(simulated.quantity) ?? 0,
              unit: simulated.unit,
              workAreaId: simulated.workAreaId,
              plannedStartTime: simulated.startTime,
              plannedEndTime: simulated.endTime,
              desiredEndTime: baselineEndTime,
              breakMinutes: simulated.breakMinutes,
              plannedPeopleCount: simulated.peopleCount,
              status: "draft",
              baselineEndTime,
              overtimeMinutes: 0,
              note: buildMonthlyNote(simulated.dueDates, simulated.reasons, simulated.warnings),
            })),
          });
        }

        const assignmentRows = plansToCreate.flatMap(({ id, simulated }) =>
          simulated.assignedEmployees.map((employee) => ({
            productionPlanId: id,
            employeeId: employee.employeeId,
            startTime: simulated.startTime,
            endTime: simulated.endTime,
          })),
        );
        if (assignmentRows.length > 0) await tx.productionPlanAssignment.createMany({ data: assignmentRows });
      },
      { timeout: 30_000 },
    );

    for (const { id, simulated } of plansToCreate) {
      createdPlans.push({
        id,
        date: simulated.date,
        productCode: simulated.productCode,
        productName: simulated.productName,
        workAreaName: simulated.workAreaName,
        startTime: simulated.startTime,
        endTime: simulated.endTime,
        quantity: simulated.quantity,
        unit: simulated.unit,
        assignedCount: simulated.assignedEmployees.length,
        warnings: simulated.warnings,
      });
      await recalculateProductionPlan(id, { refreshMaterialForecast: false });
    }

    if (createdPlans.length > 0) {
      const horizonEnd = new Date(dateTo);
      horizonEnd.setDate(horizonEnd.getDate() + 90);
      await refreshCumulativeMaterialRequirements({
        dateFrom: minDate(startOfDay(dateFrom), startOfDay(new Date())),
        dateTo: horizonEnd,
      });
    }

    await audit({
      action: "monthly_schedule_generate",
      entityType: "ProductionPlan",
      entityId: `${body.dateFrom}:${body.dateTo}`,
      after: { createdPlans, skipped: simulation.skipped, planningBasis, options: body },
    });

    return created({
      dateFrom: body.dateFrom,
      dateTo: body.dateTo,
      createdCount: createdPlans.length,
      skipped: simulation.skipped,
      plans: createdPlans,
      message:
        simulation.skipped.length > 0
          ? `${createdPlans.length}件をシフト連動で仮予定化しました。${simulation.skipped.length}件は未配置です。`
          : `${createdPlans.length}件をシフト連動で仮予定化しました。`,
      listUrl: kitagoyaPath(`/production-plans?dateFrom=${body.dateFrom}&dateTo=${body.dateTo}&status=draft`),
    });
  } catch (e) {
    return handleError(e);
  }
}

async function loadProductsForSchedule(productIds: string[]) {
  return prisma.product.findMany({
    where: { id: { in: productIds }, active: true },
    include: {
      capacities: {
        include: { workArea: true },
      },
    },
  });
}

function buildMonthlyNote(dueDates: string[], reasons: string[], warnings: string[]) {
  const uniqueDueDates = [...new Set(dueDates)].sort();
  const uniqueReasons = [...new Set(reasons)];
  const warningText = warnings.length > 0 ? ` / 注意: ${[...new Set(warnings)].join(", ")}` : "";
  return `月間シフト連動 自動生成 / 対象日: ${uniqueDueDates.join(", ")} / ${uniqueReasons.join(" / ")}${warningText}`;
}

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfDay(date: Date) {
  return new Date(date.toISOString().slice(0, 10));
}

function minDate(a: Date, b: Date) {
  return a < b ? a : b;
}
