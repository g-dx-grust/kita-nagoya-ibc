"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { kitagoyaApiPath, kitagoyaPath } from "@/lib/paths";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export default function StaffShiftEntryForm({
  token,
  employeeName,
  yearMonth,
  year,
  month,
  lastDay,
  initialWorkingDays,
  initialStartTime,
  initialEndTime,
  initialBreakMinutes,
}: {
  token: string;
  employeeName: string;
  yearMonth: string;
  year: number;
  month: number;
  lastDay: number;
  initialWorkingDays: number[];
  initialStartTime: string;
  initialEndTime: string;
  initialBreakMinutes: number;
}) {
  const router = useRouter();
  const [workingDays, setWorkingDays] = useState(initialWorkingDays);
  const [startTime, setStartTime] = useState(initialStartTime);
  const [endTime, setEndTime] = useState(initialEndTime);
  const [breakMinutes, setBreakMinutes] = useState(initialBreakMinutes);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const days = useMemo(() => {
    return Array.from({ length: lastDay }, (_, index) => {
      const day = index + 1;
      const weekdayIndex = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
      return {
        day,
        weekday: WEEKDAYS[weekdayIndex],
        isWeekend: weekdayIndex === 0 || weekdayIndex === 6,
      };
    });
  }, [year, month, lastDay]);

  function toggle(day: number) {
    setWorkingDays((prev) =>
      prev.includes(day)
        ? prev.filter((value) => value !== day)
        : [...prev, day].sort((a, b) => a - b),
    );
  }

  function changeMonth(delta: number) {
    const next = new Date(Date.UTC(year, month - 1 + delta, 1));
    const ym = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
    router.push(kitagoyaPath(`/shift-entry/${token}?yearMonth=${ym}`));
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    setError(null);
    const res = await fetch(kitagoyaApiPath(`/shift-entry/${token}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        yearMonth,
        startTime,
        endTime,
        breakMinutes,
        workingDays,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(
        json.error === "invalid_time_range"
          ? "終了時間は開始時間より後にしてください。"
          : "登録できませんでした。入力内容を確認してください。",
      );
      return;
    }
    setMessage(`${json.count}日分を登録しました。`);
    router.refresh();
  }

  return (
    <>
      <div className="panel self-shift-hero">
        <div>
          <div className="muted">お名前</div>
          <strong>{employeeName}</strong>
        </div>
        <div className="self-shift-month">
          <button type="button" className="secondary" onClick={() => changeMonth(-1)}>
            前の月
          </button>
          <strong>
            {year}年{month}月
          </strong>
          <button type="button" className="secondary" onClick={() => changeMonth(1)}>
            次の月
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="row">
          <label>
            <span>開始</span>
            <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
          </label>
          <label>
            <span>終了</span>
            <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
          </label>
          <label>
            <span>休憩(分)</span>
            <input
              type="number"
              min={0}
              step={5}
              value={breakMinutes}
              onChange={(event) => setBreakMinutes(Number(event.target.value))}
            />
          </label>
        </div>
      </div>

      {error && <div className="alert danger">{error}</div>}
      {message && <div className="alert success">{message}</div>}

      <div className="panel">
        <div className="self-shift-grid">
          {days.map((date) => {
            const selected = workingDays.includes(date.day);
            return (
              <button
                key={date.day}
                type="button"
                className={[
                  "self-shift-day",
                  selected ? "is-selected" : "",
                  date.isWeekend ? "is-weekend" : "",
                ].join(" ")}
                onClick={() => toggle(date.day)}
                aria-pressed={selected}
              >
                <span>{date.day}</span>
                <small>{date.weekday}</small>
                <strong>{selected ? "出勤" : "休み"}</strong>
              </button>
            );
          })}
        </div>
      </div>

      <div className="self-shift-savebar">
        <span>{workingDays.length}日 選択中</span>
        <button type="button" onClick={save} disabled={busy}>
          {busy ? "登録中..." : "登録する"}
        </button>
      </div>
    </>
  );
}
