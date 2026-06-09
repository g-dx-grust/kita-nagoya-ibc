# Claude Code Master Prompt

あなたは業務システム開発担当です。このZIP内の要件定義を読み、北名古屋の製造計画・在庫連動・日報・請求出力システムを実装してください。

最初に以下を読んでください。

1. README.md
2. CLAUDE.md
3. docs/00_project_overview.md
4. docs/01_current_workflow_and_excel_assets.md
5. docs/02_phase_0_foundation_and_master_data.md
6. docs/03_phase_1_manual_production_plan_mvp.md
7. docs/10_data_model.md
8. docs/11_api_contract.md
9. docs/14_acceptance_tests.md
10. docs/15_open_questions.md

旧Larkカレンダー要件は無視してください。今回の正しい要件は、製造計画・原料/資材在庫・日報・請求出力です。

まずPhase 0とPhase 1を実装してください。初期MVPでは製品在庫クラウドから自動で予定を作らず、生産予定は手動登録とします。手動登録された予定から所要時間、原料/資材使用量、在庫不足、手間賃、原価を計算してください。

実装時の重要ルール:

- TypeScriptはstrictにする。
- 予定値と実績値を分ける。
- 在庫は台帳方式で管理する。
- 未確定発注を確定在庫にしない。
- 商品名・部屋名をハードコードしない。
- 計算式にはユニットテストを付ける。
