export type AutoScheduleProductionType =
  | "stock"
  | "make_to_order"
  | "external"
  | "trial"
  | "other"
  | string;

export type AutoScheduleWorkAreaRole =
  | "ORDER_PRIMARY"
  | "STOCK_PRIMARY"
  | "SHARED"
  | "EXCLUDED"
  | string
  | null
  | undefined;

export type AutoScheduleItemLike = {
  productionType: AutoScheduleProductionType;
  productCode?: string | null;
  schedulePriority?: number | null;
  originalIndex?: number;
};

export type AutoScheduleCapacityLike = {
  workArea: {
    autoScheduleRole?: AutoScheduleWorkAreaRole;
    displayOrder?: number | null;
    name?: string | null;
  };
  candidatePriority?: number | null;
  workAreaId?: string;
};

export function productionTypeScheduleRank(productionType: AutoScheduleProductionType): number {
  switch (productionType) {
    case "make_to_order":
      return 0;
    case "trial":
    case "other":
      return 1;
    case "stock":
      return 2;
    case "external":
      return 3;
    default:
      return 1;
  }
}

export function compareAutoScheduleItems(a: AutoScheduleItemLike, b: AutoScheduleItemLike): number {
  return (
    productionTypeScheduleRank(a.productionType) - productionTypeScheduleRank(b.productionType) ||
    schedulePriorityKey(a.schedulePriority) - schedulePriorityKey(b.schedulePriority) ||
    (a.productCode ?? "").localeCompare(b.productCode ?? "", "ja") ||
    (a.originalIndex ?? 0) - (b.originalIndex ?? 0)
  );
}

export function autoScheduleRoleRank(
  productionType: AutoScheduleProductionType,
  role: AutoScheduleWorkAreaRole,
): number {
  const normalized = role ?? "SHARED";
  if (normalized === "EXCLUDED") return Number.POSITIVE_INFINITY;
  if (productionType === "make_to_order") {
    if (normalized === "ORDER_PRIMARY") return 0;
    if (normalized === "SHARED") return 1;
    if (normalized === "STOCK_PRIMARY") return 2;
    return 3;
  }
  if (productionType === "stock") {
    if (normalized === "STOCK_PRIMARY") return 0;
    if (normalized === "SHARED") return 1;
    if (normalized === "ORDER_PRIMARY") return 2;
    return 3;
  }
  if (normalized === "SHARED") return 0;
  if (normalized === "ORDER_PRIMARY" || normalized === "STOCK_PRIMARY") return 1;
  return 2;
}

export function sortCapacitiesForProductionType<C extends AutoScheduleCapacityLike>(
  capacities: C[],
  productionType: AutoScheduleProductionType,
): C[] {
  const usable = usableCapacitiesForProductionType(capacities, productionType);
  if (usable.length === 0) return [];

  const bestRoleRank = Math.min(
    ...usable.map((capacity) => autoScheduleRoleRank(productionType, capacity.workArea.autoScheduleRole)),
  );
  return usable
    .filter((capacity) => autoScheduleRoleRank(productionType, capacity.workArea.autoScheduleRole) === bestRoleRank)
    .sort(
      (a, b) =>
        priorityKey(a.candidatePriority) - priorityKey(b.candidatePriority) ||
        (a.workArea.displayOrder ?? 0) - (b.workArea.displayOrder ?? 0) ||
        (a.workArea.name ?? "").localeCompare(b.workArea.name ?? "", "ja") ||
        (a.workAreaId ?? "").localeCompare(b.workAreaId ?? ""),
    );
}

export function sortUsableCapacitiesForProductionType<C extends AutoScheduleCapacityLike>(
  capacities: C[],
  productionType: AutoScheduleProductionType,
): C[] {
  return usableCapacitiesForProductionType(capacities, productionType).sort(
    (a, b) =>
      autoScheduleRoleRank(productionType, a.workArea.autoScheduleRole) -
        autoScheduleRoleRank(productionType, b.workArea.autoScheduleRole) ||
      priorityKey(a.candidatePriority) - priorityKey(b.candidatePriority) ||
      (a.workArea.displayOrder ?? 0) - (b.workArea.displayOrder ?? 0) ||
      (a.workArea.name ?? "").localeCompare(b.workArea.name ?? "", "ja") ||
      (a.workAreaId ?? "").localeCompare(b.workAreaId ?? ""),
  );
}

export function schedulePriorityKey(priority: number | null | undefined): number {
  return priority == null ? Number.MAX_SAFE_INTEGER : priority;
}

function usableCapacitiesForProductionType<C extends AutoScheduleCapacityLike>(
  capacities: C[],
  productionType: AutoScheduleProductionType,
): C[] {
  return capacities.filter(
    (capacity) => Number.isFinite(autoScheduleRoleRank(productionType, capacity.workArea.autoScheduleRole)),
  );
}

function priorityKey(priority: number | null | undefined): number {
  return priority == null ? Number.MAX_SAFE_INTEGER : priority;
}
