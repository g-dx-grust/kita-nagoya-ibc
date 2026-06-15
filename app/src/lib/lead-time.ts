export function parseLeadTimeDays(value: unknown): number | null {
  const text = normalizeText(value);
  if (!text) return null;

  const middleDays = /^中(\d+)日(?:$|[^0-9])/.exec(text);
  if (middleDays) return Number(middleDays[1]);

  const days = /^(\d+)日(?:$|[^0-9])/.exec(text);
  if (days) return Number(days[1]);

  const weeks = /^(\d+)(?:週間|週)(?:$|[^0-9])/.exec(text);
  if (weeks) return Number(weeks[1]) * 7;

  const months = /^(\d+)(?:か月|ヶ月|カ月|ケ月|ヵ月)(?:$|[^0-9])/.exec(text);
  if (months) return Number(months[1]) * 30;

  return null;
}

export function normalizeInventoryName(value: unknown): string {
  return normalizeText(value).replace(/\s+/g, "").toLowerCase();
}

function normalizeText(value: unknown): string {
  if (value == null) return "";
  return String(value).normalize("NFKC").replace(/[　\s]+/g, " ").trim();
}
