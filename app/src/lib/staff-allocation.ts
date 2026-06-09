// 当日人員割り当てエンジン（遊休ゼロ志向）
//
// 目的:
//   「作るべき商品と数量」と「出勤シフト」を入力に、出勤者全員を作業場所へ
//   時間スライスで割り当てる。標準人数しか割り当てず余剰人員が宙ぶらりんに
//   なる従来方式を置き換える。
//
// 守るルール:
//   - 1作業場所では同時刻に1商品のみ（部屋ごとにジョブを逐次処理する）。
//   - 部屋ごとの同時人数上限 (roomMaxPeople) を超えない。
//   - 出勤シフト時間内・休憩時間外でのみ作業する。
//   - 余剰人員はまだ仕事が残っている部屋へ詰め、作業が終わった部屋からは
//     別部屋へ「合流」させる。仕事が無い／部屋が満員でやむなく待機する場合は
//     その時間と理由を idleSegments として明示する。
//
// すべて純関数。DB/HTTP はここに持ち込まない（calculations の型のみ参照）。

import type { BreakWindow } from "./calculations";
import { formatHM, parseHM } from "./time";

export type AllocationStaff = {
  employeeId: string;
  employeeName: string;
  /** 出勤開始 HH:MM */
  startTime: string;
  /** 出勤終了 HH:MM */
  endTime: string;
  /**
   * すでに別予定などで塞がっている時間帯。この時間帯は割り当て対象外（休憩とは別概念）。
   * 月間シミュレーションが「既存の確定予定に入っている人」を二重割当しないために使う。
   * 未指定なら常に在席扱い。
   */
  unavailableWindows?: { startTime: string; endTime: string }[];
};

export type AllocationJob = {
  /** 同一商品でも別ジョブになり得るため一意なID（生産予定IDやプレビューID） */
  jobId: string;
  productId: string;
  productName: string;
  workAreaId: string;
  workAreaName: string;
  /** DB上の元の作業場所。プレビューで商品を別部屋へ動かした場合の表示に使う。 */
  originalWorkAreaId?: string;
  originalWorkAreaName?: string;
  /** 当日画面で商品を移動できる作業場所候補。 */
  workAreaOptions?: { workAreaId: string; workAreaName: string }[];
  workAreaDisplayOrder?: number;
  /** 作るべき数量 */
  quantity: number;
  unit: string;
  /** 1時間1人あたり生産量 */
  unitsPerPersonHour: number;
  /** 部屋の同時人数上限 */
  roomMaxPeople: number;
  /** この部屋が空く時刻（既存予定などで占有されている場合）HH:MM */
  earliestStart?: string;
};

/**
 * 手動ピン留め: 指定時間帯 [startTime, endTime) はこの従業員をこの作業場所に固定する。
 * 当日割り当て画面でのドラッグ微調整に使う。ピンされた人は自動配置の対象外になり、
 * ピン先の部屋に仕事が無い時間帯は手すき扱いになる（部屋上限は手動指定として超過を許容）。
 */
export type PinnedAssignment = {
  employeeId: string;
  workAreaId: string;
  startTime: string;
  endTime: string;
};

export type AllocationInput = {
  /** 当日の作業開始基準 HH:MM */
  dayStart: string;
  /** 当日の基準終了 HH:MM（これを超える分は残業/翌日繰越候補） */
  dayEnd: string;
  /** 時間刻み（分）。既定 5 */
  stepMinutes?: number;
  /** 休憩時間帯（全員作業停止）。未指定なら休憩なし扱い */
  breakWindows?: BreakWindow[];
  staff: AllocationStaff[];
  jobs: AllocationJob[];
  /** 手動ピン留め（任意）。指定があればその人・時間帯は固定配置する。 */
  pinnedAssignments?: PinnedAssignment[];
};

export type PeopleSegment = { startTime: string; endTime: string; peopleCount: number };

export type JobAllocation = {
  jobId: string;
  productId: string;
  productName: string;
  workAreaId: string;
  workAreaName: string;
  originalWorkAreaId?: string;
  originalWorkAreaName?: string;
  workAreaOptions?: { workAreaId: string; workAreaName: string }[];
  unit: string;
  requestedQuantity: number;
  /** 当日に実際に作れる見込み数量 */
  scheduledQuantity: number;
  /** 作りきれずに残る数量（基準終了内に収まらない分） */
  overflowQuantity: number;
  /** 最初に人が入る時刻 */
  startTime: string | null;
  /** 最後に人が抜ける時刻 */
  endTime: string | null;
  peopleSegments: PeopleSegment[];
  assignments: { employeeId: string; employeeName: string; startTime: string; endTime: string }[];
  warnings: string[];
};

export type IdleReason = "no_remaining_work" | "room_capacity_full";

export type EmployeeWorkSegment = {
  jobId: string;
  productName: string;
  workAreaId: string;
  workAreaName: string;
  startTime: string;
  endTime: string;
};

export type EmployeeIdleSegment = { startTime: string; endTime: string; reason: IdleReason };

export type EmployeeTimeline = {
  employeeId: string;
  employeeName: string;
  shiftStartTime: string;
  shiftEndTime: string;
  segments: EmployeeWorkSegment[];
  idleSegments: EmployeeIdleSegment[];
  /** 実作業分 */
  workingMinutes: number;
  /** 仕事がなく/部屋満員で待機した分 */
  idleMinutes: number;
  /** 休憩分 */
  breakMinutes: number;
};

export type AllocationSummary = {
  totalStaff: number;
  /** 出勤者の延べ在席分（休憩除く） */
  totalAvailableMinutes: number;
  totalWorkingMinutes: number;
  totalIdleMinutes: number;
  /** 1分でも遊休のあった人数 */
  idleStaffCount: number;
  /** 遊休がまったく無いか */
  fullyUtilized: boolean;
  /** 部屋上限により仕事が残っているのに待機が発生したか（増員/部屋の問題） */
  capacityBottleneck: boolean;
  /** 作りきれない数量が発生したか */
  hasOverflow: boolean;
};

export type AllocationResult = {
  dayStart: string;
  dayEnd: string;
  stepMinutes: number;
  jobs: JobAllocation[];
  employees: EmployeeTimeline[];
  summary: AllocationSummary;
  warnings: string[];
};

type JobState = {
  job: AllocationJob;
  /** 必要な延べ作業分（person-minutes） */
  neededPersonMinutes: number;
  /** 投入済みの延べ作業分 */
  spentPersonMinutes: number;
  earliestStartMin: number;
};

type RoomState = {
  workAreaId: string;
  workAreaName: string;
  displayOrder: number;
  roomMaxPeople: number;
  /** この部屋のジョブ列（投入順） */
  queue: JobState[];
  cursor: number;
};

type StaffState = {
  staff: AllocationStaff;
  shiftStart: number;
  shiftEnd: number;
  /** 別予定などで塞がっている時間帯（分） */
  unavailable: { start: number; end: number }[];
  /** 直近に割り当てられていた部屋（合流の安定化に使う） */
  currentRoomId: string | null;
};

const ROUND = 1e6;

export function allocateDayStaff(input: AllocationInput): AllocationResult {
  const step = Math.max(1, Math.floor(input.stepMinutes ?? 5));
  const dayStartMin = parseHM(input.dayStart);
  const dayEndMin = parseHM(input.dayEnd);
  const breaks = (input.breakWindows ?? []).map((w) => ({ start: parseHM(w.startTime), end: parseHM(w.endTime) }));

  const rooms = buildRooms(input.jobs, dayStartMin);
  const staffStates: StaffState[] = input.staff
    .map((staff) => ({
      staff,
      shiftStart: parseHM(staff.startTime),
      shiftEnd: parseHM(staff.endTime),
      unavailable: (staff.unavailableWindows ?? [])
        .map((w) => ({ start: parseHM(w.startTime), end: parseHM(w.endTime) }))
        .filter((w) => w.end > w.start),
      currentRoomId: null as string | null,
    }))
    .filter((s) => s.shiftEnd > s.shiftStart)
    .sort((a, b) => a.shiftStart - b.shiftStart || a.staff.employeeName.localeCompare(b.staff.employeeName, "ja"));

  // 手動ピン: 従業員ID -> {start,end,roomId}[]
  const validRoomIds = new Set(rooms.map((r) => r.workAreaId));
  const pinsByEmp = new Map<string, { start: number; end: number; roomId: string }[]>();
  for (const pin of input.pinnedAssignments ?? []) {
    if (!validRoomIds.has(pin.workAreaId)) continue;
    const start = parseHM(pin.startTime);
    const end = parseHM(pin.endTime);
    if (end <= start) continue;
    const arr = pinsByEmp.get(pin.employeeId) ?? [];
    arr.push({ start, end, roomId: pin.workAreaId });
    pinsByEmp.set(pin.employeeId, arr);
  }
  const pinnedRoomAt = (employeeId: string, t: number): string | null => {
    const pins = pinsByEmp.get(employeeId);
    if (!pins) return null;
    for (const p of pins) {
      if (p.start <= t && p.end >= t + step) return p.roomId;
    }
    return null;
  };

  // 集計用の記録器
  const jobPeopleSteps = new Map<string, { start: number; people: number }[]>();
  const empWorkSteps = new Map<string, { start: number; roomId: string; jobId: string }[]>();
  const empIdleSteps = new Map<string, { start: number; reason: IdleReason }[]>();
  const empBreakMinutes = new Map<string, number>();

  for (let t = dayStartMin; t + step <= dayEndMin; t += step) {
    const onBreak = breaks.some((b) => t < b.end && b.start < t + step);
    const availableStaff = staffStates.filter(
      (s) =>
        s.shiftStart <= t &&
        s.shiftEnd >= t + step &&
        !s.unavailable.some((w) => t < w.end && w.start < t + step),
    );

    if (onBreak) {
      for (const s of availableStaff) {
        empBreakMinutes.set(s.staff.employeeId, (empBreakMinutes.get(s.staff.employeeId) ?? 0) + step);
      }
      continue;
    }

    // この時刻にアクティブな部屋（空いていて、未完ジョブがある）
    const activeRooms = rooms
      .map((room) => ({ room, active: activeJob(room) }))
      .filter((r) => r.active != null && r.active!.earliestStartMin <= t)
      .map((r) => ({ room: r.room, jobState: r.active! }));

    // 部屋ごとの希望人数: 部屋上限と「このステップで使い切れる最大人数」の小さい方
    const desired = new Map<string, number>();
    for (const { room, jobState } of activeRooms) {
      const remaining = jobState.neededPersonMinutes - jobState.spentPersonMinutes;
      const maxUsefulThisStep = Math.max(1, Math.ceil(remaining / step - 1e-9));
      desired.set(room.workAreaId, Math.min(room.roomMaxPeople, maxUsefulThisStep));
    }

    const assignedCount = new Map<string, number>();
    const assignmentByEmp = new Map<string, { roomId: string; jobId: string }>();
    const pinnedEmp = new Set<string>();

    // 0) 手動ピン留め: 指定の人はピン先の部屋へ固定（部屋上限は手動指定として超過許容）。
    //    ピン先に仕事が無い時間帯はそのまま手すきにし、自動配置の対象外にする。
    for (const s of availableStaff) {
      const pinRoom = pinnedRoomAt(s.staff.employeeId, t);
      if (!pinRoom) continue;
      pinnedEmp.add(s.staff.employeeId);
      const target = activeRooms.find((r) => r.room.workAreaId === pinRoom);
      if (target) {
        assignedCount.set(pinRoom, (assignedCount.get(pinRoom) ?? 0) + 1);
        assignmentByEmp.set(s.staff.employeeId, { roomId: pinRoom, jobId: target.jobState.job.jobId });
      }
    }

    // 1) 既に入っている部屋に留まれる人はそのまま（合流のバタつき防止）
    for (const s of availableStaff) {
      if (pinnedEmp.has(s.staff.employeeId)) continue;
      const roomId = s.currentRoomId;
      if (!roomId) continue;
      const target = activeRooms.find((r) => r.room.workAreaId === roomId);
      if (!target) continue;
      const want = desired.get(roomId) ?? 0;
      const have = assignedCount.get(roomId) ?? 0;
      if (have < want) {
        assignedCount.set(roomId, have + 1);
        assignmentByEmp.set(s.staff.employeeId, { roomId, jobId: target.jobState.job.jobId });
      }
    }

    // 2) 未配置の人を、人手の足りない部屋へ詰める（残作業の多い部屋を優先＝早く空けて遊休を減らす）
    //    ピン留めされた人は自動配置の対象外。
    const placeable = availableStaff.filter(
      (s) => !assignmentByEmp.has(s.staff.employeeId) && !pinnedEmp.has(s.staff.employeeId),
    );
    for (const s of placeable) {
      const candidate = activeRooms
        .filter((r) => (assignedCount.get(r.room.workAreaId) ?? 0) < (desired.get(r.room.workAreaId) ?? 0))
        // まず各部屋へ均等に配って並行稼働させ（早く終わる→遊休が減る）、
        // 同数なら残作業の多い部屋を優先する。
        .sort((a, b) => {
          const asgA = assignedCount.get(a.room.workAreaId) ?? 0;
          const asgB = assignedCount.get(b.room.workAreaId) ?? 0;
          const remA = a.jobState.neededPersonMinutes - a.jobState.spentPersonMinutes;
          const remB = b.jobState.neededPersonMinutes - b.jobState.spentPersonMinutes;
          return asgA - asgB || remB - remA || a.room.displayOrder - b.room.displayOrder;
        })[0];
      if (!candidate) break; // これ以上入れる部屋がない
      const roomId = candidate.room.workAreaId;
      assignedCount.set(roomId, (assignedCount.get(roomId) ?? 0) + 1);
      assignmentByEmp.set(s.staff.employeeId, { roomId, jobId: candidate.jobState.job.jobId });
    }

    // 3) 生産を進める（部屋ごとに投入人数ぶん消化）
    for (const { room, jobState } of activeRooms) {
      const people = assignedCount.get(room.workAreaId) ?? 0;
      if (people <= 0) continue;
      const remaining = jobState.neededPersonMinutes - jobState.spentPersonMinutes;
      const work = Math.min(people * step, remaining);
      jobState.spentPersonMinutes = round6(jobState.spentPersonMinutes + work);
      const arr = jobPeopleSteps.get(jobState.job.jobId) ?? [];
      arr.push({ start: t, people });
      jobPeopleSteps.set(jobState.job.jobId, arr);
      if (jobState.neededPersonMinutes - jobState.spentPersonMinutes <= 1e-6) {
        room.cursor += 1; // 次のジョブへ
      }
    }

    // 4) 記録 & 遊休理由の判定
    const remainingWorkExists = rooms.some((room) => {
      const job = activeJob(room);
      return job != null && job.earliestStartMin <= t && job.neededPersonMinutes - job.spentPersonMinutes > 1e-6;
    });
    const anyRoomFullWithWork = activeRooms.some(
      (r) =>
        (assignedCount.get(r.room.workAreaId) ?? 0) >= r.room.roomMaxPeople &&
        r.jobState.neededPersonMinutes - r.jobState.spentPersonMinutes > 1e-6,
    );

    for (const s of availableStaff) {
      const emp = s.staff.employeeId;
      const placement = assignmentByEmp.get(emp);
      if (placement) {
        s.currentRoomId = placement.roomId;
        const arr = empWorkSteps.get(emp) ?? [];
        arr.push({ start: t, roomId: placement.roomId, jobId: placement.jobId });
        empWorkSteps.set(emp, arr);
      } else {
        s.currentRoomId = null;
        const reason: IdleReason = anyRoomFullWithWork && remainingWorkExists ? "room_capacity_full" : "no_remaining_work";
        const arr = empIdleSteps.get(emp) ?? [];
        arr.push({ start: t, reason });
        empIdleSteps.set(emp, arr);
      }
    }
  }

  return assembleResult({
    input,
    step,
    dayStartMin,
    dayEndMin,
    rooms,
    staffStates,
    jobPeopleSteps,
    empWorkSteps,
    empIdleSteps,
    empBreakMinutes,
  });
}

function buildRooms(jobs: AllocationJob[], dayStartMin: number): RoomState[] {
  const byRoom = new Map<string, RoomState>();
  for (const job of jobs) {
    const neededPersonMinutes =
      job.unitsPerPersonHour > 0 ? round6((job.quantity / job.unitsPerPersonHour) * 60) : 0;
    const jobState: JobState = {
      job,
      neededPersonMinutes,
      spentPersonMinutes: 0,
      earliestStartMin: job.earliestStart ? Math.max(dayStartMin, parseHM(job.earliestStart)) : dayStartMin,
    };
    const room =
      byRoom.get(job.workAreaId) ??
      ({
        workAreaId: job.workAreaId,
        workAreaName: job.workAreaName,
        displayOrder: job.workAreaDisplayOrder ?? 0,
        roomMaxPeople: Math.max(1, Math.floor(job.roomMaxPeople || 1)),
        queue: [],
        cursor: 0,
      } satisfies RoomState);
    room.roomMaxPeople = Math.max(room.roomMaxPeople, Math.max(1, Math.floor(job.roomMaxPeople || 1)));
    room.queue.push(jobState);
    byRoom.set(job.workAreaId, room);
  }
  return [...byRoom.values()].sort((a, b) => a.displayOrder - b.displayOrder || a.workAreaName.localeCompare(b.workAreaName, "ja"));
}

function activeJob(room: RoomState): JobState | null {
  // 先頭から未完のジョブを探す（cursorは完了で進む）
  for (let i = room.cursor; i < room.queue.length; i += 1) {
    const j = room.queue[i];
    if (j.neededPersonMinutes - j.spentPersonMinutes > 1e-6) {
      if (i !== room.cursor) room.cursor = i;
      return j;
    }
  }
  return null;
}

function assembleResult(ctx: {
  input: AllocationInput;
  step: number;
  dayStartMin: number;
  dayEndMin: number;
  rooms: RoomState[];
  staffStates: StaffState[];
  jobPeopleSteps: Map<string, { start: number; people: number }[]>;
  empWorkSteps: Map<string, { start: number; roomId: string; jobId: string }[]>;
  empIdleSteps: Map<string, { start: number; reason: IdleReason }[]>;
  empBreakMinutes: Map<string, number>;
}): AllocationResult {
  const { step } = ctx;
  const allJobStates = ctx.rooms.flatMap((r) => r.queue);
  const jobStateById = new Map(allJobStates.map((j) => [j.job.jobId, j]));

  // 従業員ID→名前
  const nameByEmp = new Map(ctx.staffStates.map((s) => [s.staff.employeeId, s.staff.employeeName]));

  // ジョブごとの人数セグメント・割当を組み立て
  const jobs: JobAllocation[] = allJobStates.map((jobState) => {
    const steps = (ctx.jobPeopleSteps.get(jobState.job.jobId) ?? []).sort((a, b) => a.start - b.start);
    const peopleSegments = mergePeopleSteps(steps, step);
    const scheduledQuantity = round2((jobState.spentPersonMinutes / 60) * jobState.job.unitsPerPersonHour);
    const overflow = Math.max(0, round2(jobState.job.quantity - scheduledQuantity));
    const startTime = peopleSegments.length > 0 ? peopleSegments[0].startTime : null;
    const endTime = peopleSegments.length > 0 ? peopleSegments[peopleSegments.length - 1].endTime : null;
    const warnings: string[] = [];
    if (jobState.job.unitsPerPersonHour <= 0) warnings.push("生産能力(1人1時間あたり)が未登録です");
    if (overflow > 1e-6) warnings.push(`基準終了内に作りきれず ${overflow}${jobState.job.unit} があふれます`);
    return {
      jobId: jobState.job.jobId,
      productId: jobState.job.productId,
      productName: jobState.job.productName,
      workAreaId: jobState.job.workAreaId,
      workAreaName: jobState.job.workAreaName,
      originalWorkAreaId: jobState.job.originalWorkAreaId,
      originalWorkAreaName: jobState.job.originalWorkAreaName,
      workAreaOptions: jobState.job.workAreaOptions,
      unit: jobState.job.unit,
      requestedQuantity: round2(jobState.job.quantity),
      scheduledQuantity,
      overflowQuantity: overflow,
      startTime,
      endTime,
      peopleSegments,
      assignments: [],
      warnings,
    };
  });
  const jobById = new Map(jobs.map((j) => [j.jobId, j]));

  // 従業員ごとのタイムライン
  const employees: EmployeeTimeline[] = ctx.staffStates.map((s) => {
    const emp = s.staff.employeeId;
    const workSteps = (ctx.empWorkSteps.get(emp) ?? []).sort((a, b) => a.start - b.start);
    const idleSteps = (ctx.empIdleSteps.get(emp) ?? []).sort((a, b) => a.start - b.start);
    const segments = mergeWorkSteps(workSteps, step, jobStateById);
    const idleSegments = mergeIdleSteps(idleSteps, step);
    const workingMinutes = segments.reduce((sum, seg) => sum + (parseHM(seg.endTime) - parseHM(seg.startTime)), 0);
    const idleMinutes = idleSegments.reduce((sum, seg) => sum + (parseHM(seg.endTime) - parseHM(seg.startTime)), 0);
    const breakMinutes = ctx.empBreakMinutes.get(emp) ?? 0;

    // ジョブ側にも割当を反映
    for (const seg of segments) {
      const job = jobById.get(seg.jobId);
      if (job) {
        job.assignments.push({ employeeId: emp, employeeName: s.staff.employeeName, startTime: seg.startTime, endTime: seg.endTime });
      }
    }

    return {
      employeeId: emp,
      employeeName: s.staff.employeeName,
      shiftStartTime: formatHM(s.shiftStart),
      shiftEndTime: formatHM(s.shiftEnd),
      segments,
      idleSegments,
      workingMinutes,
      idleMinutes,
      breakMinutes,
    };
  });

  const totalWorkingMinutes = employees.reduce((sum, e) => sum + e.workingMinutes, 0);
  const totalIdleMinutes = employees.reduce((sum, e) => sum + e.idleMinutes, 0);
  const idleStaffCount = employees.filter((e) => e.idleMinutes > 0).length;
  const capacityBottleneck = employees.some((e) => e.idleSegments.some((seg) => seg.reason === "room_capacity_full"));
  const hasOverflow = jobs.some((j) => j.overflowQuantity > 1e-6);

  const warnings: string[] = [];
  if (idleStaffCount > 0) {
    warnings.push(
      capacityBottleneck
        ? "部屋の同時人数上限により手すきの出勤者がいます。商品/部屋を増やすか応援先を検討してください。"
        : "作業がすべて片付き手すきの出勤者がいます。生産数量の追加または早上がりを検討してください。",
    );
  }
  if (hasOverflow) {
    warnings.push("基準終了内に作りきれない数量があります。人員増・別部屋並行・翌日繰越を検討してください。");
  }

  // 未使用の名前参照を避けるための軽い整合（名前マップは集計目的のみ）
  void nameByEmp;

  return {
    dayStart: ctx.input.dayStart,
    dayEnd: ctx.input.dayEnd,
    stepMinutes: step,
    jobs,
    employees,
    summary: {
      totalStaff: employees.length,
      totalAvailableMinutes: totalWorkingMinutes + totalIdleMinutes,
      totalWorkingMinutes,
      totalIdleMinutes,
      idleStaffCount,
      fullyUtilized: totalIdleMinutes === 0,
      capacityBottleneck,
      hasOverflow,
    },
    warnings,
  };
}

function mergePeopleSteps(steps: { start: number; people: number }[], step: number): PeopleSegment[] {
  const segments: PeopleSegment[] = [];
  for (const s of steps) {
    const last = segments[segments.length - 1];
    if (last && parseHM(last.endTime) === s.start && last.peopleCount === s.people) {
      last.endTime = formatHM(s.start + step);
    } else {
      segments.push({ startTime: formatHM(s.start), endTime: formatHM(s.start + step), peopleCount: s.people });
    }
  }
  return segments;
}

function mergeWorkSteps(
  steps: { start: number; roomId: string; jobId: string }[],
  step: number,
  jobStateById: Map<string, JobState>,
): EmployeeWorkSegment[] {
  const segments: EmployeeWorkSegment[] = [];
  for (const s of steps) {
    const last = segments[segments.length - 1];
    if (last && parseHM(last.endTime) === s.start && last.jobId === s.jobId) {
      last.endTime = formatHM(s.start + step);
    } else {
      const job = jobStateById.get(s.jobId)?.job;
      segments.push({
        jobId: s.jobId,
        productName: job?.productName ?? "",
        workAreaId: s.roomId,
        workAreaName: job?.workAreaName ?? "",
        startTime: formatHM(s.start),
        endTime: formatHM(s.start + step),
      });
    }
  }
  return segments;
}

function mergeIdleSteps(steps: { start: number; reason: IdleReason }[], step: number): EmployeeIdleSegment[] {
  const segments: EmployeeIdleSegment[] = [];
  for (const s of steps) {
    const last = segments[segments.length - 1];
    if (last && parseHM(last.endTime) === s.start && last.reason === s.reason) {
      last.endTime = formatHM(s.start + step);
    } else {
      segments.push({ startTime: formatHM(s.start), endTime: formatHM(s.start + step), reason: s.reason });
    }
  }
  return segments;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function round6(n: number) {
  return Math.round(n * ROUND) / ROUND;
}
