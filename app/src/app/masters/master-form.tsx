"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

export type MasterField = {
  key: string;
  label: string;
  required?: boolean;
  type?: "text" | "number" | "select" | "time" | "date" | "checkbox" | "textarea";
  options?: { value: string; label: string }[];
  default?: string | number | boolean;
  nullable?: boolean;
};

export type MasterFormValue = string | number | boolean;

export default function MasterForm({
  endpoint,
  fields,
  kind,
}: {
  endpoint: string;
  kind: string;
  fields: MasterField[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, MasterFormValue>>(() => initialValues(fields));

  if (!open) {
    return (
      <div className="toolbar">
        <button type="button" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          新規{kind}
        </button>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const body = Object.fromEntries(
      Object.entries(values).map(([k, v]) => {
        const field = fields.find((f) => f.key === k);
        // nullable な空入力は null を優先（number でも 0 に丸めない）
        if (field?.nullable && (v === "" || v === null)) return [k, null];
        if (field?.type === "number") return [k, Number(v)];
        if (field?.type === "checkbox") return [k, Boolean(v)];
        return [k, v === "" ? undefined : v];
      }),
    );
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error ?? "保存失敗");
      return;
    }
    setOpen(false);
    setValues(initialValues(fields));
    router.refresh();
  }

  return (
    <form className="panel" onSubmit={submit}>
      <div className="row">
        {fields.map((f) => (
          <label key={f.key} className={f.type === "checkbox" ? "inline-check" : undefined}>
            {f.type !== "checkbox" && (
              <span>
                {f.label} {f.required && "*"}
              </span>
            )}
            {f.type === "select" ? (
              <select
                required={f.required}
                value={String(values[f.key] ?? "")}
                onChange={(e) =>
                  setValues({
                    ...values,
                    [f.key]: e.target.value,
                  })
                }
              >
                {(f.options ?? []).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : f.type === "checkbox" ? (
              <>
                <input
                  type="checkbox"
                  checked={Boolean(values[f.key])}
                  onChange={(e) =>
                    setValues({
                      ...values,
                      [f.key]: e.target.checked,
                    })
                  }
                />
                <span>{f.label}</span>
              </>
            ) : f.type === "textarea" ? (
              <textarea
                required={f.required}
                value={String(values[f.key] ?? "")}
                onChange={(e) =>
                  setValues({
                    ...values,
                    [f.key]: e.target.value,
                  })
                }
              />
            ) : (
              <input
                type={f.type ?? "text"}
                required={f.required}
                value={values[f.key] as string | number}
                onChange={(e) =>
                  setValues({
                    ...values,
                    [f.key]: f.type === "number" ? Number(e.target.value) : e.target.value,
                  })
                }
              />
            )}
          </label>
        ))}
      </div>
      {err && <div className="alert danger">{err}</div>}
      <div className="row form-actions">
        <button type="submit" disabled={busy}>
          登録
        </button>
        <button type="button" className="secondary" onClick={() => setOpen(false)}>
          キャンセル
        </button>
      </div>
    </form>
  );
}

function initialValues(fields: MasterField[]): Record<string, MasterFormValue> {
  return Object.fromEntries(
    fields.map((field) => [
      field.key,
      field.default ?? (field.type === "number" ? 0 : field.type === "checkbox" ? false : ""),
    ]),
  );
}
