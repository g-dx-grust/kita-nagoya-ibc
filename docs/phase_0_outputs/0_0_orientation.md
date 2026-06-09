# Phase 0-0 オリエンテーション結果

調査日: 2026-05-28
担当: Claude Code（このセッションで実施）
入力プロンプト: [`prompts/v2/phase_0_subtasks/0_0_orientation.md`](../../prompts/v2/phase_0_subtasks/0_0_orientation.md)

---

## 1. リポジトリ構造（2階層）

```
kitagoya_production_system_handoff_v2/
├── .claude/
│   └── settings.local.json
├── AGENTS.md
├── CLAUDE.md
├── README.md
├── app/                         ← 実装済み Next.js + Prisma
│   ├── .env, .env.example
│   ├── README.md
│   ├── components.json          ← shadcn/ui 設定
│   ├── exports/
│   ├── next.config.ts
│   ├── package.json
│   ├── postcss.config.mjs
│   ├── prisma/                  ← schema.prisma, migrations, dev.db, seed.ts
│   ├── scripts/                 ← Excel/CSV 取込スクリプト群
│   ├── src/                     ← app/, components/, lib/
│   ├── tsconfig.json
│   └── vitest.config.ts
├── docs/                        ← 仕様（このリポの正）
│   ├── 00_project_overview.md
│   ├── 01_current_workflow_and_excel_assets.md
│   ├── 02_phase_0_foundation_and_master_data.md   (旧版)
│   ├── 03_phase_1_manual_production_plan_mvp.md   (旧版)
│   ├── 04_phase_2_inventory_material_procurement.md (旧版)
│   ├── 05_phase_3_shift_room_allocation.md         (旧版)
│   ├── 06_phase_4_daily_report_actuals_costing.md  (旧版)
│   ├── 07_phase_5_invoice_voucher_export.md        (旧版)
│   ├── 08_phase_6_product_stock_auto_planning.md   (旧版)
│   ├── 09_external_outsourcing_and_inter_location.md
│   ├── 10_data_model.md
│   ├── 11_api_contract.md
│   ├── 12_screen_requirements.md
│   ├── 13_business_rules.md
│   ├── 14_acceptance_tests.md
│   ├── 15_open_questions.md
│   ├── 16_backlog_ticket_list.md
│   ├── 17_operation_flow_manual.md
│   ├── 18_implementation_phase_plan.md            ← 新ターゲット
│   ├── 99_full_requirements_reference.md
│   ├── gpt新規実装.md                              ← 新ターゲット素材
│   ├── 文字起こし要約.md                            ← 新ターゲット素材
│   ├── 手間賃集計 最新.xlsx
│   ├── user_manual.html / pdf / user_manual_assets/
│   └── phase_0_outputs/                            ← Phase 0 成果物（このファイル含む）
├── manifests/
│   ├── excel_structure_summary.md
│   ├── source_file_manifest.md
│   └── zip_file_list.md
├── prompts/
│   ├── claude_code_master_prompt.md
│   ├── codex_master_prompt.md
│   ├── phase_prompts/                              ← 旧版（0〜6）
│   └── v2/                                          ← 新版（docs/18 対応）
└── source_files/
    ├── original_uploads/                           ← 元 Excel / 修正版文字起こし
    └── renamed_reference_copies/
```

備考: `.git/` は無い（このプロジェクトは git 管理外）。

---

## 2. docs/ ファイルカタログ

| ファイル | サマリ | docs/18 との関係 |
|---|---|---|
| 00_project_overview.md | プロジェクト目的・想定ユーザー・MVP方針 | [正] 不変方針の土台 |
| 01_current_workflow_and_excel_assets.md | 既存 Excel 業務の現状記述 | [素材] 現状把握用 |
| 02_phase_0_foundation_and_master_data.md | 旧 Phase 0：基盤・マスタ | [参考] 内容は新 Phase 1 に吸収 |
| 03_phase_1_manual_production_plan_mvp.md | 旧 Phase 1：手動生産予定 MVP | [参考] 新 Phase 3 に吸収（CLAUDE.md は本ファイル必読指定） |
| 04_phase_2_inventory_material_procurement.md | 旧 Phase 2：在庫・発注 | [参考] 新 Phase 2 + Phase 4 |
| 05_phase_3_shift_room_allocation.md | 旧 Phase 3：シフト・割り振り | [参考] 新 Phase 1（マスタ）+ Phase 8（割当） |
| 06_phase_4_daily_report_actuals_costing.md | 旧 Phase 4：日報・実績反映 | [参考] 新 Phase 5 |
| 07_phase_5_invoice_voucher_export.md | 旧 Phase 5：請求 CSV/Excel | [参考] 新 Phase 6 |
| 08_phase_6_product_stock_auto_planning.md | 旧 Phase 6：自動生産提案 | [参考] 新 Phase 8 + Phase 9 |
| 09_external_outsourcing_and_inter_location.md | 外注/AX、拠点間連携の扱い | [素材] 横断（請求対象フラグ等） |
| 10_data_model.md | データモデル定義 | [素材] Phase 0-1 で使用 |
| 11_api_contract.md | API 契約 | [素材] Phase 0-2 で使用 |
| 12_screen_requirements.md | 画面要件 | [素材] Phase 0-A で使用、docs/18 §19-4 と突合 |
| 13_business_rules.md | 業務ルール（状態遷移など） | [素材] Phase 0-1, 0-3 で使用 |
| 14_acceptance_tests.md | 受け入れテスト | [素材] Phase 0-C で使用 |
| 15_open_questions.md | 未確定事項 | [素材] docs/18 §17 と突合（Phase 0-B） |
| 16_backlog_ticket_list.md | バックログチケット | [参考] 着手判断材料 |
| 17_operation_flow_manual.md | 運用フロー手順 | [素材] Phase 0-B で使用 |
| 18_implementation_phase_plan.md | **新ターゲットの実装計画（Phase 0〜9）** | [正] 全フェーズの主軸 |
| 99_full_requirements_reference.md | 全要件リファレンス | [参考] 全文索引用途 |
| gpt新規実装.md | docs/18 の素材（GPT 出力） | [素材] docs/18 がこれを統合済み |
| 文字起こし要約.md | 2026-05-21 修正版文字起こしの要約 | [素材] docs/18 がこれを統合済み |
| 手間賃集計 最新.xlsx | 手間賃 Excel 現物 | [素材] Phase 6 で使用 |
| user_manual.html / pdf | ユーザー向け資料 | [素材] UI 設計参考 |

---

## 3. app/ 構造（2階層、node_modules 除外）

```
app/src/
├── app/                                ← Next.js App Router
│   ├── api/
│   │   ├── billing-prices/              (Phase 6 系)
│   │   ├── calculations/                (Phase 3 系)
│   │   ├── capacities/                  (Phase 1 マスタ)
│   │   ├── daily-reports/               (Phase 5 系)
│   │   ├── employees/                   (Phase 1 マスタ)
│   │   ├── export/                      (Phase 6 系)
│   │   ├── import/                      (Phase 7 系の入口、CSV)
│   │   ├── inventory/                   (Phase 2 系)
│   │   ├── invoice-exports/             (Phase 6 系)
│   │   ├── materials/                   (Phase 1 マスタ)
│   │   ├── packaging-materials/         (Phase 1 マスタ)
│   │   ├── product-demands/             (Phase 8 系？)
│   │   ├── product-monthly-actuals/     (Phase 8 系？)
│   │   ├── product-planning/            (Phase 3 or 8 系)
│   │   ├── production-plans/            (Phase 3 系)
│   │   ├── products/                    (Phase 1 マスタ)
│   │   ├── purchase-candidates/         (Phase 4 系)
│   │   ├── purchase-orders/             (Phase 4 系)
│   │   ├── shifts/                      (Phase 1 マスタ)
│   │   ├── suppliers/                   (Phase 1 マスタ)
│   │   └── work-areas/                  (Phase 1 マスタ)
│   ├── app-nav.tsx                      ← ナビゲーション
│   ├── capacity-review/                 (Phase 1 or 5 系)
│   ├── globals.css
│   ├── inventory/                       (Phase 2 画面)
│   ├── invoices/                        (Phase 6 画面)
│   ├── layout.tsx                       ← ルートレイアウト（デザイン保護対象）
│   ├── masters/                         (Phase 1 マスタ画面群)
│   │   ├── csv-import.tsx
│   │   ├── employees/, materials/, packaging/, products/, work-areas/
│   │   ├── master-delete-button.tsx
│   │   ├── master-edit-button.tsx
│   │   └── master-form.tsx
│   ├── page.tsx                         ← ホーム
│   ├── prints/                          (印刷系)
│   │   ├── production-schedule/, staff-assignments/
│   │   ├── print-button.tsx
│   │   └── page.tsx
│   ├── product-planning/                (Phase 3 or 8 画面)
│   ├── production-plans/                (Phase 3 画面)
│   │   ├── [id]/, auto/, monthly/, new/
│   │   ├── page.tsx, plan-form.tsx, plan-list-table.tsx
│   ├── purchases/                       (Phase 4 画面)
│   └── shifts/                          (Phase 1 画面)
├── components/
│   ├── layout/                          ← Header, Sidebar, MainLayout
│   └── ui/                              ← badge, button, card, input, menu-card, table
└── lib/
    ├── audit.ts                         ← 監査ログ
    ├── calculations.ts / .test.ts       ← 計算ロジック（Phase 3?）
    ├── csv.ts / .test.ts                ← CSV ユーティリティ
    ├── http.ts
    ├── inventory.ts                     ← 在庫計算（Phase 2?）
    ├── labels.ts
    ├── material-forecast.ts / .test.ts  ← 原料予測（Phase 4 or 8?）
    ├── monthly-inventory-sheet.ts / .test.ts
    ├── monthly-production-forecast.ts / .test.ts  ← 月間予測（Phase 8?）
    ├── monthly-production-schedule.ts / .test.ts
    ├── monthly-shift-simulation.ts / .test.ts     ← 仮シフト（Phase 8?）
    ├── paths.ts
    ├── plan-engine.ts                              ← 計画エンジン
    ├── prisma.ts                                   ← Prisma クライアント
    ├── product-planning-service.ts
    ├── product-planning.ts / .test.ts
    ├── schedule.ts / .test.ts                      ← スケジューリング
    ├── schemas.ts                                  ← Zod スキーマ
    ├── time.ts
    └── utils.ts
```

**観測：既存実装はかなり広い**。docs/18 で言えば Phase 1（マスタ）・Phase 2（在庫）・Phase 3（手動予定）・Phase 4（発注）・Phase 5（日報）・Phase 6（請求）・Phase 7（CSV取込）・Phase 8（月間予測・シミュレーション）にあたるディレクトリ／ファイル名がすでに存在する。**完成度・整合性は 0-1, 0-2, 0-A で確認する**。

---

## 4. 不変ルール（CLAUDE.md + docs/18 から抽出）

Phase 1〜9 を通じて守る不変ルール：

1. **旧版 Lark カレンダー要件は無視**。正解は 2026-04-24 修正版文字起こし系の docs/18。
2. **初期 MVP では生産計画の自動生成は行わない**。生産予定は人が登録する（自動生成解禁は Phase 8）。
3. **商品名・商品番号・原料名・資材名は正式なマスタ名称を使う**。曖昧な手入力名称をキーにしない。
4. **部屋名・外注先名は固定値にせず、マスタで追加・変更可能に**。
5. **文字起こし上で不確実な語はコードにハードコードしない**（例：「カラーテレビ」「トラック部屋」「トラップ部屋」「アクス/パックス」など）。
6. **計算式はユニットテスト化する**。
7. **監査ログを残す**：在庫を減らす処理／日報確定／発注確定／請求出力。
8. **`planned_*` と `actual_*` を分ける**。予定値と実績値を混同しない。
9. **発注済み未入荷は確定在庫と別扱い**（未確定発注フラグ）。
10. **外注/AX の生産は社内請求対象外になりうる**。請求対象フラグを必須にする。
11. **既存機能を壊さない**：既存 API レスポンスを変えない、既存データを消さない。
12. **自動計算結果はまず候補として保存**し、人が承認するまで本予定／本発注／本在庫に反映しない。
13. **再計算可能に設計**：途中で失敗しても戻せる。
14. **マスタには `active`, `valid_from`, `valid_to` を持たせる**（改廃対応）。
15. **デザイン保護**：UI コンポーネント（`components/ui/`）、`layout.tsx`、`globals.css` は Phase 1 以降も慎重に扱う（追加カラム表示はOK、構造変更は NG）。

---

## 5. 旧版 docs と新版 docs/18 の対応

| 旧版 docs | 旧 Phase 内容 | 新版 docs/18 | 状態 |
|---|---|---|---|
| 02_phase_0_foundation_and_master_data.md | 基盤・マスタ・取込 | Phase 0（既存調査）+ Phase 1（マスタ拡張） | [参考保持]：内容は分割吸収。新では Phase 0 は調査専念、マスタは Phase 1 へ |
| 03_phase_1_manual_production_plan_mvp.md | 手動生産予定 MVP（3計算モード含む） | Phase 3 | [参考保持]：CLAUDE.md で必読指定。新ではフェーズ番号がズレるだけ |
| 04_phase_2_inventory_material_procurement.md | 原料・資材在庫、発注、未確定発注 | Phase 2（在庫台帳） + Phase 4（発注アラート・発注書） | [参考保持]：2つに分解 |
| 05_phase_3_shift_room_allocation.md | 出勤表・作業場所割り振り | Phase 1（マスタ） + Phase 8（自動割当） | [参考保持]：マスタ部分は前倒し、割当は自動生成と一緒に Phase 8 |
| 06_phase_4_daily_report_actuals_costing.md | 日報・実績反映・原価計算 | Phase 5 | [参考保持]：番号ズレのみ |
| 07_phase_5_invoice_voucher_export.md | 請求/売上伝票 CSV/Excel | Phase 6 | [参考保持]：番号ズレのみ |
| 08_phase_6_product_stock_auto_planning.md | 製品在庫連携・自動生産提案・AI | Phase 7（連携）+ Phase 8（自動計画）+ Phase 9（AI/異常検知） | [参考保持]：3つに分解、AI 部分が独立 |
| 09_external_outsourcing_and_inter_location.md | 外注/AX、拠点間連携 | 横断（Phase 1 マスタ + Phase 6 請求対象フラグ） | [参考保持]：フェーズ横断要件 |
| 10〜17, 99 | データモデル／API／画面／業務ルール／受け入れテスト／未確定事項／運用フロー／参考 | docs/18 各フェーズが参照する素材 | [素材保持]：書き換え不要 |

**結論**：旧版 02〜08 は破棄せず参考保持。新の正は docs/18。実装着手は新ターゲット（docs/18）に従う。

---

## 6. 判断保留事項

このサブタスクで決められない、後続サブタスクや人間判断に回すべき事項：

1. **旧版 docs と新版 docs/18 で表現が異なる業務ルール**（例：休憩時間が旧 docs/03 では「12:00〜13:00 + 15:00〜15:15 固定」と書かれているが、docs/18 §H では「合計75分、9時・15時の休憩」と表現）→ **0-B で要確認**。
2. **既存 app/ の実装が docs/18 でいうどのフェーズに対応するか**：ディレクトリ名から推測したが、中身の整合性は 0-1（DB）と 0-2（API/lib）で精査。
3. **`product-demands`, `product-monthly-actuals`, `product-planning`, `monthly-production-forecast`, `monthly-shift-simulation` が docs/18 のどこに対応するか**：新 Phase 8（自動生成）の前倒し実装の可能性。0-2 で精査。
4. **`prompts/phase_prompts/` の旧プロンプト（0〜6）の扱い**：v2 と並存させるか、削除推奨か。**人間判断**。
5. **docs/02 が「基盤・認証・マスタ・Excel取込」を1フェーズに束ねていたのに対し、docs/18 は Phase 0（調査）と Phase 1（マスタ）に分解**：認証は docs/18 では明示されていない。既存実装に認証が入っているか？ → 0-2 で確認。
6. **デザイン保護の具体的境界**：`components/ui/` が shadcn/ui ベース（`components.json` 有り）。shadcn 流の差し替え運用とどう両立するか。0-A で確認。
7. **`app/exports/` ディレクトリの位置づけ**：これは生成物の置き場か、それとも実装コードか。0-2 で確認。
8. **`.env`, `.env.example` の現状確認**：DB 接続が PostgreSQL か SQLite か（`prisma/dev.db` があるので SQLite 開発の可能性）。docs/18 では PostgreSQL 推奨。0-1 で確認。

---

## 補足: 既存実装の見立て（要 0-1, 0-2 検証）

ディレクトリ名から推測する既存実装の進捗：

| docs/18 Phase | 推定進捗 | 根拠 |
|---|---|---|
| Phase 0 | 進行中 | このオリエンテーションがその一部 |
| Phase 1（マスタ） | **かなり実装済み** | products / materials / packaging / employees / shifts / suppliers / work-areas / capacities すべて存在 |
| Phase 2（在庫台帳） | **部分実装** | inventory/, lib/inventory.ts あり。ledger 形式かは未確認 |
| Phase 3（手動予定 MVP） | **実装済み** | production-plans/, plan-form, plan-engine.ts, calculations.ts あり |
| Phase 4（発注アラート） | **部分実装** | purchase-candidates/, purchase-orders/, material-forecast.ts あり。発注書 PDF 自動生成は未確認 |
| Phase 5（日報） | **部分実装** | daily-reports/, capacity-review/ あり。承認フロー・タブレット最適化は未確認 |
| Phase 6（請求出力） | **部分実装** | invoice-exports/, invoices/, billing-prices/, export/ あり |
| Phase 7（業務管理連携） | **未確認** | import/ がそれに該当する可能性 |
| Phase 8（需要予測・自動割当） | **前倒し実装あり** | monthly-production-forecast, monthly-production-schedule, monthly-shift-simulation, product-planning が該当しそう |
| Phase 9（AI/異常検知） | **未着手と推定** | 該当ディレクトリ／ファイル無し |

→ **重要**：既存実装は docs/18 のフェーズ順を超えて先回り実装されている部分がある。Phase 0-3（境界線確定）で「どこを残し／どこを補強し／どこを置き換える」を整理する必要がある。
