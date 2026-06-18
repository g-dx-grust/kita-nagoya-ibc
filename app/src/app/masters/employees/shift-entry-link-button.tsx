"use client";

import { useMemo, useState } from "react";
import { Copy, Link as LinkIcon, RefreshCw } from "lucide-react";
import { kitagoyaApiPath, kitagoyaPath } from "@/lib/paths";

export default function ShiftEntryLinkButton({
  employeeId,
  employeeName,
  initialToken,
  enabled,
}: {
  employeeId: string;
  employeeName: string;
  initialToken: string | null;
  enabled: boolean;
}) {
  const [token, setToken] = useState(initialToken);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const url = useMemo(() => {
    if (!token) return "";
    const path = kitagoyaPath(`/shift-entry/${token}`);
    if (typeof window === "undefined") return path;
    return `${window.location.origin}${path}`;
  }, [token]);

  async function issue() {
    setBusy(true);
    setMessage(null);
    const res = await fetch(kitagoyaApiPath(`/employees/${employeeId}/shift-entry-token`), {
      method: "POST",
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMessage("発行失敗");
      return;
    }
    setToken(json.shiftEntryToken);
    setMessage("発行しました");
  }

  async function copy() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setMessage("コピーしました");
  }

  if (!enabled) return <span className="badge muted employee-url-status">無効</span>;

  return (
    <div className="table-actions employee-shift-actions">
      {token ? (
        <>
          <button type="button" className="secondary" onClick={copy} title={`${employeeName}さん用URLをコピー`}>
            <Copy className="h-4 w-4" />
            コピー
          </button>
          <a href={kitagoyaPath(`/shift-entry/${token}`)} target="_blank" rel="noreferrer" title="入力画面を開く">
            <LinkIcon className="h-4 w-4" />
            開く
          </a>
        </>
      ) : null}
      <button type="button" className="secondary" onClick={issue} disabled={busy} title="URLを発行し直す">
        <RefreshCw className="h-4 w-4" />
        {token ? "再発行" : "発行"}
      </button>
      {message && <span className="subtext employee-shift-message">{message}</span>}
    </div>
  );
}
