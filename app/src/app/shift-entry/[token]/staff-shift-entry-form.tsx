"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { kitagoyaApiPath, kitagoyaPath } from "@/lib/paths";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

type InitialDaySetting = {
  day: number;
  startTime: string;
  endTime: string;
  breakMinutes: number;
};

type DaySetting = InitialDaySetting & {
  usesCustomTime: boolean;
};

export default function StaffShiftEntryForm({
  token,
  employeeName,
  yearMonth,
  year,
  month,
  lastDay,
  initialDaySettings,
  baseStartTime,
  baseEndTime,
  baseBreakMinutes,
}: {
  token: string;
  employeeName: string;
  yearMonth: string;
  year: number;
  month: number;
  lastDay: number;
  initialDaySettings: InitialDaySetting[];
  baseStartTime: string;
  baseEndTime: string;
  baseBreakMinutes: number;
}) {
  const router = useRouter();
  const [defaultStartTime, setDefaultStartTime] = useState(baseStartTime);
  const [defaultEndTime, setDefaultEndTime] = useState(baseEndTime);
  const [defaultBreakMinutes, setDefaultBreakMinutes] = useState(baseBreakMinutes);
  const [daySettings, setDaySettings] = useState<DaySetting[]>(() =>
    initialDaySettings.map((setting) => ({
      ...setting,
      usesCustomTime: !isSameTime(setting, {
        startTime: baseStartTime,
        endTime: baseEndTime,
        breakMinutes: baseBreakMinutes,
      }),
    })),
  );
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
  const settingByDay = useMemo(
    () => new Map(daySettings.map((setting) => [setting.day, setting])),
    [daySettings],
  );

  function toggle(day: number) {
    setDaySettings((prev) => {
      const found = prev.find((setting) => setting.day === day);
      if (found) return prev.filter((setting) => setting.day !== day);
      return [
        ...prev,
        {
          day,
          startTime: defaultStartTime,
          endTime: defaultEndTime,
          breakMinutes: defaultBreakMinutes,
          usesCustomTime: false,
        },
      ].sort((a, b) => a.day - b.day);
    });
  }

  function updateDay(day: number, patch: Partial<DaySetting>) {
    setDaySettings((prev) =>
      prev.map((setting) =>
        setting.day === day
          ? {
              ...setting,
              ...patch,
            }
          : setting,
      ),
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
        days: daySettings.map((setting) => ({
          day: setting.day,
          startTime: setting.usesCustomTime ? setting.startTime : defaultStartTime,
          endTime: setting.usesCustomTime ? setting.endTime : defaultEndTime,
          breakMinutes: setting.usesCustomTime ? setting.breakMinutes : defaultBreakMinutes,
        })),
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
            <span>基本開始</span>
            <input
              type="time"
              value={defaultStartTime}
              onChange={(event) => setDefaultStartTime(event.target.value)}
            />
          </label>
          <label>
            <span>基本終了</span>
            <input
              type="time"
              value={defaultEndTime}
              onChange={(event) => setDefaultEndTime(event.target.value)}
            />
          </label>
          <label>
            <span>基本休憩(分)</span>
            <input
              type="number"
              min={0}
              step={5}
              value={defaultBreakMinutes}
              onChange={(event) => setDefaultBreakMinutes(Number(event.target.value))}
            />
          </label>
        </div>
      </div>

      {error && <div className="alert danger">{error}</div>}
      {message && <div className="alert success">{message}</div>}

      <div className="panel">
        <div className="self-shift-grid">
          {days.map((date) => {
            const selected = settingByDay.has(date.day);
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

      {daySettings.length > 0 && (
        <div className="panel">
          <h2>日別の時間</h2>
          <div className="self-shift-exception-list">
            {daySettings.map((setting) => {
              const day = days.find((date) => date.day === setting.day);
              return (
                <div className="self-shift-exception" key={setting.day}>
                  <div className="self-shift-exception-head">
                    <strong>
                      {month}/{setting.day}({day?.weekday})
                    </strong>
                    <label className="inline-check">
                      <input
                        type="checkbox"
                        checked={setting.usesCustomTime}
                        onChange={(event) =>
                          updateDay(setting.day, {
                            usesCustomTime: event.target.checked,
                            startTime: event.target.checked ? setting.startTime : defaultStartTime,
                            endTime: event.target.checked ? setting.endTime : defaultEndTime,
                            breakMinutes: event.target.checked ? setting.breakMinutes : defaultBreakMinutes,
                          })
                        }
                      />
                      <span>この日だけ時間変更</span>
                    </label>
                  </div>
                  {setting.usesCustomTime ? (
                    <div className="row self-shift-exception-fields">
                      <label>
                        <span>開始</span>
                        <input
                          type="time"
                          value={setting.startTime}
                          onChange={(event) => updateDay(setting.day, { startTime: event.target.value })}
                        />
                      </label>
                      <label>
                        <span>終了</span>
                        <input
                          type="time"
                          value={setting.endTime}
                          onChange={(event) => updateDay(setting.day, { endTime: event.target.value })}
                        />
                      </label>
                      <label>
                        <span>休憩(分)</span>
                        <input
                          type="number"
                          min={0}
                          step={5}
                          value={setting.breakMinutes}
                          onChange={(event) =>
                            updateDay(setting.day, { breakMinutes: Number(event.target.value) })
                          }
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="subtext">
                      {defaultStartTime}-{defaultEndTime} / 休憩 {defaultBreakMinutes}分
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="self-shift-savebar">
        <span>{daySettings.length}日 選択中</span>
        <button type="button" onClick={save} disabled={busy}>
          {busy ? "登録中..." : "登録する"}
        </button>
      </div>
    </>
  );
}

function isSameTime(
  setting: Pick<InitialDaySetting, "startTime" | "endTime" | "breakMinutes">,
  base: Pick<InitialDaySetting, "startTime" | "endTime" | "breakMinutes">,
) {
  return (
    setting.startTime === base.startTime &&
    setting.endTime === base.endTime &&
    setting.breakMinutes === base.breakMinutes
  );
}
