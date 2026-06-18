import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { kitagoyaPath } from "@/lib/paths";

type PrintDateNavProps = {
  basePath: string;
  date: string;
  label?: string;
};

export default function PrintDateNav({ basePath, date, label = "印刷日付の切替" }: PrintDateNavProps) {
  const previousDate = shiftDate(date, -1);
  const nextDate = shiftDate(date, 1);
  const today = toDateInputValue(new Date());

  return (
    <nav className="no-print prints-date-nav print-date-nav" aria-label={label}>
      <Link className="button-link secondary-link gap-2" href={kitagoyaPath(`${basePath}?date=${previousDate}`)}>
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        前日
      </Link>
      <Link className="button-link secondary-link" href={kitagoyaPath(`${basePath}?date=${today}`)}>
        今日
      </Link>
      <Link className="button-link secondary-link gap-2" href={kitagoyaPath(`${basePath}?date=${nextDate}`)}>
        翌日
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </nav>
  );
}

function shiftDate(date: string, days: number) {
  const target = new Date(`${date}T00:00:00`);
  target.setDate(target.getDate() + days);
  return toDateInputValue(target);
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
