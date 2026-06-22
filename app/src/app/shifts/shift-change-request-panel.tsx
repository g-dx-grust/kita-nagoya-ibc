"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { kitagoyaApiPath } from "@/lib/paths";
import { diffShiftChangeDays, type ShiftChangeDay } from "@/lib/shift-change-request";

export type ShiftChangeRequestRow = {
  id: string;
  employeeName: string;
  yearMonth: string;
  requestedAt: string;
  currentDays: ShiftChangeDay[];
  requestedDays: ShiftChangeDay[];
};

export default function ShiftChangeRequestPanel({ requests }: { requests: ShiftChangeRequestRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const requestStats = useMemo(
    () => ({
      count: requests.length,
      changedDayCount: requests.reduce((sum, request) => {
        const diff = diffShiftChangeDays(request.currentDays, request.requestedDays);
        return sum + diff.addedDays.length + diff.removedDays.length + diff.changedDays.length;
      }, 0),
    }),
    [requests],
  );

  async function review(id: string, action: "approve" | "reject") {
    setBusyId(id);
    setMessage(null);
    const res = await fetch(kitagoyaApiPath(`/shift-change-requests/${id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        reviewedBy: "管理者",
        reviewNote: reviewNotes[id]?.trim() || null,
      }),
    });
    setBusyId(null);
    if (!res.ok) {
      setMessage(action === "approve" ? "承認できませんでした" : "却下できませんでした");
      return;
    }
    setMessage(action === "approve" ? "修正申請を承認しました" : "修正申請を却下しました");
    router.refresh();
  }

  return (
    <section id="shift-change-requests" className="panel shift-change-request-panel anchor-offset">
      <div className="toolbar flush-top">
        <div>
          <strong>スタッフ修正申請</strong>
          <div className="subtext">
            承認待ち {requestStats.count}件 / 変更日 {requestStats.changedDayCount}日
          </div>
        </div>
        <span className={`badge ${requests.length > 0 ? "warn" : "success"}`}>
          {requests.length > 0 ? "管理者確認" : "申請なし"}
        </span>
      </div>
      {message && <div className="alert info">{message}</div>}
      {requests.length === 0 ? (
        <div className="empty-state">承認待ちのシフト修正申請はありません。</div>
      ) : (
        <div className="table-frame">
          <table>
            <thead>
              <tr>
                <th>スタッフ</th>
                <th>対象月</th>
                <th>変更内容</th>
                <th>申請日時</th>
                <th>管理者メモ</th>
                <th>確認</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => {
                const diff = diffShiftChangeDays(request.currentDays, request.requestedDays);
                return (
                  <tr key={request.id} className="row-needs-action">
                    <td data-label="スタッフ">
                      <strong>{request.employeeName}</strong>
                    </td>
                    <td data-label="対象月">{request.yearMonth}</td>
                    <td data-label="変更内容">
                      <div className="shift-change-diff">
                        <span className="badge info">追加 {formatDays(diff.addedDays)}</span>
                        <span className="badge warn">変更 {formatDays(diff.changedDays)}</span>
                        <span className="badge muted">削除 {formatDays(diff.removedDays)}</span>
                      </div>
                      <div className="subtext">
                        現在 {request.currentDays.length}日 → 申請 {request.requestedDays.length}日
                      </div>
                    </td>
                    <td data-label="申請日時">{request.requestedAt}</td>
                    <td data-label="管理者メモ">
                      <input
                        value={reviewNotes[request.id] ?? ""}
                        onChange={(event) =>
                          setReviewNotes((current) => ({
                            ...current,
                            [request.id]: event.target.value,
                          }))
                        }
                        placeholder="任意"
                      />
                    </td>
                    <td data-label="確認">
                      <div className="table-actions">
                        <button type="button" onClick={() => review(request.id, "approve")} disabled={busyId === request.id}>
                          <CheckCircle2 size={15} aria-hidden="true" />
                          承認
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => review(request.id, "reject")}
                          disabled={busyId === request.id}
                        >
                          <XCircle size={15} aria-hidden="true" />
                          却下
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function formatDays(days: number[]): string {
  if (days.length === 0) return "0日";
  if (days.length <= 4) return days.map((day) => `${day}日`).join("、");
  return `${days.slice(0, 3).map((day) => `${day}日`).join("、")} 他${days.length - 3}日`;
}
