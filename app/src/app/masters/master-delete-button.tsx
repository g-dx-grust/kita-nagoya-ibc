"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function MasterDeleteButton({
  endpoint,
  label,
  disabled = false,
}: {
  endpoint: string;
  label: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  async function deleteRow() {
    setBusy(true);
    setError(null);
    const res = await fetch(endpoint, { method: "DELETE" });
    setBusy(false);

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "削除失敗");
      return;
    }

    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        className="danger"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        disabled={disabled}
      >
        削除
      </button>
      {open && (
        <div className="modal-backdrop" role="presentation" onClick={() => !busy && setOpen(false)}>
          <div
            aria-modal="true"
            className="modal"
            role="dialog"
            aria-labelledby="master-delete-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-title" id="master-delete-title">
              削除確認
            </div>
            <p className="modal-body">
              {label}を削除します。一覧や選択候補には表示されなくなります。
            </p>
            {error && <div className="alert danger">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setOpen(false)} disabled={busy}>
                キャンセル
              </button>
              <button type="button" className="danger" onClick={deleteRow} disabled={busy}>
                {busy ? "削除中..." : "削除する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
