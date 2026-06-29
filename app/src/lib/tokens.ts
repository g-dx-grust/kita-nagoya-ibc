/**
 * Design tokens — generated from Figma (北名古屋 製造管理システム UI).
 * Palette: ティール × クールグレー (Japanese SaaS).
 *
 * Prefer CSS variables in components (`var(--primary)` / Tailwind `bg-[var(--primary)]`).
 * Use this TS map only where you need raw values in JS (e.g. chart libraries, canvas).
 *
 * Figma token ↔ CSS var ↔ value mapping: docs/21_ui_implementation_spec.md
 */

export const tokens = {
  bg: {
    canvas: "#f8fafc", // --bg / color/bg/canvas
    surface: "#ffffff", // --surface / color/bg/surface
    subtle: "#f1f5f9", // --surface-subtle / color/bg/subtle
    hover: "#e8eef4", // --surface-strong / color/bg/hover
  },
  text: {
    primary: "#0f172a", // --text / color/text/primary
    secondary: "#475569", // --muted / color/text/secondary
    muted: "#64748b", // --text-subtle / color/text/muted
    inverse: "#ffffff", // --primary-foreground / color/text/inverse
  },
  border: {
    default: "#e2e8f0", // --border / color/border/default
    strong: "#cbd5e1", // --border-strong / color/border/strong
    focus: "#0e8e8a", // --ring / color/border/focus
  },
  brand: {
    solid: "#0e8e8a", // --primary / color/brand/solid （実績）
    hover: "#0b7370", // --primary-hover
    subtle: "#e6f4f3", // --primary-soft / color/brand/subtle
    text: "#0b7370", // --accent / color/brand/text
  },
  info: {
    solid: "#2563eb", // --info / color/info/solid （予定）
    subtle: "#eff4ff", // --info-soft / color/info/subtle
    border: "#c7d9fd", // --info-border
    text: "#1d4ed8", // --info-text / color/info/text
  },
  warning: {
    solid: "#d97706", // --warn-solid / color/warning/solid （注意）
    subtle: "#fef3e2", // --warn-soft
    border: "#facc7a", // --warn-border
    text: "#b45309", // --warn / color/warning/text
  },
  danger: {
    solid: "#dc2626", // --danger / color/danger/solid （不足・エラー）
    subtle: "#fdecec", // --danger-soft
    border: "#f4b4b4", // --danger-border
    text: "#dc2626", // color/danger/text
  },
  success: {
    solid: "#16a34a", // --success-solid / color/success/solid （完了・確定）
    subtle: "#e7f6ec", // --success-soft
    border: "#9fd9b4", // --success-border
    text: "#15803d", // --success / color/success/text
  },
  radius: { sm: 4, md: 6, lg: 8, xl: 12, full: 999 },
  /** spacing scale (px) — gap/padding */
  space: { 2: 2, 4: 4, 6: 6, 8: 8, 12: 12, 16: 16, 20: 20, 24: 24, 32: 32, 40: 40, 48: 48, 64: 64 },
} as const;

/**
 * 業務ステータス → トーン → Badge variant の対応。
 * 予定/実績/確定/不足/未確定 などの語が出たら必ずこの表に従う（独自色を作らない）。
 * variant は app/src/components/ui/badge.tsx の variant 名（info は要追加）。
 */
export const STATUS_TONE = {
  予定: { tone: "info", variant: "info" },
  実績: { tone: "brand", variant: "default" },
  確定: { tone: "success", variant: "success" },
  完了: { tone: "success", variant: "success" },
  充足: { tone: "success", variant: "success" },
  対応済: { tone: "success", variant: "success" },
  入荷済: { tone: "success", variant: "success" },
  仮: { tone: "neutral", variant: "secondary" },
  下書き: { tone: "neutral", variant: "secondary" },
  候補: { tone: "neutral", variant: "secondary" },
  対象外: { tone: "neutral", variant: "secondary" },
  未確定: { tone: "warning", variant: "warning" },
  入荷未確定: { tone: "warning", variant: "warning" },
  安全在庫割れ: { tone: "warning", variant: "warning" },
  要確認: { tone: "warning", variant: "warning" },
  未入力: { tone: "warning", variant: "warning" },
  不足: { tone: "danger", variant: "destructive" },
  未対応: { tone: "danger", variant: "destructive" },
  "17時超過": { tone: "danger", variant: "destructive" },
  超過: { tone: "danger", variant: "destructive" },
} as const;

export type Tokens = typeof tokens;
