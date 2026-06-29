# 20. デザイン↔機能 カバレッジ表（回帰防止用）

UIリデザイン時に「見た目が先行して必須機能が消える」ことを防ぐためのトレーサビリティ表。

**原則: 真実の源泉(source of truth)はUIではなく、`docs/` の受け入れ基準・画面要件・既存ルートである。**
UIを作り替えるときは、この表で「各機能の居場所(画面)」が必ず1つ以上残っていることを確認する。

- Figmaファイル: `北名古屋 製造管理システム UI` / fileKey `MoFI6LDiDEmqDRqt16TLFo`
- 凡例: ✅ Figma作成済 / 🟡 一部のみ / ⛔ Figma未作成（要追加） / ⬜ MVP対象外(将来Epic)

最終更新: 2026-06-30

> **2026-06-30 改訂**: `/product-planning`・`/production-plans/auto`・`/production-plans/monthly/confirm`・`ProductDemand`（受注/仮受注/出荷予定）・再計画キュー（`/planning/monthly#replan`）は**将来扱いを解除し、現行MVPとして扱う**。現行コードで月次計画・受注生産・在庫生産・再計画に組み込まれている重要導線であり、Figma 22〜25 を追加した（§F）。将来Epic7に残すのは高度な需要予測の自動化・拠点間在庫移動・製品在庫クラウド連携・外注先在庫のみ。

---

## A. 画面要件カバレッジ（`docs/12_screen_requirements.md` 基準）

| # | 画面要件 | Figmaページ | 状態 | 残課題 |
|---|---|---|---|---|
| 1 | ダッシュボード | 01 Dashboard | ✅ | — |
| 2 | 生産予定カレンダー/月間表 | 02 Production Plan / 14 Monthly Planning Hub / 20 Monthly Calendar | ✅ | 14=8ステップ司令塔、20=マス目カレンダー＋前々月・前年同月比の月次予測。完了 |
| 3 | 生産予定登録画面 | 02 Production Plan（右パネル） | ✅ | 3計算モード/BOM自動計算/不足/17時超過 反映済 |
| 4 | 原料在庫画面 | 04 Material Inventory / 21 Daily Inventory Projection | ✅ | 原料別「日別」在庫見込みの時系列ビューを 21 で追加（確定/未確定入荷の分離・安全在庫線・不足/マイナス判別） |
| 5 | 資材在庫画面 | 05 Packaging Inventory | ✅ | ロット・包材単位対応済 |
| 6 | 発注管理画面 | 10 Purchase Orders | ✅ | 候補→発注→未確定→確定→入荷 |
| 7 | 出勤表/シフト画面 | 11 Shift Schedule | ✅ | 月/半月・仮/確定・出勤人数サマリー・Excel取込 |
| 8 | 作業場所割り振り画面 | 12 Work Area Allocation | ✅ | タイムライン・重複警告・合流候補 |
| 9 | 日報入力画面 | 07 Daily Report | ✅ | 予定/実績対比・差異・在庫反映導線 |
| 10 | 原価/手間賃集計画面 | 13 Cost & Labor | ✅ | 商品/日/月/作業場所別・予実差異 |
| 11 | 請求/伝票出力画面 | 09 Voucher Export | ✅ | 外注除外・CSV/Excel・出力履歴 |
| 12 | マスター管理 | 08 Master Data / 19 Master Edit Forms | ✅ | 一覧(08)＋各**編集フォーム**(19)を追加。商品(原料ロス率許容値含む)/BOM/原材料/包材/生産能力/従業員/作業場所/仕入先/請求単価/伝票連携マッピングの10モーダル。型流用でN件カバー |

---

## B. 受け入れ基準カバレッジ（`docs/14_acceptance_tests.md` ／ CLAUDE.md）

| 受け入れ基準 | 担当Figma画面 | 状態 |
|---|---|---|
| 商品マスターにBOM・1人時生産量・手間賃単価を設定 | 08（一覧）／19（編集フォーム: 商品/BOM/生産能力 等） | ✅ |
| 数量固定モード（終了時刻算出） | 02 計算モード | ✅ |
| 時間枠固定モード（最大数量・あふれ） | 02 計算モード | ✅ |
| 17時超過アラート（残業・翌営業日持ち越し） | 02 自動計算パネル | ✅ |
| 生産予定→原料/資材 予定使用量 | 02 BOMパネル / 03 詳細 | ✅ |
| 在庫不足・マイナス・未確定入荷の判別 | 04 / 05 / 06 | ✅ |
| 未確定発注依存アラート | 06 / 04 | ✅ |
| 発注確定（候補→未確定→確定→入荷） | 10 | ✅ |
| 重複割り振り防止 | 12 | ✅ |
| 合流候補 | 12 | ✅ |
| 日報実績で在庫を実績値へ差し替え | 07 | ✅ |
| 請求/売上CSV・Excel出力＋履歴 | 09 | ✅ |

---

## C. 既存コードのルート ↔ Figma 対応

| 既存ルート (`app/src/app/*`) | 機能 | Figma | 状態 |
|---|---|---|---|
| `production-plans`, `/new`, `/[id]` | 生産予定一覧/登録/詳細 | 02 / 03 | ✅ |
| `production-plans/monthly` (＝計画ハブ `planning/monthly`) | 月間生産予定/計画ループ司令塔 | 02（月タブ） / 14 Monthly Planning Hub / 20 Monthly Calendar | ✅ 14=司令塔、20=マス目カレンダー＋月次予測 |
| `production-plans/allocate` | 作業場所割り振り | 12 | ✅ |
| `product-planning` | 製品在庫・受注/出荷予定・生産候補（在庫/受注生産） | 22 Product Planning Hub | ✅ 現行MVP。ProductDemand(受注/仮受注/出荷予定)の登録・予定化・月次実績取込 |
| `product-demands`(API) | 受注/仮受注/出荷予定/需要予測（ProductDemand: open/tentative/fulfilled/cancelled） | 22 / 23 | ✅ 現行計画フローの一部。受注→生産予定の予定化動線・受注消し込み |
| `production-plans/monthly/confirm` | 月次計画 仮確定・確定ゲート | 23 Monthly Plan Decision | ✅ 現行MVP。draft→tentative_confirmed→confirmed の判定・一括仮確定/確定 |
| `production-plans/auto`(+`api/production-plans/auto-schedule`) | 生産スケジュール自動作成（出勤シフト連動の自動配置） | 24 Auto Production Schedule | ✅ 現行MVP。仮予定(draft)を自動作成・作業場所/スタッフ変更・印刷導線 |
| `planning/monthly#replan`, `replan-jobs`, `replan-events` | 再計画キュー（在庫生産だけ再編成） | 25 Replan Queue | ✅ 現行MVP。受注/入荷/在庫変化の再計画待ち・適用/見送り |
| `special-demand-events`／高度な需要予測の自動化・拠点間在庫移動・製品在庫クラウド連携・外注先在庫 | 特需イベント／在庫高度連携 | — | ⬜ 将来Epic7（MVP対象外） |
| `inventory`, `materials`, `packaging-materials` | 在庫台帳／日別見込み | 04 / 05 / 21 Daily Inventory Projection | ✅ 日別在庫見込み時系列を21で追加 |
| `purchases`, `purchase-candidates`, `purchase-orders` | 発注 | 10 | ✅ |
| `shifts`, `shift-patterns`, `shift-change-requests` | 出勤表/シフト（管理） | 11 | ✅ |
| `shift-entry/[token]` | 従業員セルフシフト希望入力（スマホ/外部トークン） | 18 Self Shift Entry | ✅ 入力中/送信完了/トークン無効/期限切れ の4状態 |
| `production-daily-reports`(+dashboard) | 日報蓄積B（正） | 07 | ✅ |
| `daily-reports`（旧A） | 旧日報 | — | ⬜ 引退済（memory: daily-report-b-authoritative） |
| `invoices`, `invoice-exports`, `billing-prices` | 請求/伝票 | 09 | ✅ |
| `masters/*` | 各マスタ（一覧＋編集） | 08 / 19 Master Edit Forms | ✅ 10種の編集モーダル（型流用） |
| `capacity-review`, `product-monthly-labor-fees`, `capacities` | 原価/手間賃/生産能力 | 13 | ✅（生産能力マスタ編集は08側で要追加） |
| `prints`（入口ハブ） | 印刷物ハブ（対象日/拠点切替・各印刷への導線） | 15 Print Hub | ✅ |
| `prints/production-schedule` | 部屋別 作業日報 紙フォーム印刷 | 16 Production Schedule Print | ✅ サイドバー無し・枠線主体・空行（手書き追記）・備考 |
| `prints/staff-assignments` | スタッフ配置表 印刷 | 17 Staff Assignment Print | ✅ サイドバー無し・部屋別タイムライン(9–18・休憩網掛け)＋スタッフ別一覧＋未割当警告 |
| `staff-daily-reports` | スタッフ日報（入力は07側） | 07 | 🟡 印刷側は16へ集約 |

---

## D. 運用ルール（これを守れば機能は落ちない）

1. **Definition of Done**: UI変更の完了条件は「見た目の完成」ではなく、**B表の各受け入れ基準が、いずれかの画面に居場所を持っていること**。
2. **旧画面の廃止は“移設後”**: 既存画面を消す/置き換える前に、その画面が満たしていた受け入れ基準を上の表で確認し、新画面へ移してからにする。
3. **新機能を足したらこの表に1行**: 受け入れ基準・ルート・Figma画面の3点セットで追記する。
4. **マスタ等のCRUDはテンプレ流用**: 08 Master Data／各編集モーダルの型を再利用し、全マスタ分を個別に描かない（型1つ＝N個のマスタをカバー）。
5. **現行MVPと将来Epicを区別する**: 製品在庫・受注計画（`/product-planning`・22）／月次仮確定・確定ゲート（`/production-plans/monthly/confirm`・23）／生産スケジュール自動作成（`/production-plans/auto`・24）／再計画キュー（`/planning/monthly#replan`・25）／ProductDemand（受注・仮受注・出荷予定）は**現行MVP**。生産予定の登録・確定は人が行い、24 の自動作成は「出勤シフトに合わせた配置の補助（商品候補・数量は人が確定し、作成物は draft）」であって全自動の生産計画生成ではないため、CLAUDE.md「初期MVPで自動生成は行わない／生産予定は人が登録する」と矛盾しない。将来Epic7に残すのは、高度な需要予測の自動化・拠点間在庫移動・製品在庫クラウド連携・外注先在庫のみ。「対象外」は表に残し、未着手と区別する。
6. **現行ルートは削除・統合前提にしない**: 22〜25 は既存ルートを正式に画面化したもの。既存画面（02/12/14/20 等）や旧ルートを置き換える前提にしない。22〜25 は 14 Monthly Planning Hub からの導線（§F.1）で接続する。

---

## E. 既知の残タスク（Figma追加候補・優先度順）

1. （将来Epic7・MVP対象外）高度な需要予測の自動化・拠点間在庫移動・製品在庫クラウド連携・外注先在庫・特需イベント。製品在庫・受注計画／月次仮確定・確定ゲート／生産スケジュール自動作成／再計画キュー／ProductDemand は**現行MVPとして実装済み・Figma化済み（22〜25, 2026-06-30）**であり、ここには含めない。

**MVP対象の残タスクは全て作成済み（2026-06-29〜06-30）**:
- 製品在庫・受注計画（受注/仮受注/出荷予定・生産候補）→ 22 Product Planning Hub
- 月次計画 仮確定・確定ゲート（draft→tentative_confirmed→confirmed）→ 23 Monthly Plan Decision
- 生産スケジュール自動作成（出勤シフト連動・仮予定draft作成）→ 24 Auto Production Schedule
- 再計画キュー（在庫生産だけ再編成）→ 25 Replan Queue
- マスタ各編集フォーム → 19 Master Edit Forms（10モーダル）
- 作業日報の紙フォーム印刷 → 16 Production Schedule Print・17 Staff Assignment Print・入口=15 Print Hub
- セルフシフト入力 → 18 Self Shift Entry
- 月間カレンダー(マス目)＋前々月・前年同月比の月次予測 → 20 Monthly Calendar
- 原料/資材の「日別在庫見込み」時系列ビュー → 21 Daily Inventory Projection

---

## F. 2026-06-29 追加ページ（Figma 14〜19・node id）

| ページ | node id | 対応ルート | サイドバー | 主な内容 |
|---|---|---|---|---|
| 14 Monthly Planning Hub | `79:2`（screen `80:2`） | `…/planning/monthly`（active=plan） | あり | 8ステップ横ステッパ（仮確定=warning）＋各ステップ要約KPIカード |
| 15 Print Hub | `79:3`（screen `85:2`） | `/prints`（active=report） | あり | 対象日/拠点フィルタ＋作業日報印刷/スタッフ配置印刷の2カード（状態バッジ・印刷プレビュー導線） |
| 16 Production Schedule Print | `79:4`（screen `86:2`） | `/prints/production-schedule` | **なし**（印刷用） | 印刷バー＋A4シート。部屋別ブロック（作業日/ラインNo/記入者/責任者＋担当者/商品/数量/注意事項＋空行）＋備考 |
| 17 Staff Assignment Print | `79:5`（screen `90:2`） | `/prints/staff-assignments` | **なし**（印刷用） | 部屋別タイムライン(9–18・休憩網掛け・配置バー)＋スタッフ別一覧（未割当=warning） |
| 18 Self Shift Entry | `79:6`（frames `93:2`/`94:2`/`94:16`/`94:26`） | `/shift-entry/[token]` | **なし**（スマホ390幅） | 4状態フレーム: 入力中(下書き)／送信完了(success)／トークン無効(error)／期限切れ(error)。出勤/休みトグル＋希望時間＋メモ＋送信 |
| 19 Master Edit Forms | `79:7`（board `97:2`） | `masters/*`（active=master・モーダル） | あり（背面）＋オーバーレイ | 10編集モーダル: 商品(原料ロス率許容値含む)/BOM/原材料/包材/生産能力/従業員/作業場所/仕入先/請求単価/伝票連携マッピング |
| 20 Monthly Calendar | `103:2`（screen `104:2`） | `production-plans/monthly`（active=plan） | あり | 月次予測カード(前々月5月・前年同月2025/7比＋採用バッジ)＋7月マス目カレンダー（予定=青/仮確定=橙/確定=緑チップ・土日色分け・あふれ表示） |
| 21 Daily Inventory Projection | `103:3`（screen `106:2`） | `inventory`/`materials`（active=material） | あり | フィルタ(品目/期間/表示)＋在庫推移チャート(確定=teal棒・未確定込=青ゴースト・安全在庫線・マイナス=danger)＋日別テーブル(充足/安全在庫割れ/未確定入荷で充足) |

### F.2 2026-06-30 追加ページ（Figma 22〜25・現行MVP・将来扱い解除）

| ページ | node id | 対応ルート | サイドバー | 主な内容 |
|---|---|---|---|---|
| 22 Product Planning Hub | `126:2`（screen `126:3`） | `/product-planning`（active=plan.hub） | あり | 製品在庫一覧(商品/現在庫=確定/予定生産/受注·出荷予定/安全在庫/不足/推奨アクション・**未確定入荷込みは別判定**)＋受注/仮受注/出荷予定 登録(商品·需要種別[受注/出荷予定/需要予測]·状態[受注/仮受注]·出荷予定日·製造予定日·数量·得意先/外部参照/備考)＋未処理受注一覧(予定化/紐づく生産予定リンク/再計画リンク)＋月次実績CSV取込導線＋生産候補(現在庫/予定生産/受注·出荷/安全在庫/不足/推奨生産数・**在庫生産/受注生産/未確定依存**) |
| 23 Monthly Plan Decision | `131:2`（screen `131:3`） | `/production-plans/monthly/confirm`（active=plan.hub） | あり | 状態ゲート(**仮予定draft→仮確定tentative_confirmed→確定confirmed**・各昇格条件を明示)＋判定一覧(日付/数量/作業場所/開始/人数の**簡易編集セル**・BOM不足/原料·包材不足/**未確定入荷依存**/安全在庫割れ/**発注裏付け済み**を別列)＋**一括仮確定/一括確定**＋未処理ProductDemandを仮予定化する表 |
| 24 Auto Production Schedule | `131:140`（screen `131:141`） | `/production-plans/auto`（active=plan.hub） | あり | 準備フロー(対象日/商品候補/不足候補読込/出勤シフト確認/作業場所·能力登録の準備状況)＋入力(計算モード/開始時刻/休憩)＋商品候補一覧＋**自動作成プレビュー**(作業場所の自動選択/変更・スタッフ割当プレビュー・**仮予定draftとして作成**)＋作成後の印刷導線(作業日報印刷/スタッフ配置印刷) |
| 25 Replan Queue | `131:278`（screen `131:279`） | `/planning/monthly#replan`（active=plan.hub）／`/product-planning`・`/production-plans/allocate` からも到達 | あり | 再計画ポリシー(受注登録後に再計画待ち・**在庫生産だけ再編成**・**受注生産/確定/完了済みは固定**)＋ReplanJob一覧(発生事由/**再計画対象日**/**作成·置換·未配置件数**/状態[planned/applied/rejected]/適用·見送り/関連**ProductDemand·ProductionPlan·ReplanJob**リンク) |

> 22〜25 はサンプルデータで描画。実データは商品・作業場所・従業員・仕入先・原料・包材・需要すべてマスター/API由来。確定在庫と未確定入荷込み在庫、予定値(`planned_*`)と実績値(`actual_*`)は混同しない。

> 既存に残すべき画面: `07 予実サマリ（参考）` は分析用に残置／旧 `/daily-reports`(A系統) はコード残置・非表示（[memory: daily-report-b-authoritative]）／印刷ルートは既存 `prints/*` を踏襲。

### F.1 ナビゲーション階層（2026-06-30 更新・全ページ反映済み）

サイドバーを**階層ナビ（サブ項目を常時展開）**に作り替え、全画面(00 Design System の Sidebar 8:2 ＋ 01〜15・20・21)へ再適用済み。1サイドバー項目＝1機能セクションで、同一セクションの複数ビューはサブ項目で切り替える（詳細は `docs/21` §3.1.1）。

| セクション | サブ項目（active key） | 対応Figmaページ |
|---|---|---|
| ダッシュボード | dashboard | 01 |
| 生産計画 | plan.calendar / plan.hub / plan.list | 20 / 14 / 02（詳細03はドリルダウン） |
| 出勤・シフト | shift | 11 |
| 作業場所割り振り | allocate | 12 |
| 原料在庫 | material.ledger / material.projection | 04 / 21 |
| 包材在庫 | packaging | 05 |
| 不足アラート | shortage | 06 |
| 発注管理 | purchase | 10 |
| 日報実績 | report | 07 |
| **印刷（新設）** | print.hub / print.schedule / print.staff | 15 / 16 / 17（16/17はサイドバー無し全画面） |
| 原価・手間賃 | cost | 13 |
| マスタ管理 | master | 08（編集モーダル19はドリルダウン） |
| 伝票出力 | export | 09 |

#### F.1.1 14 Monthly Planning Hub → 22〜25 への導線（2026-06-30 追加）

14 Monthly Planning Hub（`80:2`）の Body に「**関連画面 — 月次計画ループ（現行MVP）**」セクション（node `140:2`、8ステップステッパの直下）を追加し、22〜25 への**リンクカード4枚**（ページ番号バッジ＋画面名＋ルート＋「開く →」）を常設した。司令塔から各現行画面へ一筆書きで辿れる。22〜25 はいずれも生産計画セクション配下のため、サイドバーは `plan.hub` を active 表示（最長一致）。各画面の PageHeader には実コードと同じ相互リンク（製品計画へ／仮確定へ／月間予定へ／不足候補読込／再計画キュー 等）を配置している。ドリルダウン（受注→生産予定、ProductDemand→ProductionPlan→ReplanJob）はリンクで接続し、導線を切らない。
