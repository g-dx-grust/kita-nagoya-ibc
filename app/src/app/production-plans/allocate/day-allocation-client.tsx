"use client";

import Link from "next/link";
import { useState, type CSSProperties, type ReactNode } from "react";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import SearchableCombobox from "@/components/ui/searchable-combobox";
import { kitagoyaApiPath, kitagoyaPath } from "@/lib/paths";

type IdleReason = "no_remaining_work" | "room_capacity_full";

type AllocationResult = {
  dayStart: string;
  dayEnd: string;
  stepMinutes: number;
  jobs: {
    jobId: string;
    productName: string;
    workAreaId: string;
    workAreaName: string;
    originalWorkAreaId?: string;
    originalWorkAreaName?: string;
    workAreaOptions?: { workAreaId: string; workAreaName: string }[];
    unit: string;
    requestedQuantity: number;
    scheduledQuantity: number;
    overflowQuantity: number;
    startTime: string | null;
    endTime: string | null;
    peopleSegments: { startTime: string; endTime: string; peopleCount: number }[];
    assignments: { employeeId: string; employeeName: string; startTime: string; endTime: string }[];
    warnings: string[];
  }[];
  employees: {
    employeeId: string;
    employeeName: string;
    shiftStartTime: string;
    shiftEndTime: string;
    segments: { workAreaId: string; workAreaName: string; productName: string; startTime: string; endTime: string }[];
    idleSegments: { startTime: string; endTime: string; reason: IdleReason }[];
    workingMinutes: number;
    idleMinutes: number;
    breakMinutes: number;
  }[];
  summary: {
    totalStaff: number;
    totalAvailableMinutes: number;
    totalWorkingMinutes: number;
    totalIdleMinutes: number;
    idleStaffCount: number;
    fullyUtilized: boolean;
    capacityBottleneck: boolean;
    hasOverflow: boolean;
  };
  warnings: string[];
};

type ServiceResult = {
  date: string;
  persisted: boolean;
  allocation: AllocationResult;
  skippedPlans: { planId: string; productName: string; reason: string }[];
  workAreaCapacities: { workAreaId: string; workAreaName: string; maxPeopleCount: number }[];
};

type Pin = {
  employeeId: string;
  employeeName: string;
  workAreaId: string;
  workAreaName: string;
  startTime: string;
  endTime: string;
};

type WorkAreaOverride = {
  planId: string;
  workAreaId: string;
};

type DragChip = {
  employeeId: string;
  employeeName: string;
  startTime: string;
  endTime: string;
};

type View = "room" | "people" | "jobs" | "board";

// 部屋ボックス（Kanban）用カード。人の作業セグメント=1カード、手すきは未割当ボックスへ。
type WorkCard = {
  kind: "work";
  key: string;
  employeeId: string;
  employeeName: string;
  startTime: string;
  endTime: string;
  workAreaId: string;
  productName: string;
  pinned: boolean;
};

type IdleCard = {
  kind: "idle";
  key: string;
  employeeId: string;
  employeeName: string;
  startTime: string;
  endTime: string;
  reason: IdleReason;
};

type AreaOption = { workAreaId: string; workAreaName: string; color: string };

const idleReasonLabel: Record<IdleReason, string> = {
  no_remaining_work: "仕事なし",
  room_capacity_full: "部屋満員",
};

const UNPIN_ZONE = "__unpin__";

// 部屋ごとの色（部屋ボードと人タイムラインで一貫させる）
const AREA_PALETTE = [
  "#2563eb",
  "#7c3aed",
  "#0891b2",
  "#059669",
  "#d97706",
  "#db2777",
  "#65a30d",
  "#dc2626",
];

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart < bEnd && bStart < aEnd;
}

function hm(value: string) {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + (m || 0);
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export default function DayAllocationClient({ initialDate }: { initialDate: string }) {
  const [date, setDate] = useState(initialDate);
  const [dayStart, setDayStart] = useState("09:00");
  const [dayEnd, setDayEnd] = useState("17:00");
  const [result, setResult] = useState<ServiceResult | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [workAreaOverrides, setWorkAreaOverrides] = useState<WorkAreaOverride[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [dragOverZone, setDragOverZone] = useState<string | null>(null);
  const [view, setView] = useState<View>("room");
  const [persisted, setPersisted] = useState(false);
  const [openCardKey, setOpenCardKey] = useState<string | null>(null);
  // ガントのテキスト途切れ対策: 時間スケール(0=画面幅に合わせる, >0=px/時で横に広げる)とラベル折返し
  const [pxPerHour, setPxPerHour] = useState(0);
  const [wrapLabels, setWrapLabels] = useState(true);

  async function call(
    persist: boolean,
    pinsOverride?: Pin[],
    workAreaOverridesOverride?: WorkAreaOverride[],
  ) {
    const activePins = pinsOverride ?? pins;
    const activeWorkAreaOverrides = workAreaOverridesOverride ?? workAreaOverrides;
    setLoading(true);
    setError(null);
    setSavedMessage(null);
    try {
      const res = await fetch(kitagoyaApiPath("/production-plans/allocate-day"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          dayStart,
          dayEnd,
          persist,
          pinnedAssignments: activePins.map((p) => ({
            employeeId: p.employeeId,
            workAreaId: p.workAreaId,
            startTime: p.startTime,
            endTime: p.endTime,
          })),
          planWorkAreaOverrides: activeWorkAreaOverrides.map((override) => ({
            planId: override.planId,
            workAreaId: override.workAreaId,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ? `${data.error}${data.details ? `: ${JSON.stringify(data.details)}` : ""}` : "失敗しました");
        return;
      }
      setResult(data);
      const validWorkAreaIds = new Set(
        (data as ServiceResult).allocation.jobs.map((job) => job.workAreaId),
      );
      const effectivePins = activePins.filter((pin) => validWorkAreaIds.has(pin.workAreaId));
      if (effectivePins.length !== activePins.length) setPins(effectivePins);
      if (persist) {
        setPersisted(true);
        const adjustmentLabels = [
          effectivePins.length > 0 ? `手動微調整${effectivePins.length}件` : null,
          activeWorkAreaOverrides.length > 0 ? `商品部屋変更${activeWorkAreaOverrides.length}件` : null,
        ].filter(Boolean);
        setSavedMessage(
          adjustmentLabels.length > 0
            ? `${adjustmentLabels.join("・")}を反映して割り当てを保存し、原料/資材所要量を再計算しました。`
            : "割り当てを保存し、原料/資材所要量を再計算しました。",
        );
      } else {
        setPersisted(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "通信エラー");
    } finally {
      setLoading(false);
    }
  }

  function handleDateChange(value: string) {
    setDate(value);
    setPins([]);
    setWorkAreaOverrides([]);
    setPersisted(false);
    setSavedMessage(null);
  }

  // 対象日/時間窓を変えたら、前回の保存成功バナー・印刷導線を消す（未保存の別条件を印刷誘導しない）
  function changeDayStart(value: string) {
    setDayStart(value);
    setPersisted(false);
    setSavedMessage(null);
  }
  function changeDayEnd(value: string) {
    setDayEnd(value);
    setPersisted(false);
    setSavedMessage(null);
  }

  function dropChipOnZone(chip: DragChip, zoneWorkAreaId: string, zoneWorkAreaName: string) {
    const kept = pins.filter(
      (p) => !(p.employeeId === chip.employeeId && overlaps(p.startTime, p.endTime, chip.startTime, chip.endTime)),
    );
    let next: Pin[];
    if (zoneWorkAreaId === UNPIN_ZONE) {
      next = kept;
    } else {
      next = [
        ...kept,
        {
          employeeId: chip.employeeId,
          employeeName: chip.employeeName,
          workAreaId: zoneWorkAreaId,
          workAreaName: zoneWorkAreaName,
          startTime: chip.startTime,
          endTime: chip.endTime,
        },
      ];
    }
    setPins(next);
    void call(false, next);
  }

  // カードのクリック割当（ドラッグと同じピン機構を使う）
  function assignCard(card: WorkCard | IdleCard, zoneWorkAreaId: string, zoneWorkAreaName: string) {
    setOpenCardKey(null);
    dropChipOnZone(
      {
        employeeId: card.employeeId,
        employeeName: card.employeeName,
        startTime: card.startTime,
        endTime: card.endTime,
      },
      zoneWorkAreaId,
      zoneWorkAreaName,
    );
  }

  function clearPins() {
    setPins([]);
    void call(false, []);
  }

  function changeJobWorkArea(
    job: AllocationResult["jobs"][number],
    nextWorkAreaId: string,
  ) {
    const originalWorkAreaId = job.originalWorkAreaId ?? job.workAreaId;
    const next =
      nextWorkAreaId === originalWorkAreaId
        ? workAreaOverrides.filter((override) => override.planId !== job.jobId)
        : [
            ...workAreaOverrides.filter((override) => override.planId !== job.jobId),
            { planId: job.jobId, workAreaId: nextWorkAreaId },
          ];
    setWorkAreaOverrides(next);
    setPersisted(false);
    setSavedMessage(null);
    void call(false, undefined, next);
  }

  function clearWorkAreaOverrides() {
    setWorkAreaOverrides([]);
    setPersisted(false);
    setSavedMessage(null);
    void call(false, undefined, []);
  }

  const allocation = result?.allocation;
  const summary = allocation?.summary;

  // 部屋一覧と色の対応（ジョブ→部屋）
  const areaColor = new Map<string, string>();
  const areaOrder: { workAreaId: string; workAreaName: string }[] = [];
  if (allocation) {
    for (const job of allocation.jobs) {
      if (!areaColor.has(job.workAreaId)) {
        areaColor.set(job.workAreaId, AREA_PALETTE[areaColor.size % AREA_PALETTE.length]);
        areaOrder.push({ workAreaId: job.workAreaId, workAreaName: job.workAreaName });
      }
    }
  }
  const colorOf = (workAreaId: string) => areaColor.get(workAreaId) ?? "#64748b";
  const areaOptions: AreaOption[] = areaOrder.map((a) => ({ ...a, color: colorOf(a.workAreaId) }));

  // 部屋ボックス用のカード群と容量バッジ
  const capMap = new Map<string, number>(
    (result?.workAreaCapacities ?? []).map((c) => [c.workAreaId, c.maxPeopleCount]),
  );
  const cardsByArea = new Map<string, WorkCard[]>();
  const idleCards: IdleCard[] = [];
  const peakByArea = new Map<string, number>();
  if (allocation) {
    for (const emp of allocation.employees) {
      emp.segments.forEach((seg, i) => {
        const card: WorkCard = {
          kind: "work",
          key: `${emp.employeeId}-w-${i}`,
          employeeId: emp.employeeId,
          employeeName: emp.employeeName,
          startTime: seg.startTime,
          endTime: seg.endTime,
          workAreaId: seg.workAreaId,
          productName: seg.productName,
          pinned: isPinned(pins, emp.employeeId, seg.startTime, seg.endTime, seg.workAreaId),
        };
        const list = cardsByArea.get(seg.workAreaId) ?? [];
        list.push(card);
        cardsByArea.set(seg.workAreaId, list);
      });
      emp.idleSegments.forEach((seg, i) => {
        idleCards.push({
          kind: "idle",
          key: `${emp.employeeId}-i-${i}`,
          employeeId: emp.employeeId,
          employeeName: emp.employeeName,
          startTime: seg.startTime,
          endTime: seg.endTime,
          reason: seg.reason,
        });
      });
    }
    const byStartThenName = (
      a: { startTime: string; employeeName: string },
      b: { startTime: string; employeeName: string },
    ) => a.startTime.localeCompare(b.startTime) || a.employeeName.localeCompare(b.employeeName);
    for (const list of cardsByArea.values()) list.sort(byStartThenName);
    idleCards.sort(byStartThenName);
    for (const area of areaOrder) {
      let peak = 0;
      for (const job of allocation.jobs) {
        if (job.workAreaId !== area.workAreaId) continue;
        for (const seg of job.peopleSegments) peak = Math.max(peak, seg.peopleCount);
      }
      peakByArea.set(area.workAreaId, peak);
    }
  }

  const winStart = allocation ? hm(allocation.dayStart) : hm(dayStart);
  const winEnd = allocation ? hm(allocation.dayEnd) : hm(dayEnd);
  const span = Math.max(1, winEnd - winStart);
  const ticks: number[] = [];
  for (let m = Math.ceil(winStart / 60) * 60; m <= winEnd; m += 60) ticks.push(m);
  const ganttHours = span / 60;
  const ganttMinWidth = pxPerHour > 0 ? Math.round(132 + pxPerHour * ganttHours) : undefined;
  const ganttInnerStyle = {
    "--gantt-cols": Math.max(1, Math.round(span / 60)),
    minWidth: ganttMinWidth ? `${ganttMinWidth}px` : undefined,
  } as CSSProperties;
  const ganttClass = `gantt${wrapLabels ? " gantt--wrap" : ""}`;

  const barPos = (startTime: string, endTime: string) => {
    const left = clamp(((hm(startTime) - winStart) / span) * 100, 0, 100);
    const width = clamp(((hm(endTime) - hm(startTime)) / span) * 100, 0, 100 - left);
    return { left: `${left}%`, width: `${width}%` };
  };

  const utilPct = summary && summary.totalAvailableMinutes > 0
    ? Math.round((summary.totalWorkingMinutes / summary.totalAvailableMinutes) * 100)
    : 0;
  const resultStatusLabel = persisted ? "保存済み" : result ? "プレビュー" : "未計算";
  const resultStatusClass = persisted ? "success" : result ? "info" : "muted";
  const movedJobCount = allocation?.jobs.filter((job) => (job.originalWorkAreaId ?? job.workAreaId) !== job.workAreaId).length ?? 0;
  const overflowJobCount = allocation?.jobs.filter((job) => job.overflowQuantity > 0).length ?? 0;
  const jobWarningCount = allocation?.jobs.reduce((total, job) => total + job.warnings.length, 0) ?? 0;
  const skippedPlanCount = result?.skippedPlans.length ?? 0;
  const allocationWarningCount = allocation?.warnings.length ?? 0;
  const bottleneckAlertCount = summary?.capacityBottleneck ? 1 : 0;
  const totalAlertCount = overflowJobCount + jobWarningCount + skippedPlanCount + allocationWarningCount + bottleneckAlertCount;
  const manualAdjustmentCount = pins.length + workAreaOverrides.length;
  const readinessLabel = !result ? "未計算" : totalAlertCount > 0 ? "確認が必要" : persisted ? "保存済み" : "保存できます";
  const readinessClass = !result ? "muted" : totalAlertCount > 0 ? "warn" : persisted ? "success" : "info";
  const today = toDateInputValue(new Date());
  const previousDate = shiftDate(date, -1);
  const nextDate = shiftDate(date, 1);
  const reviewQueues = [
    { key: "room" as View, label: "部屋ボード", count: areaOrder.length },
    { key: "people" as View, label: "人タイムライン", count: summary?.idleStaffCount ?? 0 },
    { key: "jobs" as View, label: "商品別確認", count: totalAlertCount },
    { key: "board" as View, label: "部屋ボックス", count: manualAdjustmentCount },
  ];

  return (
    <>
      <div className="page-title-row allocation-title-row">
        <h1>
          当日 人員割り当て
          <HelpTooltip text="確定済みの生産予定と当日の出勤シフトをもとに、出勤者全員を作業場所へ割り当てます。部屋レーンと人タイムラインで、誰がどの部屋で何時から何を作るかを確認できます。" />
        </h1>
        <div className="page-title-actions allocation-title-actions">
          <Link className="button-link secondary-link" href={kitagoyaPath(`/shifts?date=${date}`)}>
            シフトを確認
          </Link>
          <Link className="button-link secondary-link" href={kitagoyaPath(`/production-plans?date=${date}`)}>
            生産予定を確認
          </Link>
        </div>
      </div>

      <div className="panel allocation-control-panel">
        <div className="allocation-control-main">
          <div className="allocation-control-fields">
            <label className="allocation-field">
              <span>対象日</span>
              <input type="date" value={date} onChange={(e) => handleDateChange(e.target.value)} />
            </label>
            <label className="allocation-field">
              <span>開始</span>
              <input type="time" value={dayStart} onChange={(e) => changeDayStart(e.target.value)} />
            </label>
            <label className="allocation-field">
              <span>基準終了</span>
              <input type="time" value={dayEnd} onChange={(e) => changeDayEnd(e.target.value)} />
            </label>
          </div>
          <div className="allocation-control-actions">
            <button type="button" onClick={() => call(false)} disabled={loading}>
              {loading ? "計算中…" : "割り当てプレビュー"}
            </button>
            <button type="button" onClick={() => call(true)} disabled={loading || !result}>
              この割り当てを保存
            </button>
          </div>
        </div>
        <div className="allocation-control-status">
          <span className={`badge ${resultStatusClass}`}>{resultStatusLabel}</span>
          {summary ? (
            <span className="subtext">
              出勤者 {summary.totalStaff}名 / 稼働率 {utilPct}% / 手すき {summary.idleStaffCount}名
            </span>
          ) : (
            <span className="subtext">対象日と時間を指定してプレビュー</span>
          )}
          <div className="allocation-date-jump" aria-label="対象日の移動">
            <button type="button" className="ghost-button" onClick={() => handleDateChange(previousDate)} disabled={loading}>
              前日
            </button>
            <button type="button" className="ghost-button" onClick={() => handleDateChange(today)} disabled={loading}>
              今日
            </button>
            <button type="button" className="ghost-button" onClick={() => handleDateChange(nextDate)} disabled={loading}>
              翌日
            </button>
          </div>
        </div>
        {result && summary && (
          <div className="allocation-check-strip">
            <div className="allocation-readiness">
              <span className={`badge ${readinessClass}`}>{readinessLabel}</span>
              <strong>保存前チェック</strong>
              <span className="subtext">
                手動調整 {manualAdjustmentCount}件 / 商品部屋変更 {workAreaOverrides.length}件
              </span>
            </div>
            <div className="allocation-check-metrics">
              <span>
                警告 <strong>{totalAlertCount}</strong>
              </span>
              <span>
                未完了 <strong>{overflowJobCount}</strong>
              </span>
              <span>
                商品移動 <strong>{movedJobCount}</strong>
              </span>
              <span>
                能力未登録 <strong>{skippedPlanCount}</strong>
              </span>
            </div>
            <div className="allocation-check-actions">
              <button type="button" className="ghost-button" onClick={() => setView("jobs")} disabled={loading}>
                商品別を確認
              </button>
              <button type="button" className="ghost-button" onClick={() => setView("board")} disabled={loading}>
                部屋ボックス
              </button>
              {workAreaOverrides.length > 0 && (
                <button type="button" className="ghost-button" onClick={clearWorkAreaOverrides} disabled={loading}>
                  部屋変更を戻す
                </button>
              )}
              {pins.length > 0 && (
                <button type="button" className="ghost-button" onClick={clearPins} disabled={loading}>
                  手動固定を戻す
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {error && <div className="alert danger">エラー: {error}</div>}
      {!result && (
        <div className="panel allocation-start-guide">
          <div className="allocation-start-main">
            <span className="badge muted">未計算</span>
            <strong>{date} の割り当て準備</strong>
            <span>確定済みの生産予定と出勤シフトを確認してから、割り当てプレビューを作成します。</span>
          </div>
          <div className="allocation-start-steps">
            <span>
              <strong>1</strong>
              生産予定
            </span>
            <span>
              <strong>2</strong>
              シフト
            </span>
            <span>
              <strong>3</strong>
              プレビュー
            </span>
            <span>
              <strong>4</strong>
              保存・印刷
            </span>
          </div>
          <div className="allocation-start-actions">
            <Link className="button-link secondary-link" href={kitagoyaPath(`/production-plans?date=${date}`)}>
              生産予定を確認
            </Link>
            <Link className="button-link secondary-link" href={kitagoyaPath(`/shifts?date=${date}`)}>
              シフトを確認
            </Link>
            <button type="button" onClick={() => call(false)} disabled={loading}>
              {loading ? "計算中…" : "プレビュー開始"}
            </button>
          </div>
        </div>
      )}
      {savedMessage && (
        <div className="alert success allocation-save-alert">
          <span>{savedMessage}</span>
          <div className="allocation-print-actions">
            <Link className="button-link secondary-link" href={kitagoyaPath(`/prints/staff-assignments?date=${date}`)}>
              スタッフ配置を印刷
            </Link>
            <Link className="button-link secondary-link" href={kitagoyaPath(`/prints/production-schedule?date=${date}`)}>
              生産スケジュールを印刷
            </Link>
          </div>
        </div>
      )}

      {result && allocation && summary && (
        <>
          <div className="panel allocation-summary-panel">
            <div className="allocation-summary-head">
              <h2>判断サマリ</h2>
              <div className="allocation-summary-status">
                <span className={`badge ${persisted ? "success" : "info"}`}>{persisted ? "保存済み" : "プレビュー"}</span>
                {!persisted && <HelpTooltip text="この割り当てを保存すると確定し、印刷へ進めます。" />}
              </div>
            </div>
            <div className="stat-grid allocation-stat-grid">
              <Metric label="出勤者" value={`${summary.totalStaff} 名`} />
              <Metric label="手すき人数" value={`${summary.idleStaffCount} 名${summary.fullyUtilized ? "（全員フル稼働）" : ""}`} />
              <Metric label="稼働 / 待機" value={`${summary.totalWorkingMinutes} 分 / ${summary.totalIdleMinutes} 分`} />
              <div className="metric">
                <div className="metric-label">稼働率 {utilPct}%</div>
                <div className="util-bar">
                  <div className="util-bar-fill" style={{ width: `${utilPct}%` }} />
                </div>
              </div>
            </div>
            {allocation.warnings.length > 0 && (
              <div className="allocation-warning-list">
                {allocation.warnings.map((w, i) => (
                  <div key={i} className={`alert ${summary.capacityBottleneck ? "warn" : "info"} allocation-inline-alert`}>
                    注意: {w}
                  </div>
                ))}
              </div>
            )}
            {result.skippedPlans.length > 0 && (
              <div className="alert warn allocation-inline-alert">
                能力未登録でスキップした予定:
                <ul className="allocation-alert-list">
                  {result.skippedPlans.map((p) => (
                    <li key={p.planId}>
                      {p.productName}: {p.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <AreaLegend areas={areaOrder} colorOf={colorOf} />
          </div>

          <div className="allocation-review-queue" aria-label="割り当てレビューキュー">
            {reviewQueues.map((queue) => (
              <button
                key={queue.key}
                type="button"
                className={`${view === queue.key ? "is-active" : ""} ${queue.key === "jobs" && queue.count > 0 ? "warn" : ""}`}
                onClick={() => setView(queue.key)}
              >
                <span>{queue.label}</span>
                <strong>{queue.count}</strong>
              </button>
            ))}
          </div>

          <div className="toolbar alloc-view-tabs">
            <div className="alloc-view-toggle">
              <button type="button" className={view === "room" ? "is-active" : ""} onClick={() => setView("room")}>
                部屋ボード
              </button>
              <button type="button" className={view === "people" ? "is-active" : ""} onClick={() => setView("people")}>
                人タイムライン
              </button>
              <button type="button" className={view === "jobs" ? "is-active" : ""} onClick={() => setView("jobs")}>
                商品ごとの割り当て
              </button>
              <button type="button" className={view === "board" ? "is-active" : ""} onClick={() => setView("board")}>
                部屋ボックス
              </button>
            </div>
            {(view === "room" || view === "people") && (
              <>
                <div className="spacer" />
                <label className="gantt-control">
                  時間スケール
                  <input
                    type="range"
                    min={0}
                    max={300}
                    step={20}
                    value={pxPerHour}
                    onChange={(e) => setPxPerHour(Number(e.target.value))}
                  />
                  <span className="subtext">{pxPerHour === 0 ? "画面幅に合わせる" : `${pxPerHour}px/時・横スクロール`}</span>
                </label>
                <label className="gantt-control">
                  <input type="checkbox" checked={wrapLabels} onChange={(e) => setWrapLabels(e.target.checked)} />
                  ラベル折返し（2行）
                </label>
              </>
            )}
          </div>

          {view === "room" && (
            <div className="card">
              <h2>部屋ボード（部屋 × 時間）</h2>
              <div className={ganttClass}>
                <div className="gantt-inner" style={ganttInnerStyle}>
                  <TimeAxis ticks={ticks} winStart={winStart} span={span} />
                  {areaOrder.length === 0 && <div className="empty-state">割り当てられた作業がありません。</div>}
                  {areaOrder.map((area) => {
                    const jobs = allocation.jobs.filter(
                      (j) => j.workAreaId === area.workAreaId && j.startTime && j.endTime,
                    );
                    return (
                      <div className="gantt-row" key={area.workAreaId}>
                        <div className="gantt-label">{area.workAreaName}</div>
                        <div className="gantt-track">
                          {jobs.map((job) => {
                            const people = Math.max(0, ...job.peopleSegments.map((s) => s.peopleCount));
                            return (
                              <div
                                key={job.jobId}
                                className="gantt-bar"
                                style={{ ...barPos(job.startTime!, job.endTime!), background: colorOf(job.workAreaId) }}
                                title={`${job.startTime}–${job.endTime} ${job.productName} ${people}人 / 予定${job.scheduledQuantity}${job.unit}`}
                              >
                                <span>{job.productName}</span>
                                <span className="gantt-bar-sub">{people}人</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {view === "people" && (
            <div className="card">
              <h2>人タイムライン（人 × 時間）</h2>
              <div className={ganttClass}>
                <div className="gantt-inner" style={ganttInnerStyle}>
                  <TimeAxis ticks={ticks} winStart={winStart} span={span} />
                  {allocation.employees.map((emp) => (
                    <div className="gantt-row" key={emp.employeeId}>
                      <div className="gantt-label">
                        {emp.employeeName}
                        <span className="subtext">
                          {emp.shiftStartTime}–{emp.shiftEndTime}
                          {emp.idleMinutes > 0 ? ` ・手すき${emp.idleMinutes}分` : ""}
                        </span>
                      </div>
                      <div className="gantt-track">
                        <div
                          className="gantt-shift-bg"
                          style={barPos(emp.shiftStartTime, emp.shiftEndTime)}
                        />
                        {emp.segments.map((seg, i) => (
                          <div
                            key={`w-${i}`}
                            className="gantt-bar"
                            style={{ ...barPos(seg.startTime, seg.endTime), background: colorOf(seg.workAreaId) }}
                            title={`${seg.startTime}–${seg.endTime} ${seg.workAreaName} / ${seg.productName}`}
                          >
                            <span>{seg.productName}</span>
                          </div>
                        ))}
                        {emp.idleSegments.map((seg, i) => (
                          <div
                            key={`i-${i}`}
                            className="gantt-bar is-idle"
                            style={barPos(seg.startTime, seg.endTime)}
                            title={`${seg.startTime}–${seg.endTime} 手すき（${idleReasonLabel[seg.reason]}）`}
                          >
                            手すき
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {view === "jobs" && (
            <div className="card">
              <div className="toolbar">
                <h2 style={{ margin: 0 }}>商品ごとの割り当て</h2>
                <div className="spacer" />
                {workAreaOverrides.length > 0 && (
                  <>
                    <span className="subtext">商品部屋変更 {workAreaOverrides.length}件</span>
                    <button type="button" className="ghost-button" onClick={clearWorkAreaOverrides} disabled={loading}>
                      商品の部屋変更を戻す
                    </button>
                  </>
                )}
              </div>
              <div className="table-frame">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>商品</th>
                      <th>作業場所（商品移動）</th>
                      <th>時間</th>
                      <th>人数推移</th>
                      <th>予定数量</th>
                      <th>見込み</th>
                      <th>あふれ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocation.jobs.map((job) => {
                      const options = workAreaChoicesFor(job);
                      const selectedWorkAreaId =
                        workAreaOverrides.find((override) => override.planId === job.jobId)?.workAreaId ?? job.workAreaId;
                      const moved = (job.originalWorkAreaId ?? job.workAreaId) !== job.workAreaId;
                      const hasJobWarning = job.warnings.length > 0 || job.overflowQuantity > 0;
                      return (
                        <tr key={job.jobId} className={`alloc-job-row${moved ? " is-moved" : ""}${hasJobWarning ? " has-warning" : ""}`}>
                          <td>
                            <div className="alloc-job-product">
                              <strong>{job.productName}</strong>
                              {(moved || hasJobWarning) && (
                                <div className="alloc-job-badges">
                                  {moved && <span className="badge info">部屋変更</span>}
                                  {job.warnings.length > 0 && <span className="badge warn">注意 {job.warnings.length}</span>}
                                  {job.overflowQuantity > 0 && <span className="badge warn">未完了あり</span>}
                                </div>
                              )}
                              {job.warnings.length > 0 && (
                                <div className="alloc-job-warning-text">{job.warnings.join(" / ")}</div>
                              )}
                            </div>
                          </td>
                          <td>
                            <div className="alloc-room-cell">
                              <span className="gantt-legend-swatch" style={{ background: colorOf(job.workAreaId) }} />
                              <SearchableCombobox
                                ariaLabel={`${job.productName}の作業場所`}
                                value={selectedWorkAreaId}
                                options={options.map((option) => ({
                                  value: option.workAreaId,
                                  label: option.workAreaName,
                                }))}
                                placeholder="作業場所名で検索"
                                onChange={(workAreaId) => changeJobWorkArea(job, workAreaId)}
                                disabled={loading || options.length <= 1}
                              />
                              {moved && job.originalWorkAreaName && (
                                <span className="badge info">元: {job.originalWorkAreaName}</span>
                              )}
                            </div>
                          </td>
                          <td>
                            {job.startTime ?? "—"}〜{job.endTime ?? "—"}
                          </td>
                          <td>
                            {job.peopleSegments.map((s) => `${s.startTime}-${s.endTime}:${s.peopleCount}人`).join(" / ") || "未配置"}
                          </td>
                          <td>
                            {job.requestedQuantity}
                            {job.unit}
                          </td>
                          <td>
                            {job.scheduledQuantity}
                            {job.unit}
                          </td>
                          <td style={{ color: job.overflowQuantity > 0 ? "var(--warn)" : undefined }}>
                            {job.overflowQuantity > 0 ? `${job.overflowQuantity}${job.unit}` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {view === "board" && (
            <div className="card">
              <div className="toolbar">
                <h2 style={{ margin: 0 }}>
                  部屋ボックス
                  <HelpTooltip text="各カードは人と作業時間帯です。カードをクリックして配置先の部屋を選ぶか、別の部屋ボックスへドラッグすると、その時間帯はその部屋に固定され、残りは自動で再配置します。手すき・未割当へ戻すと固定を解除します。" />
                </h2>
                <div className="spacer" />
                {pins.length > 0 && (
                  <>
                    <span className="subtext">手動ピン {pins.length}件</span>
                    <button type="button" className="ghost-button" onClick={clearPins} disabled={loading}>
                      すべて自動に戻す
                    </button>
                  </>
                )}
              </div>
              <div className="alloc-board">
                {areaOptions.map((area) => {
                  const cards = cardsByArea.get(area.workAreaId) ?? [];
                  const peak = peakByArea.get(area.workAreaId) ?? 0;
                  const cap = capMap.get(area.workAreaId);
                  const overCap = cap != null && peak > cap;
                  return (
                    <AllocBox
                      key={area.workAreaId}
                      name={area.workAreaName}
                      color={area.color}
                      capText={cap != null ? `ピーク ${peak} / 上限 ${cap}人` : `ピーク ${peak}人`}
                      overCap={overCap}
                      active={dragOverZone === area.workAreaId}
                      onDragEnterZone={() => setDragOverZone(area.workAreaId)}
                      onDragLeaveZone={() => setDragOverZone(null)}
                      onDropChip={(chip) => {
                        setDragOverZone(null);
                        dropChipOnZone(chip, area.workAreaId, area.workAreaName);
                      }}
                    >
                      {cards.length === 0 && <div className="alloc-box-empty">割り当てなし</div>}
                      {cards.map((card) => (
                        <PersonCard
                          key={card.key}
                          card={card}
                          color={area.color}
                          areas={areaOptions}
                          currentAreaId={card.workAreaId}
                          isOpen={openCardKey === card.key}
                          onToggle={() => setOpenCardKey((prev) => (prev === card.key ? null : card.key))}
                          onAssign={(zoneId, zoneName) => assignCard(card, zoneId, zoneName)}
                        />
                      ))}
                    </AllocBox>
                  );
                })}

                <AllocBox
                  idle
                  name="手すき・未割当"
                  capText={`${idleCards.length}件`}
                  active={dragOverZone === UNPIN_ZONE}
                  onDragEnterZone={() => setDragOverZone(UNPIN_ZONE)}
                  onDragLeaveZone={() => setDragOverZone(null)}
                  onDropChip={(chip) => {
                    setDragOverZone(null);
                    dropChipOnZone(chip, UNPIN_ZONE, "");
                  }}
                >
                  {idleCards.length === 0 && <div className="alloc-box-empty">手すきなし（全員稼働）</div>}
                  {idleCards.map((card) => (
                    <PersonCard
                      key={card.key}
                      card={card}
                      areas={areaOptions}
                      currentAreaId={null}
                      isOpen={openCardKey === card.key}
                      onToggle={() => setOpenCardKey((prev) => (prev === card.key ? null : card.key))}
                      onAssign={(zoneId, zoneName) => assignCard(card, zoneId, zoneName)}
                    />
                  ))}
                </AllocBox>
              </div>

              {openCardKey && <div className="alloc-menu-backdrop" onClick={() => setOpenCardKey(null)} />}
            </div>
          )}
        </>
      )}
    </>
  );
}

function workAreaChoicesFor(job: AllocationResult["jobs"][number]) {
  const choices: { workAreaId: string; workAreaName: string }[] = [];
  const seen = new Set<string>();
  const add = (workAreaId: string | undefined, workAreaName: string | undefined) => {
    if (!workAreaId || !workAreaName || seen.has(workAreaId)) return;
    choices.push({ workAreaId, workAreaName });
    seen.add(workAreaId);
  };

  add(job.originalWorkAreaId, job.originalWorkAreaName);
  add(job.workAreaId, job.workAreaName);
  for (const option of job.workAreaOptions ?? []) add(option.workAreaId, option.workAreaName);
  return choices;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
    </div>
  );
}

function TimeAxis({ ticks, winStart, span }: { ticks: number[]; winStart: number; span: number }) {
  return (
    <div className="gantt-axis">
      <div className="gantt-axis-spacer" />
      <div className="gantt-axis-scale">
        {ticks.map((m) => (
          <div key={m} className="gantt-tick" style={{ left: `${((m - winStart) / span) * 100}%` }}>
            {String(Math.floor(m / 60)).padStart(2, "0")}:{String(m % 60).padStart(2, "0")}
          </div>
        ))}
      </div>
    </div>
  );
}

function AreaLegend({
  areas,
  colorOf,
}: {
  areas: { workAreaId: string; workAreaName: string }[];
  colorOf: (id: string) => string;
}) {
  if (areas.length === 0) return null;
  return (
    <div className="gantt-legend">
      {areas.map((a) => (
        <span key={a.workAreaId} className="gantt-legend-item">
          <span className="gantt-legend-swatch" style={{ background: colorOf(a.workAreaId) }} />
          {a.workAreaName}
        </span>
      ))}
      <span className="gantt-legend-item">
        <span className="gantt-legend-swatch is-idle" style={{ background: "#fdba74" }} />
        手すき
      </span>
    </div>
  );
}

function isPinned(pins: Pin[], employeeId: string, start: string, end: string, workAreaId: string) {
  return pins.some(
    (p) => p.employeeId === employeeId && p.startTime === start && p.endTime === end && p.workAreaId === workAreaId,
  );
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftDate(date: string, days: number) {
  const target = new Date(`${date}T00:00:00`);
  target.setDate(target.getDate() + days);
  return toDateInputValue(target);
}

function AllocBox({
  name,
  color,
  idle,
  capText,
  overCap,
  active,
  onDragEnterZone,
  onDragLeaveZone,
  onDropChip,
  children,
}: {
  name: string;
  color?: string;
  idle?: boolean;
  capText?: string;
  overCap?: boolean;
  active: boolean;
  onDragEnterZone: () => void;
  onDragLeaveZone: () => void;
  onDropChip: (chip: DragChip) => void;
  children: ReactNode;
}) {
  return (
    <div
      className={`alloc-box${idle ? " is-idle" : ""}${active ? " is-over" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onDragEnterZone();
      }}
      onDragLeave={onDragLeaveZone}
      onDrop={(e) => {
        e.preventDefault();
        const raw = e.dataTransfer.getData("application/json");
        if (!raw) return;
        try {
          onDropChip(JSON.parse(raw) as DragChip);
        } catch {
          /* ignore malformed payload */
        }
      }}
    >
      <div className="alloc-box-head">
        {!idle && color && <span className="alloc-swatch" style={{ background: color }} />}
        <span>{name}</span>
        {capText && <span className={`alloc-box-cap${overCap ? " is-over-cap" : ""}`}>{capText}</span>}
      </div>
      <div className="alloc-box-body">{children}</div>
    </div>
  );
}

function PersonCard({
  card,
  color,
  areas,
  currentAreaId,
  isOpen,
  onToggle,
  onAssign,
}: {
  card: WorkCard | IdleCard;
  color?: string;
  areas: AreaOption[];
  currentAreaId: string | null;
  isOpen: boolean;
  onToggle: () => void;
  onAssign: (zoneId: string, zoneName: string) => void;
}) {
  const isIdle = card.kind === "idle";
  const pinned = card.kind === "work" && card.pinned;
  return (
    <div
      className={`alloc-card${pinned ? " is-pinned" : ""}${isIdle ? " is-idle" : ""}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(
          "application/json",
          JSON.stringify({
            employeeId: card.employeeId,
            employeeName: card.employeeName,
            startTime: card.startTime,
            endTime: card.endTime,
          }),
        );
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      title="クリックで配置先を選択 / ドラッグで部屋へ移動"
    >
      <div className="alloc-card-name">
        {pinned && "📌 "}
        {!isIdle && color && <span className="alloc-swatch" style={{ background: color }} />}
        {card.employeeName}
      </div>
      <div className="alloc-card-sub">
        {card.startTime}–{card.endTime}
        {card.kind === "idle" ? `・手すき(${idleReasonLabel[card.reason]})` : `・${card.productName}`}
      </div>
      {isOpen && (
        <div className="alloc-card-menu" onClick={(e) => e.stopPropagation()}>
          <div className="alloc-card-menu-head">配置先を選ぶ</div>
          {areas.map((a) => (
            <button
              key={a.workAreaId}
              type="button"
              className={a.workAreaId === currentAreaId ? "is-current" : ""}
              disabled={a.workAreaId === currentAreaId}
              onClick={() => onAssign(a.workAreaId, a.workAreaName)}
            >
              <span className="alloc-swatch" style={{ background: a.color }} />
              {a.workAreaName}
              {a.workAreaId === currentAreaId ? "（現在）" : ""}
            </button>
          ))}
          <button type="button" className="alloc-menu-unpin" onClick={() => onAssign(UNPIN_ZONE, "")}>
            ↩ 自動に戻す（未割当）
          </button>
        </div>
      )}
    </div>
  );
}
