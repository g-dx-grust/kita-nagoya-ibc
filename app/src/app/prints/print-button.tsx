"use client";

export default function PrintButton({ label = "印刷する" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()}>
      {label}
    </button>
  );
}

