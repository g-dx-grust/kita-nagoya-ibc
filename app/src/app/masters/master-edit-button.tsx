"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SearchableCombobox from "@/components/ui/searchable-combobox";
import type { MasterField, MasterFormValue } from "./master-form";

type InitialValues = Record<string, string | number | boolean | null | undefined>;

export default function MasterEditButton({
  endpoint,
  fields,
  initialValues,
  label,
}: {
  endpoint: string;
  fields: MasterField[];
  initialValues: InitialValues;
  label: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, MasterFormValue>>(() =>
    normalizeValues(fields, initialValues),
  );

  useEffect(() => {
    if (!open) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  function openEditor() {
    setValues(normalizeValues(fields, initialValues));
    setError(null);
    setOpen(true);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(endpoint, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payloadFor(fields, values)),
    });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "保存失敗");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button type="button" className="secondary" onClick={openEditor}>
        編集
      </button>
      {open && (
        <div className="modal-backdrop" role="presentation" onClick={() => !busy && setOpen(false)}>
          <form
            aria-modal="true"
            className="modal master-edit-modal"
            role="dialog"
            aria-labelledby="master-edit-title"
            onClick={(event) => event.stopPropagation()}
            onSubmit={submit}
          >
            <div className="modal-title" id="master-edit-title">
              {label}を編集
            </div>
            <div className="modal-fields">
              {fields.map((field) => (
                <label key={field.key} className={field.type === "checkbox" ? "inline-check" : undefined}>
                  {field.type !== "checkbox" && (
                    <span>
                      {field.label} {field.required && "*"}
                    </span>
                  )}
                  <FieldInput
                    field={field}
                    value={values[field.key]}
                    onChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))}
                  />
                  {field.type === "checkbox" && <span>{field.label}</span>}
                </label>
              ))}
            </div>
            {error && <div className="alert danger">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setOpen(false)} disabled={busy}>
                キャンセル
              </button>
              <button type="submit" disabled={busy}>
                {busy ? "保存中..." : "保存する"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: MasterField;
  value: MasterFormValue;
  onChange: (value: MasterFormValue) => void;
}) {
  if (field.type === "select") {
    if (field.searchable) {
      return (
        <SearchableCombobox
          required={field.required}
          value={String(value ?? "")}
          options={(field.options ?? []).filter((option) => option.value !== "")}
          emptyOptionLabel={(field.options ?? []).find((option) => option.value === "")?.label}
          placeholder={field.searchPlaceholder ?? `${field.label}を検索`}
          onChange={onChange}
        />
      );
    }

    return (
      <select
        required={field.required}
        value={String(value ?? "")}
        onChange={(event) => onChange(event.target.value)}
      >
        {(field.options ?? []).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "checkbox") {
    return <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />;
  }

  if (field.type === "textarea") {
    return (
      <textarea
        required={field.required}
        value={String(value ?? "")}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  return (
    <input
      type={field.type ?? "text"}
      required={field.required}
      value={value as string | number}
      onChange={(event) => onChange(field.type === "number" ? Number(event.target.value) : event.target.value)}
    />
  );
}

function normalizeValues(fields: MasterField[], values: InitialValues): Record<string, MasterFormValue> {
  return Object.fromEntries(
    fields.map((field) => {
      const value = values[field.key];
      if (field.type === "checkbox") return [field.key, Boolean(value ?? field.default ?? false)];
      if (field.type === "number") {
        // nullable な number が未設定(null)のときは空文字を保持し、0 に丸めない。
        if (value == null) return [field.key, field.nullable ? "" : Number(field.default ?? 0)];
        return [field.key, Number(value)];
      }
      return [field.key, value == null ? String(field.default ?? "") : String(value)];
    }),
  );
}

function payloadFor(fields: MasterField[], values: Record<string, MasterFormValue>) {
  return Object.fromEntries(
    fields.map((field) => {
      const value = values[field.key];
      // nullable な空入力は null を優先（number でも 0 に丸めない）
      if (field.nullable && (value === "" || value == null)) return [field.key, null];
      if (field.type === "number") return [field.key, Number(value)];
      if (field.type === "checkbox") return [field.key, Boolean(value)];
      return [field.key, value === "" ? undefined : value];
    }),
  );
}
