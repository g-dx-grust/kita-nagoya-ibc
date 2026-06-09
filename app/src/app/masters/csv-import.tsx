"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { kitagoyaApiPath } from "@/lib/paths";

export default function CsvImport({
  endpoint,
  templateType,
  label,
  onImported,
}: {
  endpoint: string;
  templateType: string;
  // Optional label for the file picker row (defaults to the existing layout).
  label?: string;
  // Optional callback fired after a successful import, with the parsed response.
  // Existing product/material usages omit this and keep working unchanged.
  onImported?: (result: ImportResult) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setResult(null);
    setNotes([]);
    const text = await file.text();
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/csv" },
      body: text,
    });
    const json: ImportResult = await res.json();
    setBusy(false);
    if (!res.ok) {
      setResult(`エラー: ${json.error ?? "import_failed"}`);
      return;
    }
    setResult(`${json.imported ?? 0} 件を取り込みました`);
    setNotes(summarizeNotes(json));
    onImported?.(json);
    router.refresh();
    e.target.value = "";
  }

  return (
    <div className="row" style={{ flexWrap: "wrap", alignItems: "center", gap: 8 }}>
      {label && <span>{label}</span>}
      <a href={kitagoyaApiPath(`/export/master-template?type=${templateType}`)}>テンプレートをダウンロード</a>
      <input type="file" accept=".csv,text/csv" onChange={onChange} disabled={busy} />
      {busy && <span className="muted">取り込み中...</span>}
      {result && <span className="badge success">{result}</span>}
      {notes.map((note, i) => (
        <span key={i} className="badge" style={{ background: "#fde68a", color: "#92400e" }}>
          {note}
        </span>
      ))}
    </div>
  );
}

type ImportRow = { row: number; message?: string };

export type ImportResult = {
  error?: string;
  imported?: number;
  skipped?: number;
  errors?: ImportRow[];
  warnings?: ImportRow[];
  skippedRows?: ImportRow[];
};

function summarizeNotes(json: ImportResult): string[] {
  const notes: string[] = [];
  const skippedCount = json.skipped ?? json.skippedRows?.length ?? 0;
  if (skippedCount > 0) notes.push(`${skippedCount} 件をスキップ`);
  if (json.errors && json.errors.length > 0) notes.push(`${json.errors.length} 件のエラー`);
  if (json.warnings && json.warnings.length > 0) notes.push(`${json.warnings.length} 件の警告`);
  return notes;
}
