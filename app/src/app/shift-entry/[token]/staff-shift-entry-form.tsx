"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
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
  const [savedSnapshot, setSavedSnapshot] = useState(() => serializeSavedDays(initialDaySettings));
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
  const currentSavedDays = useMemo(
    () => buildSavedDays(daySettings, defaultStartTime, defaultEndTime, defaultBreakMinutes),
    [daySettings, defaultStartTime, defaultEndTime, defaultBreakMinutes],
  );
  const selectedWeekendDays = useMemo(
    () => days.filter((date) => date.isWeekend && settingByDay.has(date.day)).length,
    [days, settingByDay],
  );
  const customTimeDays = useMemo(
    () => daySettings.filter((setting) => setting.usesCustomTime).length,
    [daySettings],
  );
  const totalWorkMinutes = useMemo(
    () =>
      currentSavedDays.reduce(
        (total, setting) => total + workMinutes(setting.startTime, setting.endTime, setting.breakMinutes),
        0,
      ),
    [currentSavedDays],
  );
  const invalidDays = useMemo(
    () => currentSavedDays.filter((setting) => !isTimeRangeValid(setting.startTime, setting.endTime)),
    [currentSavedDays],
  );
  const hasUnsavedChanges = serializeSavedDays(currentSavedDays) !== savedSnapshot;
  const hasInvalidTime = invalidDays.length > 0;

  function clearFeedback() {
    setMessage(null);
    setError(null);
  }

  function toggle(day: number) {
    clearFeedback();
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
    clearFeedback();
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

  function applyPreset(kind: "weekdays" | "all" | "none") {
    clearFeedback();
    if (kind === "none") {
      setDaySettings([]);
      return;
    }
    const selectedDays =
      kind === "weekdays"
        ? days.filter((date) => !date.isWeekend).map((date) => date.day)
        : days.map((date) => date.day);
    setDaySettings((prev) => {
      const existingByDay = new Map(prev.map((setting) => [setting.day, setting]));
      return selectedDays
        .map(
          (day) =>
            existingByDay.get(day) ?? {
              day,
              startTime: defaultStartTime,
              endTime: defaultEndTime,
              breakMinutes: defaultBreakMinutes,
              usesCustomTime: false,
            },
        )
        .sort((a, b) => a.day - b.day);
    });
  }

  function changeMonth(delta: number) {
    const next = new Date(Date.UTC(year, month - 1 + delta, 1));
    const ym = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
    router.push(kitagoyaPath(`/shift-entry/${token}?yearMonth=${ym}`));
  }

  async function save() {
    if (hasInvalidTime) {
      setError("開始・終了時間を確認してください。終了時間は開始時間より後にしてください。");
      return;
    }
    setBusy(true);
    setMessage(null);
    setError(null);
    const payloadDays = currentSavedDays;
    const res = await fetch(kitagoyaApiPath(`/shift-entry/${token}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        yearMonth,
        days: payloadDays,
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
    setSavedSnapshot(serializeSavedDays(payloadDays));
    router.refresh();
  }

  return (
    <>
      <div className="panel self-shift-hero">
        <div className="self-shift-person">
          <div className="muted">お名前</div>
          <strong>{employeeName}</strong>
          <span className={hasUnsavedChanges ? "badge warn" : "badge success"}>
            {hasUnsavedChanges ? "未保存" : "保存済み"}
          </span>
        </div>
        <div className="self-shift-month">
          <button type="button" className="secondary self-shift-month-button" onClick={() => changeMonth(-1)}>
            <ChevronLeft size={16} aria-hidden="true" />
            <span>前月</span>
          </button>
          <strong className="self-shift-month-label">
            <CalendarDays size={18} aria-hidden="true" />
            {year}年{month}月
          </strong>
          <button type="button" className="secondary self-shift-month-button" onClick={() => changeMonth(1)}>
            <span>次月</span>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="self-shift-summary-grid">
        <div className="metric">
          <span className="metric-label">出勤日</span>
          <strong className="metric-value">{daySettings.length}日</strong>
          <div className="metric-note">この月に登録する日数</div>
        </div>
        <div className="metric">
          <span className="metric-label">週末勤務</span>
          <strong className={selectedWeekendDays > 0 ? "metric-value warn-value" : "metric-value"}>
            {selectedWeekendDays}日
          </strong>
          <div className="metric-note">土日で選択中の日数</div>
        </div>
        <div className="metric">
          <span className="metric-label">時間変更</span>
          <strong className="metric-value">{customTimeDays}日</strong>
          <div className="metric-note">日別に開始・終了を変更</div>
        </div>
        <div className="metric">
          <span className="metric-label">予定時間</span>
          <strong className="metric-value">{formatHours(totalWorkMinutes)}</strong>
          <div className="metric-note">休憩を差し引いた目安</div>
        </div>
      </div>

      <div className="panel self-shift-default-panel">
        <div className="self-shift-section-head">
          <div>
            <h2>基本時間</h2>
            <p className="subtext">選択した日は、個別変更しない限りこの時間で登録されます。</p>
          </div>
          {hasInvalidTime && (
            <span className="badge danger">
              <AlertTriangle size={14} aria-hidden="true" />
              時間確認
            </span>
          )}
        </div>
        <div className="row self-shift-default-fields">
          <label>
            <span>基本開始</span>
            <input
              type="time"
              value={defaultStartTime}
              onChange={(event) => {
                clearFeedback();
                setDefaultStartTime(event.target.value);
              }}
            />
          </label>
          <label>
            <span>基本終了</span>
            <input
              type="time"
              value={defaultEndTime}
              onChange={(event) => {
                clearFeedback();
                setDefaultEndTime(event.target.value);
              }}
            />
          </label>
          <label>
            <span>基本休憩(分)</span>
            <input
              type="number"
              min={0}
              step={5}
              value={defaultBreakMinutes}
              onChange={(event) => {
                clearFeedback();
                setDefaultBreakMinutes(coerceBreakMinutes(event.target.value));
              }}
            />
          </label>
        </div>
      </div>

      {error && <div className="alert danger">{error}</div>}
      {message && <div className="alert success">{message}</div>}

      <div className="panel self-shift-calendar-panel">
        <div className="self-shift-section-head">
          <div>
            <h2>出勤日</h2>
            <p className="subtext">日付を押すと出勤・休みを切り替えます。</p>
          </div>
          <div className="self-shift-preset-actions" aria-label="一括選択">
            <button type="button" className="secondary" onClick={() => applyPreset("weekdays")}>
              平日を出勤
            </button>
            <button type="button" className="secondary" onClick={() => applyPreset("all")}>
              全日出勤
            </button>
            <button type="button" className="secondary" onClick={() => applyPreset("none")}>
              全て休み
            </button>
          </div>
        </div>
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
          <div className="self-shift-section-head">
            <div>
              <h2>日別の時間</h2>
              <p className="subtext">基本時間と違う日だけチェックを入れて調整します。</p>
            </div>
          </div>
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
                          aria-invalid={
                            setting.usesCustomTime && !isTimeRangeValid(setting.startTime, setting.endTime)
                          }
                        />
                      </label>
                      <label>
                        <span>終了</span>
                        <input
                          type="time"
                          value={setting.endTime}
                          onChange={(event) => updateDay(setting.day, { endTime: event.target.value })}
                          aria-invalid={
                            setting.usesCustomTime && !isTimeRangeValid(setting.startTime, setting.endTime)
                          }
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
                            updateDay(setting.day, { breakMinutes: coerceBreakMinutes(event.target.value) })
                          }
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="subtext">
                      {defaultStartTime}-{defaultEndTime} / 休憩 {defaultBreakMinutes}分
                    </div>
                  )}
                  {setting.usesCustomTime && !isTimeRangeValid(setting.startTime, setting.endTime) && (
                    <div className="inline-error">終了時間は開始時間より後にしてください。</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="self-shift-savebar">
        <div className="self-shift-savebar-status" aria-live="polite">
          <span>{daySettings.length}日 選択中</span>
          <small>{hasUnsavedChanges ? "未保存の変更があります" : "この内容で保存済みです"}</small>
        </div>
        <button type="button" onClick={save} disabled={busy || hasInvalidTime}>
          <CheckCircle2 size={18} aria-hidden="true" />
          <span>{busy ? "登録中..." : "登録する"}</span>
        </button>
      </div>
    </>
  );
}

function buildSavedDays(
  daySettings: DaySetting[],
  defaultStartTime: string,
  defaultEndTime: string,
  defaultBreakMinutes: number,
): InitialDaySetting[] {
  return daySettings
    .map((setting) => ({
      day: setting.day,
      startTime: setting.usesCustomTime ? setting.startTime : defaultStartTime,
      endTime: setting.usesCustomTime ? setting.endTime : defaultEndTime,
      breakMinutes: setting.usesCustomTime ? setting.breakMinutes : defaultBreakMinutes,
    }))
    .sort((a, b) => a.day - b.day);
}

function serializeSavedDays(days: InitialDaySetting[]): string {
  return JSON.stringify([...days].sort((a, b) => a.day - b.day));
}

function isTimeRangeValid(startTime: string, endTime: string): boolean {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  return Number.isFinite(start) && Number.isFinite(end) && start < end;
}

function workMinutes(startTime: string, endTime: string, breakMinutes: number): number {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(breakMinutes)) return 0;
  return Math.max(0, end - start - breakMinutes);
}

function toMinutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return Number.NaN;
  return hour * 60 + minute;
}

function coerceBreakMinutes(value: string): number {
  const minutes = Number(value);
  if (!Number.isFinite(minutes)) return 0;
  return Math.max(0, Math.round(minutes));
}

function formatHours(minutes: number): string {
  const hours = minutes / 60;
  if (hours === 0) return "0h";
  return `${hours.toFixed(hours % 1 === 0 ? 0 : 1)}h`;
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
