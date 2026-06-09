# Phase 0-A 既存画面棚卸し

調査日: 2026-05-28
担当: Claude Code（Phase 0-A 並列サブタスク）
入力プロンプト: [`prompts/v2/phase_0_subtasks/0_parallel_a_screens.md`](../../prompts/v2/phase_0_subtasks/0_parallel_a_screens.md)
前段成果物: [`docs/phase_0_outputs/0_0_orientation.md`](./0_0_orientation.md)

本サブタスクは **コード未編集**。`app/src/app/`、`app/src/components/`、`app/src/app/globals.css`、`app/src/app/layout.tsx`、`app/src/app/app-nav.tsx` は1文字も触っていない。

---

## 1. 既存ページ一覧

App Router 配下に存在する `page.tsx` 全件と、関連クライアントコンポーネントの実在を確認した。

| パス | ファイル | 概要 | 使用 API（fetch 先 / 推測）| 使用 lib |
|---|---|---|---|---|
| `/` | `app/src/app/page.tsx` | HOME。`MenuCard` 6枚（生産予定/製品計画/商品/在庫/発注/請求）と統計、不足アラートサマリ、直近生産予定テーブル。サーバーコンポーネントで Prisma 直接呼び出し。 | （Prisma 直接） | `@/lib/prisma`, `@/lib/labels` (`planStatusClass`, `planStatusLabel`), `@/lib/paths` (`kitagoyaPath`) |
| `/production-plans` | `app/src/app/production-plans/page.tsx` + `plan-list-table.tsx` | 生産予定の一覧。日付・状態・作業場所で絞り込み、`PlanListTable` で表示。月間生成 / 自動作成 / 新規予定への導線あり。 | （Prisma 直接 / `plan-list-table` から `/api/production-plans/bulk-delete` 等）| `@/lib/prisma`, `@/lib/paths` |
| `/production-plans/new` | `app/src/app/production-plans/new/page.tsx` + `../plan-form.tsx` | 生産予定の新規登録フォーム。商品 / 作業場所 / 生産能力をサーバ側で取得し `PlanForm` に渡す。 | `POST /api/production-plans`（`PlanForm` 内）| `@/lib/prisma` |
| `/production-plans/[id]` | `app/src/app/production-plans/[id]/page.tsx` + `assignment-editor.tsx`, `plan-actions.tsx`, `../plan-form.tsx` | 生産予定詳細・編集・スタッフ配置・原料/資材予定使用量表示・原価見積。状態遷移は `PlanActions`。 | `/api/production-plans/[id]`, `/api/production-plans/[id]/assignments`, `/api/production-plans/[id]/confirm` 等（コンポーネント内）| `@/lib/prisma`, `@/lib/paths` |
| `/production-plans/monthly` | `app/src/app/production-plans/monthly/page.tsx` + `monthly-schedule-actions.tsx` | 月間生産スケジュール生成。前々月前年比予測 or 在庫不足判定で生成候補を表示する Excel 風シート（`production-row-*`）。 | `loadMonthlyProductionSchedulePreview` 経由（サーバ）, アクション側で `/api/production-plans/monthly` 想定 | `@/lib/monthly-production-schedule`, `@/lib/product-planning-service`, `@/lib/prisma`, `@/lib/labels`, `@/lib/paths` |
| `/production-plans/auto` | `app/src/app/production-plans/auto/page.tsx` + `auto-schedule-form.tsx` | 1日分の自動生産スケジュール候補作成。商品とシフトから作業順 / 配置を提案。 | `/api/production-plans/auto` 系想定（`AutoScheduleForm` 内）| `@/lib/prisma`, `@/lib/paths` |
| `/inventory` | `app/src/app/inventory/page.tsx` | 月単位の原料/資材在庫表（Excel 風）。`使用量/入荷/残/賞味期限/出荷期限` の 5 行構成、固定列スティッキー。 | （Prisma 直接：`stockMovement`, `material`, `packagingMaterial`）| `@/lib/monthly-inventory-sheet`, `@/lib/prisma` |
| `/invoices` | `app/src/app/invoices/page.tsx` + `invoice-export-form.tsx` | 請求/売上伝票 CSV 出力フォーム＋出力履歴一覧。 | `POST /api/invoice-exports`, `POST /api/export/...` 想定 | `@/lib/prisma` |
| `/purchases` | `app/src/app/purchases/page.tsx` + `generate-button.tsx`, `purchase-order-table.tsx` | 発注候補一覧（累積不足見込み / 発注候補・発注状況）。`GeneratePurchaseCandidatesButton` で候補生成。発注書作成画面は無く、発注 PO テーブルの編集まで。 | `/api/purchase-candidates`, `/api/purchase-orders/*` | `@/lib/material-forecast`, `@/lib/prisma` |
| `/product-planning` | `app/src/app/product-planning/page.tsx` + `product-planning-client.tsx` | 製品在庫・需要・自動生産提案・月次実績の統合画面（クライアントコンポーネントが大きい）。 | `/api/product-demands`, `/api/product-monthly-actuals`, `/api/product-planning` 系 | `@/lib/product-planning-service`, `@/lib/monthly-production-forecast`, `@/lib/prisma` |
| `/shifts` | `app/src/app/shifts/page.tsx` + `shift-editor.tsx`, `shift-month-editor.tsx` | 月モード（Excel 出勤表形式）と `?date=` 指定の日モードを兼ねるシフト編集画面。 | `/api/shifts/*` 系 | `@/lib/prisma`, `@/lib/paths` |
| `/capacity-review` | `app/src/app/capacity-review/page.tsx` + `capacity-review-table.tsx` | 商品 × 作業場所の生産能力（1時間1人あたり）レビュー画面。日報サンプル数・確認ステータスを表示。 | `/api/capacities/*` 系 | `@/lib/prisma` |
| `/masters/products` | `app/src/app/masters/products/page.tsx` + `product-create-form.tsx`, `../csv-import.tsx`, `../master-delete-button.tsx` | 商品マスター一覧（BOM・能力・標準作業場所サマリ）と新規登録。 | `POST /api/products`, `POST /api/products/[id]/delete` 等 | `@/lib/prisma`, `@/lib/labels`, `@/lib/paths` |
| `/masters/products/[id]` | `app/src/app/masters/products/[id]/page.tsx` + `product-editor.tsx` | 商品詳細編集（別名・BOM・能力）。 | `PUT /api/products/[id]`, BOM/能力編集系 | `@/lib/prisma`, `@/lib/paths` |
| `/masters/materials` | `app/src/app/masters/materials/page.tsx` + `../csv-import.tsx`, `../master-form.tsx`, `../master-edit-button.tsx`, `../master-delete-button.tsx` | 原料マスター一覧と汎用 `MasterForm` による登録・編集。 | `/api/materials` | `@/lib/prisma`, `@/lib/paths` |
| `/masters/packaging` | `app/src/app/masters/packaging/page.tsx` | 資材マスター一覧と `MasterForm`。 | `/api/packaging-materials` | `@/lib/prisma`, `@/lib/labels`, `@/lib/paths` |
| `/masters/work-areas` | `app/src/app/masters/work-areas/page.tsx` + `work-area-capacity-table.tsx`, `work-area-fields.ts` | 作業場所マスター一覧と能力テーブル。外注フラグあり。 | `/api/work-areas` | `@/lib/prisma`, `@/lib/paths` |
| `/masters/employees` | `app/src/app/masters/employees/page.tsx` | 従業員マスター一覧。雇用区分（自社/派遣/その他）含む。 | `/api/employees` | `@/lib/prisma`, `@/lib/labels`, `@/lib/paths` |
| `/prints` | `app/src/app/prints/page.tsx` | 現場印刷ハブ。対象日選択し「生産スケジュール印刷」「スタッフ配置印刷」へ飛ばす。 | （Prisma 直接）| `@/lib/prisma`, `@/lib/paths` |
| `/prints/production-schedule` | `app/src/app/prints/production-schedule/page.tsx` + `../print-button.tsx` | 生産スケジュールの印刷向け HTML（A4 横、`.print-page`）。 | （Prisma 直接）| `@/lib/prisma`, `@/lib/labels`, `@/lib/paths` |
| `/prints/staff-assignments` | `app/src/app/prints/staff-assignments/page.tsx` + `../print-button.tsx` | スタッフ配置の印刷向け HTML。作業場所別 / 従業員別の 2 ビュー。 | （Prisma 直接）| `@/lib/prisma`, `@/lib/labels`, `@/lib/paths` |

**注**：仕入先（`supplier`）、請求単価（`billing-prices`）、伝票連携マッピング、日報入力 UI、日報承認 UI、原価/手間賃集計、ダッシュボード、発注書作成 UI、実績分析の各「画面」は存在せず、API レイヤ（`/api/suppliers`, `/api/billing-prices`, `/api/daily-reports`, `/api/import`, `/api/export/master-template`）のみ実装済み（0-0 の補足見立てとも整合）。

---

## 2. docs/18 §19-4 画面一覧との対応

凡例：流用可 = 既存ページがそのまま該当機能を担っている／部分 = 既存ページの一部に該当機能あり or 別軸の実装があるが要件未充足／無 = 該当画面は実装されていない

| docs/18 §19-4 画面 | 既存ページ（パス） | 状態 | 担当フェーズ | 備考 |
|---|---|---|---|---|
| ダッシュボード | `/`（HOME）に統計カード・不足アラート要約・直近生産予定の体裁あり | 部分 | §19-2 横断 | docs/18 §19-2 が求める「17時超過 / 日報未確定 / 請求未出力」等のサマリは無い |
| 月間生産計画画面 | `/production-plans/monthly` | 流用可（Phase 8 寄り） | Phase 3→8 | 既に「前々月前年比 / 在庫不足判定」の 2 モード、Excel 風シート、生成候補リストが実装済 |
| 日別生産スケジュール画面 | `/production-plans`（一覧）, `/production-plans/[id]`（詳細）, `/production-plans/auto`（自動候補） | 流用可 | Phase 3→8 | 表＋詳細＋自動候補の3画面で実質カバー |
| 生成候補画面 | `/production-plans/monthly`（生成候補テーブル）, `/production-plans/auto`（自動配置候補） | 部分 | Phase 8 | 候補→確定の承認ワークフロー UI は要拡張 |
| 製品在庫画面（Excel 風） | `/product-planning` | 部分 | Phase 2 | 「製品在庫」軸の Excel 風シートは無く、需要・提案中心。原料/資材用 `/inventory` と同等の Excel シート未実装 |
| 原材料在庫画面 | `/inventory` | 流用可 | Phase 2 + Phase 4 | 原料／資材を 2 表で表示。Excel 風スティッキー実装済 |
| 発注アラート画面 | `/purchases`（累積不足見込みセクション） | 流用可 | Phase 4 | 不足日 / 区分 / 品目 / 不足量 / 状態（不足／未確定依存）まで実装済 |
| 発注書作成画面 | （無） | 無 | Phase 4 | 発注 PO 編集テーブルはあるが、発注書 PDF/印刷ビューは未実装 |
| 日報入力画面（タブレット） | （無）| 無 | Phase 5 | UI 無し。API（`/api/daily-reports`、`from-production-plan/[id]`, `confirm`）のみ存在 |
| 日報承認画面 | （無）| 無 | Phase 5 | UI 無し。`/api/daily-reports/[id]/confirm` は実装済 |
| マスタ管理画面 | `/masters/products`, `/masters/products/[id]`, `/masters/materials`, `/masters/packaging`, `/masters/work-areas`, `/masters/employees` | 部分 | Phase 1 | 主要マスタは揃う。仕入先・請求単価・伝票連携マッピング（docs/12）・サーチャージ等の管理画面は未実装 |
| 実績分析画面 | `/capacity-review`（生産能力レビュー） | 部分 | §19-3 横断 | 「不良率／原材料消費／手間賃／異常検知」（docs/18 §19-3）の網羅的分析画面は無い。能力レビューだけが部分該当 |

集計：**流用可 5 / 部分 5 / 無 3 / 計 13**（docs/18 §19-4 の 12 項目に対して、ダッシュボードと日別生産スケジュールが複数ページにまたがるため行数は前後する。要件 12 画面に対する状態は「流用可 5・部分 4・無 3」と読み替え可能）。

---

## 3. UI コンポーネントライブラリ現状

`app/src/components/ui/` 配下に実在するファイル（6 件）：

- **Button** `button.tsx` — `cva` ベース。variant: `default / destructive / outline / secondary / ghost / link / success / warning`。size: `default / sm / lg / icon`。`@radix-ui/react-slot` で `asChild` 対応。CSS 変数 (`--primary` 等) を直接参照。
- **Badge** `badge.tsx` — `cva` ベース。variant: `default / secondary / destructive / outline / success / warning`。`rounded-full`、`text-xs font-bold`。
- **Card** `card.tsx` — `Card / CardHeader / CardTitle / CardDescription / CardContent / CardFooter`。`shadow-none`、`rounded-lg`、`var(--border)` / `var(--text)` 参照。
- **Input** `input.tsx` — 単一の `<input>` ラッパ。`h-9`、`focus:ring-2`、`var(--primary)` 系参照。型は `React.ComponentProps<"input">`。
- **MenuCard** `menu-card.tsx` — HOME などで使う独自カード。`Card` をベースに `lucide-react`（`ChevronRight`, `HelpCircle`）と `Link` を組み合わせる。`disabled` 対応あり。
- **Table** `table.tsx` — `Table / TableHeader / TableBody / TableRow / TableHead / TableCell`。`overflow-x-auto`、`text-sm`、`hover:bg-[var(--surface-subtle)]`。

**揃っている要素：** Button / Badge / Card / Input / Table / (独自) MenuCard。

**揃っていない要素（shadcn 流ベースで未投入）：**
- Select / Combobox（`<select>` 直書きで運用中。`globals.css` が `select` を一括スタイル）
- Dialog / Modal（クラス `.modal-backdrop` / `.modal` / `.modal-actions` を `globals.css` で定義し、`master-edit-button.tsx`, `master-delete-button.tsx` が利用。Radix Dialog ではない）
- Toast / Notification（実装無し。通知系の API 呼び出しは `confirm()` / `alert()` で代用している箇所あり、例：`plan-list-table.tsx` の `confirm`）
- Form（`react-hook-form` 等は導入されていない。生フォーム＋`useState`／サーバ送信）
- Tabs / Tooltip / Popover / DropdownMenu / Sheet（無し）
- Skeleton / Spinner（無し。サーバーコンポーネント中心で SSR）
- Calendar / DatePicker（`<input type="date">` / `type="month">` を直接利用）
- Checkbox / Radio / Switch（CSS は `.inline-check` で `<input type="checkbox">` を直接利用）
- Textarea コンポーネント（`<textarea>` 直書きで `globals.css` が一括スタイル）

依存パッケージは `class-variance-authority`, `clsx`, `tailwind-merge`, `@radix-ui/react-slot`, `lucide-react` のみ。`@radix-ui/react-dialog` などは未導入。

---

## 4. ナビゲーション現状と追加候補

### 4-1. 現状メニュー（`app/src/components/layout/Sidebar.tsx` の `menuItems` を直接抽出）

15 項目。`lucide-react` のアイコンと色クラスがペア。

| 順 | 現状メニュー | パス | アイコン |
|---|---|---|---|
| 1 | HOME | `/` | `Home` |
| 2 | 生産予定 | `/production-plans` | `ClipboardList` |
| 3 | 月間予定 | `/production-plans/monthly` | `CalendarDays` |
| 4 | 製品計画 | `/product-planning` | `Gauge` |
| 5 | 在庫 | `/inventory` | `Warehouse` |
| 6 | 発注 | `/purchases` | `ShoppingCart` |
| 7 | 商品 | `/masters/products` | `Package` |
| 8 | 能力確認 | `/capacity-review` | `FileSpreadsheet` |
| 9 | 原料 | `/masters/materials` | `Boxes` |
| 10 | 資材 | `/masters/packaging` | `Database` |
| 11 | 作業場所 | `/masters/work-areas` | `Warehouse` |
| 12 | 従業員 | `/masters/employees` | `Users` |
| 13 | シフト | `/shifts` | `CalendarDays` |
| 14 | 現場印刷 | `/prints` | `Printer` |
| 15 | 請求出力 | `/invoices` | `ReceiptText` |

`app/src/app/app-nav.tsx` の `AppNav` コンポーネントは「現在の `pathname` に最長一致するメニューを `active` に切り替えるユーティリティ」だけを提供しており、メニュー項目自体を保持していない（実体は `Sidebar.tsx`）。`Sidebar` のみがナビゲーション項目の真のソース。

### 4-2. docs/18 §19-4 で追加候補となるメニュー（**追加位置の判断は人間に渡す**）

| 追加候補メニュー（仮ラベル） | 接続先パス（案） | 担当フェーズ | 既存接続 | メモ |
|---|---|---|---|---|
| ダッシュボード | `/dashboard`（HOME と統合 or 分離する判断は人間） | §19-2 | 無 | 現在 HOME 上に簡易サマリのみ |
| 日報入力 | `/daily-reports` 等（未確定） | Phase 5 | 無 | API のみ存在 |
| 日報承認 | `/daily-reports/approval` 等（未確定） | Phase 5 | 無 | API のみ存在 |
| 発注書作成 | `/purchases/orders` 等（未確定） | Phase 4 | 部分 | `/purchases` 内で完結させる選択肢もあり |
| 実績分析 | `/analytics` 等（未確定） | §19-3 | 無 | 不良率・原材料消費推移・手間賃推移・異常検知履歴を集約 |
| 仕入先マスタ | `/masters/suppliers`（未確定） | Phase 1 | 無 | `/api/suppliers` は存在 |
| 請求単価マスタ | `/masters/billing-prices` 等（未確定） | Phase 1/6 | 無 | `/api/billing-prices` は存在 |
| 伝票連携マッピング | `/masters/invoice-mapping` 等（未確定） | Phase 6/7 | 無 | docs/12 のマスタ要件にのみ言及 |

並び順・グルーピング（マスタ系の畳み込み / セクション化）は **`Sidebar.tsx` を編集する Phase 1 以降の人間判断**。

---

## 5. デザインシステム概観

- **Tailwind:** `tailwindcss@^4.3.0` + `@tailwindcss/postcss@^4.3.0`。`globals.css` 冒頭で `@import "tailwindcss";` を使う v4 系の構成。`@theme inline { ... }` ブロックで `--color-*` を CSS 変数（`--background`, `--primary` 等）にマップしてある。Tailwind config ファイル（`tailwind.config.*`）は無し（v4 の CSS-first 設定）。
- **shadcn/ui:** `components.json` に `"style": "new-york"` / `"rsc": true` / `"tsx": true` / `"baseColor": "zinc"` / `"cssVariables": true`、`css: "src/app/globals.css"`、`aliases.ui: "@/components/ui"`、`aliases.utils: "@/lib/utils"`、`aliases.hooks: "@/hooks"` を設定。**shadcn/ui ベースで初期化済み**。ただし投入済みコンポーネントは Button / Badge / Card / Input / Table の最小 5 件のみ（独自 MenuCard が追加で 1 件）。`@/hooks` ディレクトリは未作成（実在しない）。
- **`globals.css` 主要トークン（`:root`）:** `--radius: 0.375rem`、`--primary: #245bdb`（青）、`--primary-hover: #1f4bb8`、`--primary-soft: #e7efff`、`--accent: #1f4fbf`、`--danger: #c62621`、`--warn: #8f4f00`、`--success: #04724d`、`--text: #1f2329`、`--muted: #4e5969`、`--bg: #f5f6f7`、`--surface: #fff`、`--border: #d8dde5`、`--border-strong: #aeb7c2`、`--shadow: none`。各色には `*-soft` / `*-border` 系の派生トークンも揃う。
- **`globals.css` 主要クラス:** `.header`（sticky）, `.container`（max 1360px）, `.panel`, `.toolbar`, `.grid` / `.grid-3` / `.grid-4`, `.stat-grid` / `.stat-card` / `.metric`, `.badge` / `.badge.warn|danger|success|info|muted`, `.alert` / `.alert.warn|danger|success|info`, `.modal-backdrop` / `.modal` / `.modal-actions`, `.empty-state`, `.button-link` / `.button-link.secondary-link`, `.table-frame` / `.table-scroll`, `.month-grid*`（月単位シフト用）, `.excel-inventory-*` / `.excel-production-*`（Excel 風 sticky 列）, `.print-*` / `@media print` 一式。`h1`/`h2`/`th`/`td`/`button`/`input`/`select`/`textarea` をすべてグローバルにスタイル定義しており、**生 HTML 要素にもデザインが効く**設計。
- **`cva` / `tailwind-merge`:** Button / Badge で `class-variance-authority` を使用（標準的な shadcn パターン）。`cn()` ヘルパは `@/lib/utils` に `twMerge(clsx(inputs))` 実装あり。
- **`@radix-ui/react-slot`:** Button / Badge の `asChild` 用に投入済み。それ以外の Radix プリミティブは未投入。
- **アイコン:** `lucide-react@^1.16.0`（バージョンに注意。最新系ではない）。
- **レスポンシブ:** `globals.css` に `@media (max-width: 760px)` ブロックがあり、`.header` 縦並び化、`button` / `.button-link` の `width: 100%` 化、`.toolbar .spacer` 非表示など最低限のスマホ対応あり。`MainLayout` は `lg:` プレフィックス（`>=1024px`）でサイドバーを常時表示、未満ではハンバーガー＋ドロワー。
- **印刷:** `@media print` で `.header` と `.no-print` を非表示、`@page { size: A4 landscape; margin: 10mm; }` を指定。`.print-page` / `.print-title` / `.print-table` のクラス系統が用意され、`/prints/*` がそれを利用。

---

## 6. タブレット適性（Phase 5 日報入力に向けた現状観察）

- **タップ領域:** `globals.css` の `button { min-height: 34px; padding: 7px 13px }`、`input/select/textarea { min-height: 34px }`、`.button-link { min-height: 34px }`。WCAG 推奨 44×44px には届かないが、`<= 760px` メディアクエリでフォーム要素を 100% 幅化し、ある程度押しやすくしている。日報用に拡大したい場合は Button の `size: "lg"`（`h-10`）か `globals.css` の閾値見直しが要る。
- **モバイル/タブレット用ナビ:** `MainLayout` + `Header` + `Sidebar` がハンバーガー＋オーバーレイ式ドロワーを `lg` 未満で提供。`<= 760px` で `.header` を縦並び化する CSS もあり、二重実装気味（`Sidebar` 主導と `globals.css` 主導が並存）。`<input type="time">` 等は `<= 760px` で 100% 幅。
- **スクロール挙動:** Excel 風シート（`.excel-inventory-scroll` / `.excel-production-scroll`）は `max-height: 72vh` / `68vh` で縦スクロール、`overflow: auto` で横スクロール、`position: sticky` の左端列＋ヘッダ。タブレット縦持ちでも横スクロールで全日付確認可能。`.table-frame { overflow-x: auto }` も全テーブルで使用済み。
- **オフライン考慮:** **無し**。Service Worker / IndexedDB / `next-pwa` 系の導入無し（`package.json` 参照）。`prisma/dev.db` を使った SQLite 開発構成だが、ブラウザ側のオフラインキャッシュは未対応。
- **タッチ操作専用 UI:** 大きめタップ専用ボタンクラス、長押し、スワイプ操作などは未実装。`button.mini`（`padding: 3px 8px; font-size: 11px`）等、むしろ小型 UI が用意されている。
- **入力 UX:** ネイティブ `<input type="date|month|time|number">` を多用しており、iOS / Android の標準ピッカーが効く。ただしフォーカス時の `outline: 2px solid rgba(36, 91, 219, 0.18)` と `Tailwind v4` の `focus:ring-2` が併存する箇所がある（Input コンポーネントとグローバル CSS で別系統）。
- **結論:** 「**現状はタブレットでも閲覧・基本入力は可能だが、日報入力タブレット運用に最適化はされていない**」状態。Phase 5 ではタップ領域・オフライン保存・大型キーパッド向け数値入力など、別途設計が必要。

---

## 7. 判断保留事項

このサブタスク（コード未編集の現状記録）で決められず、後続フェーズに渡すべき事項：

1. **HOME とダッシュボードの統合 / 分離**：docs/18 §19-2 のダッシュボード要件（17 時超過 / 日報未確定 / 請求未出力 等）を、既存 `/`（HOME）に追加するか、`/dashboard` を新設するか。サイドバーの並びにも影響。
2. **Sidebar メニュー項目の追加位置・グルーピング**：「マスタ系」を畳み込むか、ダッシュボード / 日報 / 発注書 / 実績分析 をどこに配置するか。アイコン色の割り当てルールも未確定。
3. **`/product-planning` と `/production-plans/monthly` と `/inventory` の関係整理**：3 つに「製品在庫」「需要」「月間予定」「在庫見通し」が分散しており、docs/18 §19-4 でいう「製品在庫画面（Excel 風）」が `/inventory` 系 Excel シートを製品まで拡張するか、`/product-planning` を Excel 化するかが未確定。
4. **shadcn 流の追加コンポーネント投入方針**：Dialog / Select / Toast / Form / Tabs 等を `pnpm dlx shadcn add` 相当で増やすか、既存の `globals.css`（`.modal-*` 等）と `<select>` 直書きで通すか。**配色や余白の改善提案はこのサブタスクの範囲外** だが、UI 拡張の前提条件として人間判断が要る。
5. **Tailwind v4 と `globals.css` の役割境界**：`globals.css` がグローバル要素（`h1`, `th`, `button`, `input` 等）まで定義しているため、shadcn コンポーネントを追加投入する際に二重スタイルが衝突する可能性。既存ページ（`/inventory`, `/shifts` 等）は `globals.css` クラスに強く依存しているので、shadcn 流 Tailwind ユーティリティへの寄せ替えは破壊的になる。Phase 0-C 受け入れテストの方針と合わせる必要あり。
6. **タブレット最適化の戦略**：Phase 5 でタブレット版日報入力に着手する前に、「既存ページとは別のレイアウト（`(tablet)/` ルートグループ）にするか」「Button `size="lg"` ＋ `globals.css` の min-height 拡大で兼用するか」を決める必要がある。
7. **`AppNav` コンポーネントの位置づけ**：`app/src/app/app-nav.tsx` は `Sidebar.tsx` で使われていない（`Sidebar` は内部で `isActivePath` を再実装）。`AppNav` は現状デッドコード相当か、別レイアウトで利用予定か、確認が必要。`layout.tsx` からは `MainLayout` 経由でしか参照されておらず、`AppNav` は実質未使用。
8. **印刷ビューの扱い**：`/prints/*` は専用 HTML を持つが、`MainLayout` の `Header` / `Sidebar` が `@media print` で隠れる前提に依存している。今後、`MainLayout` をベースから外したいページ（タブレット日報など）が出てきた場合は `layout.tsx` の構成を分岐する必要があり、要件確定後に Route Group 化を検討する。
