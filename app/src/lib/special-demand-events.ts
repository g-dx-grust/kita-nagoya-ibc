export type SpecialDemandForecastFlagInput = {
  active?: boolean | null;
  status?: string | null;
  includeInNormalForecast?: boolean | null;
};

export function isExcludedFromNormalForecast(event: SpecialDemandForecastFlagInput): boolean {
  return (
    event.active !== false &&
    event.status !== "CANCELLED" &&
    event.includeInNormalForecast === false
  );
}

export function filterNormalForecastEvents<T extends SpecialDemandForecastFlagInput>(
  events: readonly T[],
): T[] {
  return events.filter((event) => !isExcludedFromNormalForecast(event));
}
