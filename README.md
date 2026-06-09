# 北名古屋 製造計画・在庫連動システム 要件定義 / 開発ハンドオフ v2

このZIPは、修正版の文字起こし `2026-04-24 16:07:30 CST` を正として作り直した開発チーム向け一式です。以前のLarkカレンダー中心の要件は本ZIPでは対象外です。開発チーム・Claude Code・Codexには、このZIPだけを基準に実装を進めてください。

## まず読む順番

1. `README.md`
2. `CLAUDE.md` または `AGENTS.md`
3. `docs/00_project_overview.md`
4. `docs/01_current_workflow_and_excel_assets.md`
5. `docs/02_phase_0_foundation_and_master_data.md`
6. `docs/03_phase_1_manual_production_plan_mvp.md`
7. `docs/10_data_model.md`
8. `docs/11_api_contract.md`
9. `docs/14_acceptance_tests.md`
10. `docs/15_open_questions.md`
11. `docs/17_operation_flow_manual.md`

ユーザー向けのスクリーンショット付き説明資料はローカル handoff には含まれますが、public GitHub では実データ露出を避けるため除外します。

- `docs/user_manual.html`
- `docs/user_manual.pdf`

本番公開手順:

- `docs/PRODUCTION_DEPLOYMENT.md` (Vercel + Supabase、初期データ移行ルール)

## 今回の本質

既存Excelで行っている「製品在庫・生産予定・原料/資材使用量・発注・出勤表・日報・手間賃/原価・伝票入力」を、段階的にWebシステム化する。

最初から完全自動で生産計画を組ませるのではなく、初期MVPでは **生産予定は人が手入力し、その予定から下流の計算・チェック・発注・日報・出力を自動化する** 方針とする。

## MVPで優先すること

- 商品マスター、原料/資材マスター、手間賃/生産能力マスターを登録・参照できること
- 生産予定を手動登録できること
- 生産数・人数・開始時刻から終了時刻を自動計算できること
- 9:00〜17:00などの時間枠から可能生産数・あふれ数量を計算できること
- 生産予定から原料使用量、資材使用量、手間賃、原価見込みを自動計算できること
- 原料/資材の在庫不足、マイナス、未確定発注をアラートできること
- 日報実績入力により予定値を実績値へ置き換え、在庫・原価・請求用データへ連動できること
- FXクラウド等の伝票システムへ投入するCSV/Excelを作成できること

## フェーズ分け

- Phase 0: 基盤・認証・マスター・Excel参照データ取り込み
- Phase 1: 手動生産予定MVP、時間/数量/人数計算
- Phase 2: 原料・資材在庫、発注、入荷予定、未確定発注アラート
- Phase 3: 出勤表、部屋/作業場所割り振り、合流・移動サポート
- Phase 4: 日報、実績反映、原価・手間賃集計
- Phase 5: 請求/売上伝票CSV・Excel出力
- Phase 6: 製品在庫クラウド連携、自動生産提案、AI/最適化

## ZIP内の主な内容

- `docs/`: フェーズ別要件定義、DB/API/画面/テスト/未確定事項
- `prompts/`: Claude Code / Codex にそのまま渡す実装プロンプト
- `source_files/original_uploads/`: 元Excelと修正版文字起こし
- `source_files/renamed_reference_copies/`: 開発チームが扱いやすい名称にリネームした参照用コピー
- `manifests/`: ファイル対応表、Excel構造サマリー、ZIP内ファイル一覧

## 注意

文字起こしには誤変換が残っています。特に「カラーテレビ」「トラック部屋」「トラップ部屋」「アクス/パックス」などの名称は正式名称が未確定です。実装では固定文字列にせず、作業場所マスター・外注先マスターとして変更可能にしてください。
