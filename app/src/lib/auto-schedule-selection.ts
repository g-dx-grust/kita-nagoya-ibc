export type SelectableSchedulePlan = {
  tempId: string;
  quantity: number;
};

export function filterSelectedSchedulePlans<T extends SelectableSchedulePlan>(
  plans: T[],
  selectedTempIds?: string[] | null,
): T[] {
  if (!selectedTempIds) return plans;
  const selected = new Set(selectedTempIds);
  return plans.filter((plan) => selected.has(plan.tempId));
}

export function summarizeScheduleSelection<T extends SelectableSchedulePlan>(
  plans: T[],
  selectedTempIds?: string[] | null,
) {
  const selectedPlans = filterSelectedSchedulePlans(plans, selectedTempIds);
  return {
    totalCount: plans.length,
    selectedCount: selectedPlans.length,
    excludedCount: plans.length - selectedPlans.length,
    selectedQuantity: selectedPlans.reduce((sum, plan) => sum + Math.max(0, plan.quantity), 0),
  };
}
