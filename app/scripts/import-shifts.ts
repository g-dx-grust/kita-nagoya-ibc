/* eslint-disable no-console */
//
// Import 02_existing_attendance_shift_table.xlsx
//
// 各シートは以下の構造 (Sheet1: 11月分, Sheet1 (3): 3月分, Sheet1 (4): 4月分, Sheet1 (5): 5月分):
//   row 0: タイトル "出勤表"
//   row 1: 月名 + "勤務時間" + "1日"〜"31日" の日付列見出し
//   row 2: 曜日行 (土/日/月/...)
//   row 3〜: 連番(任意), 氏名, 勤務時間表記(例 "9～17"), 各日列の出勤フラグ(1 or null)
//
// 年は記載されていないので、月+日付ヘッダー+曜日から自動推定する。
//
// 投入先:
//   employees   - 氏名で upsert
//   shifts      - (employeeId, date) で upsert、startTime/endTime は勤務時間表記から導出

import path from "node:path";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import { parseCsvWithHeader } from "../src/lib/csv";

const XLSX_PATH = path.resolve(
  __dirname,
  "../../source_files/renamed_reference_copies/02_existing_attendance_shift_table.xlsx",
);

const prisma = new PrismaClient();
const cliPath = process.argv.slice(2).find((arg) => !arg.startsWith("--"));

function toHankaku(s: string): string {
  return s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}
function str(v: unknown): string | null {
  if (v == null) return null;
  const s = toHankaku(String(v)).replace(/[\s　]+/g, "").trim();
  if (s === "") return null;
  return s;
}

const WEEKDAY_JP = ["日", "月", "火", "水", "木", "金", "土"];

// Pick the year (2023..2027) whose weekday mapping best matches the entered
// weekday row. Excel入力にtypoがあっても多数決で確定できるよう、最も一致が多い
// 年を採用する。タイブレークは新しい年を優先 (より直近)。
function inferYear(month: number, daysHeader: number[], weekdays: string[]): number | null {
  let bestYear: number | null = null;
  let bestScore = -1;
  for (let y = 2023; y <= 2027; y++) {
    let score = 0;
    let compared = 0;
    for (let i = 0; i < daysHeader.length; i++) {
      const d = daysHeader[i];
      const w = weekdays[i];
      if (!d || !w) continue;
      compared++;
      const date = new Date(y, month - 1, d);
      if (WEEKDAY_JP[date.getDay()] === w) score++;
    }
    // 過半数の一致がある年だけ採用候補にする (=入力ミスより本物の確率が高い)
    if (compared > 0 && score * 2 > compared && score >= bestScore) {
      bestScore = score;
      bestYear = y;
    }
  }
  return bestYear;
}

function parseTimeRange(s: string | null): { start: string; end: string } | null {
  if (!s) return null;
  const norm = s.replace(/[〜~～\-－]/g, "～");
  const m = /^(\d{1,2})(?::(\d{2}))?～(\d{1,2})(?::(\d{2}))?$/.exec(norm);
  if (!m) return null;
  const hh = (n: string) => String(Number(n)).padStart(2, "0");
  return {
    start: `${hh(m[1])}:${m[2] ?? "00"}`,
    end: `${hh(m[3])}:${m[4] ?? "00"}`,
  };
}

type SheetData = {
  sheetName: string;
  year: number | null;
  month: number;
  dayCols: { col: number; day: number }[];
  rows: { name: string; time: { start: string; end: string } | null; presentCols: number[] }[];
};

function parseSheet(sheet: XLSX.WorkSheet, sheetName: string): SheetData | null {
  const arr = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
  if (arr.length < 4) return null;

  // ヘッダー行 (row 1) を月+日 として走査
  const header = arr[1] as unknown[];
  const weekdayRow = arr[2] as unknown[];
  let month: number | null = null;
  const dayCols: { col: number; day: number }[] = [];
  for (let c = 0; c < header.length; c++) {
    const cell = str(header[c]);
    if (!cell) continue;
    if (month == null) {
      const mm = /^(\d{1,2})月$/.exec(cell);
      if (mm) {
        month = Number(mm[1]);
        continue;
      }
    }
    const dm = /^(\d{1,2})日$/.exec(cell);
    if (dm) dayCols.push({ col: c, day: Number(dm[1]) });
  }
  if (month == null || dayCols.length === 0) return null;

  const weekdays = dayCols.map((d) => str(weekdayRow[d.col]) ?? "");
  const year = inferYear(
    month,
    dayCols.map((d) => d.day),
    weekdays,
  );
  if (year == null) {
    console.log(`    debug ${sheetName}: month=${month} days=${dayCols.map((d) => d.day).join(",")}`);
    console.log(`    debug ${sheetName}: weekdays=${weekdays.join(",")}`);
  }

  // データ行: row 3..末尾。氏名は最初の文字列セル、勤務時間は次のセル。
  const rows: SheetData["rows"] = [];
  for (let i = 3; i < arr.length; i++) {
    const r = arr[i] as unknown[];
    // 氏名候補: 最初の "日本語っぽい" 文字列。連番だけの場合は次。
    let nameCol = -1;
    for (let c = 0; c < 4; c++) {
      const cell = str(r[c]);
      if (cell && !/^\d+$/.test(cell) && !/^\d+月$/.test(cell)) {
        nameCol = c;
        break;
      }
    }
    if (nameCol < 0) continue;
    const name = str(r[nameCol]);
    if (!name) continue;
    // 時間列は氏名のすぐ右側 (timeみたいなセル) を探す
    const timeCellRaw = str(r[nameCol + 1]);
    const time = parseTimeRange(timeCellRaw);
    if (!time) continue;

    const presentCols: number[] = [];
    for (const d of dayCols) {
      const v = r[d.col];
      if (v == null || v === "") continue;
      if (typeof v === "number" && v !== 0) presentCols.push(d.col);
      else if (typeof v === "string" && v.trim() !== "") presentCols.push(d.col);
    }
    rows.push({ name, time, presentCols });
  }

  return { sheetName, year, month, dayCols, rows };
}

async function getEmployeeId(
  name: string,
  time: { start: string; end: string } | null,
  cache: Map<string, string | null>,
): Promise<string | null> {
  if (cache.has(name)) return cache.get(name)!;
  const found = await prisma.employee.findFirst({ where: { name } });
  if (found && !found.active) {
    cache.set(name, null);
    console.log(`  skip inactive employee: ${name}`);
    return null;
  }
  const defaults = {
    defaultStartTime: time?.start ?? "09:00",
    defaultEndTime: time?.end ?? "17:00",
    defaultBreakMinutes: 60,
  };
  const row = found
    ? await prisma.employee.update({ where: { id: found.id }, data: defaults })
    : await prisma.employee.create({ data: { name, active: true, ...defaults } });
  cache.set(name, row.id);
  return row.id;
}

async function main() {
  if (cliPath && /\.csv$/i.test(cliPath)) {
    await importShiftsCsv(path.resolve(process.cwd(), cliPath));
    return;
  }

  console.log(`Reading ${XLSX_PATH}`);
  const wb = XLSX.readFile(XLSX_PATH);

  // 同一シートが複数あるので、(year-month)単位で重複を排除する
  const parsed: SheetData[] = [];
  const seenKey = new Set<string>();
  for (const name of wb.SheetNames) {
    const sd = parseSheet(wb.Sheets[name], name);
    if (!sd) continue;
    const key = `${sd.year}-${sd.month}`;
    if (sd.year != null && seenKey.has(key)) {
      console.log(`  ${name}: ${key} 重複につきスキップ`);
      continue;
    }
    if (sd.year != null) seenKey.add(key);
    parsed.push(sd);
    console.log(
      `  ${name}: ${sd.year ?? "??"}/${sd.month} (${sd.dayCols.length} days, ${sd.rows.length} employees)`,
    );
  }

  const employeeCache = new Map<string, string | null>();
  let employeesCreated = 0;
  let shiftsCreated = 0;
  let shiftsUpdated = 0;

  for (const sd of parsed) {
    if (sd.year == null) {
      console.log(`  skip ${sd.sheetName}: year unresolved`);
      continue;
    }
    const colToDay = new Map(sd.dayCols.map((d) => [d.col, d.day]));
    for (const row of sd.rows) {
      const before = await prisma.employee.findFirst({ where: { name: row.name } });
      const empId = await getEmployeeId(row.name, row.time, employeeCache);
      if (!empId) continue;
      if (!before) employeesCreated++;
      const t = row.time ?? { start: "09:00", end: "17:00" };
      for (const col of row.presentCols) {
        const day = colToDay.get(col)!;
        const date = new Date(Date.UTC(sd.year, sd.month - 1, day));
        const existing = await prisma.shift.findUnique({
          where: { employeeId_date: { employeeId: empId, date } },
        });
        const data = {
          startTime: t.start,
          endTime: t.end,
          breakMinutes: 60,
          status: "confirmed",
          shiftPatternId: null as string | null,
        };
        if (existing) {
          await prisma.shift.update({ where: { id: existing.id }, data });
          shiftsUpdated++;
        } else {
          await prisma.shift.create({ data: { ...data, employeeId: empId, date } });
          shiftsCreated++;
        }
      }
    }
  }

  console.log(`\n=== 結果 ===`);
  console.log(`  従業員 新規: ${employeesCreated}, 累計: ${employeeCache.size}`);
  console.log(`  シフト 新規: ${shiftsCreated}, 更新: ${shiftsUpdated}`);
}

async function importShiftsCsv(filePath: string) {
  console.log(`Reading CSV ${filePath}`);
  const { rows } = parseCsvWithHeader(readFileSync(filePath, "utf8"));
  const patterns = await prisma.shiftPattern.findMany({ where: { active: true } });
  const patternByName = new Map(patterns.map((pattern) => [pattern.name, pattern.id]));
  let imported = 0;
  const errors: string[] = [];
  const warnings: string[] = [];
  const employeeCache = new Map<string, string | null>();

  for (const [index, row] of rows.entries()) {
    const line = index + 2;
    const employeeName = value(row.employee_name);
    const date = parseDate(row.date);
    const startTime = value(row.start_time);
    const endTime = value(row.end_time);
    const breakMinutes = nonnegativeInt(row.break_minutes) ?? 60;
    const status = value(row.status) ?? "confirmed";
    const patternName = value(row.shift_pattern_name);
    let shiftPatternId: string | null = null;

    if (!employeeName) {
      errors.push(`${line}: employee_name required`);
      continue;
    }
    if (!date) {
      errors.push(`${line}: invalid date`);
      continue;
    }
    if (!startTime || !endTime || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)) {
      errors.push(`${line}: invalid time`);
      continue;
    }
    if (!["draft", "confirmed", "off"].includes(status)) {
      errors.push(`${line}: invalid status`);
      continue;
    }
    if (patternName) {
      shiftPatternId = patternByName.get(patternName) ?? null;
      if (!shiftPatternId) warnings.push(`${line}: shift_pattern_name not found: ${patternName}`);
    }

    const employeeId = await getEmployeeId(employeeName, { start: startTime, end: endTime }, employeeCache);
    if (!employeeId) {
      errors.push(`${line}: employee inactive`);
      continue;
    }

    await prisma.shift.upsert({
      where: { employeeId_date: { employeeId, date } },
      update: { startTime, endTime, breakMinutes, status, shiftPatternId },
      create: { employeeId, date, startTime, endTime, breakMinutes, status, shiftPatternId },
    });
    imported++;
  }

  console.log(`  CSV imported: ${imported}, errors: ${errors.length}, warnings: ${warnings.length}`);
  for (const error of errors.slice(0, 20)) console.log(`  error ${error}`);
  for (const warning of warnings.slice(0, 20)) console.log(`  warning ${warning}`);
}

function value(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
}

function nonnegativeInt(v: string | undefined): number | null {
  const s = value(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
}

function parseDate(v: string | undefined): Date | null {
  const s = value(v);
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? d : null;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
