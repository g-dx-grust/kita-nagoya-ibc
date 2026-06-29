export function buildPurchaseCandidateGeneratePayload({
  mode,
  dateFrom,
  dateTo,
  targetMonth,
}: {
  mode: "window" | "month_end";
  dateFrom: string;
  dateTo: string;
  targetMonth: string;
}) {
  if (mode === "month_end") {
    return { mode, targetMonth, replaceExistingCandidates: true };
  }
  return { mode, dateFrom, dateTo, replaceExistingCandidates: true };
}
