# 製造実績インポート実施記録 (2026-06-08)

## 概要

`files/{products,monthly_summary,daily_reports}.json`（同一ブック 06782341-…xlsx 由来、2024-03〜2026-03 の25ヶ月）から、過去の製造実績を `ProductMonthlyActual` に取り込み、翌月生産スケジュール(YoY予測)が回るようにした。

ユーザー判断（2026-06-08）で **商品リスト(products.json)を製造マスタに採用** する方針を採用。

## なぜマスタ採用が必要だったか

実績の商品名を従来の現行DBマスタ(商品分類表由来 KCL 178品)に突合した実測カバレッジ:

- 確実一致: 65/252 名・60品のみ
- **製造ボリュームのカバー率: 約16%**（主力OEM/別注品=個食美学たらっぺ・NTSするめそーめん・大黒天物産こんがり焼きかま・ド情熱価格オクラ梅かつお 等が現行マスタに存在しなかった）

商品リスト(products.json 239品)は実績と同一ブック由来で **85%ネイティブ一致**。よって商品リストをマスタに採用。

## データ品質の修正

- **2025.9 シートの破損**: `monthly_summary["2025.9"]` は日報の 2025-09〜2026-10（8ヶ月）を混載した集計で合計1,173,696袋と異常。日報を全件フル一致で重複排除(764件除去)し、true date で再集計 → 2025-09 = 169,330袋に是正。
- 未来日付タイポ(2026-08/2026-10)17件は除外。
- クリーン後: 25ヶ月・251品・1,845 (商品×月)行。月次合計 15万〜37万袋で妥当。

## 商品同定（取込キー）

実績名 → マスタ商品 の解決を3段で実施し、KCLへの併合候補65件を**多エージェントで敵対的検証**:

- yes 48名 → 既存KCL 46品に**併合**（BOM/能力/単価を保持したまま実績を付与）
- no 7名 → 別ブランドSKU。新規KRL商品として作成（例: 山一千成≠千成水産、信濃屋≠紀伊國屋、アステルファーム≠千年屋、千年屋A≠千年屋B、クリート≠KSB）
- unsure 10名 → 安全側で新規KRL商品。**要確認**（ブランド欠落で会社未確定: NTS焼めざし14g, 黒ｺﾞﾏ物語55ｇ, いかｼﾞｬｰｷｰ140ｇ, 素焼きﾏｶﾀﾞﾐｱﾅｯﾂ40g 等）→ `production_actuals_merge_review_2026-06-08.json`

新規商品コードは `KRL-<fnv1a(normalize(name))>`。`sourceProductKey="prl|"+normalize(name)` で冪等。実績は (productCode, yearMonth) で**合算**してから upsert（表記ゆれを統合）。

## 結果

- 新規商品: 200件作成（sourceSystem=`production_list_xlsx`、forecastMethod=MANUAL、usedAtKitagoya=true、袋単位、packSizeG/入数/ケース入数を商品リストから付与）
- 既存マスタへ併合: 48名→46品
- `ProductMonthlyActual` upsert: 1,842 (商品×月)行、sourceType=`import`
- 有効商品: 178(KCL) + 200(KRL) = **378**
- **取込実績ボリューム合計: 5,318,067袋（従来未カバーの約84%を回収 → カバー率 約16%→ほぼ100%）**
- 予測パイプライン検証(`scripts/verify-forecast.ts`): 2026-04/2026-05 で新規KRL・併合KCL の両方が YoY 予測値を産出することを確認。

## 残課題（フェーズ2）

1. **新規KRL 200品は BOM・生産能力 未登録** → 数量予測は出るが、原料/資材所要・所要時間・原価は未計算。`daily_reports.json` に 生産数・人数・開始/終了・使用原料kg があるため、ここから **生産能力(1人時=生産数/(人数×実働時間))** と **原料原単位(使用kg/生産数)** を逆算してバックフィル可能。products.json には材料費/売価あり。
2. **予測の鮮度**: YoY は対象月Tに T-12/T-2/T-14 を要する。現データは 2026-03 まで → 現状は 2026-05 まで予測可能。実際の翌月(2026-07)を組むには 2026-04〜05 の実績追加が必要。以後も毎月、日報確定→月次集計が `ProductMonthlyActual` に積まれる運用にする。
3. **unsure 10名・no 7名** の最終確認（同一SKU併合 or 別商品確定）。
4. 不規則生産品は YoY の必須3ヶ月が揃わず `insufficient_data` になる（既存予測仕様）。安定品から予測が立つ。

## フェーズ2 実施 (2026-06-08) — 日報から生産能力・原料BOMをバックフィル

日報の充足率が高く(4,963件中4,960が人数・時刻・生産数あり、4,935が使用原料kgあり)、実績から能力・原単位を逆算できた。**全件フル一致で重複排除してから**算出。

### 2A 生産能力 (クリーン・高信頼)
- 1人時生産量 = 生産数 / (人数 × 実働時間) を日報ごとに算出し**中央値**を採用。標準人数=人数中央値、休憩=中央値。
- 既存能力のない**205品**に作成（既存398 MANUAL は不変）。作業場所=既定「一般部屋」、sourceType=`DAILY_REPORT_MEDIAN`、reviewStatus=`unreviewed`。
- 能力の分布: 中央値65.9袋/人時(範囲9〜554, 異常値0)。スクリプト: `app/scripts/backfill-capacity-from-daily.ts`。

### 2B 原料BOM＋原料マスタ (大半が厳密・一部要確認)
- 原単位(kg/袋) = 中央値(使用原料kg / 生産数)。products.jsonの**主原料(material1)に計上**(単価も付与)。
- products.jsonは原料を持つ商品の**93%が単一原料**＝単一商品は厳密・完全なBOM。複数原料(9品)は主原料合算で`要確認`フラグ。
- BOM未保有の対象201品中、**147行作成**(単一138/複数9)、**新規原料マスタ75件**。
- 原料名が取れない**54品は作成せず要確認リストへ**(`docs/production_bom_review_2026-06-08.json`, 計63件)。スクリプト: `app/scripts/backfill-bom-from-daily.ts`。

### フェーズ2後の到達点
- 有効商品378のうち: 実績あり250 / 生産能力あり283 / BOMあり322 / **フル連携(実績+能力+BOM)=196品**。
- 例(NTSするめそーめん18ｇ, 5000袋): 所要4.42時間(10人)、原料93.0kg、原料費223,200円 が自動算出可能に。
- フェーズ2は有効商品のみ更新(非有効への書込み0)。DBバックアップ: `dev.db.backup_20260608_pre_phase2`。

### フェーズ2の残課題
- 原料名欠落の54品はBOM未作成(原単位kg/袋は算出済み, 要確認リスト参照)。商品名→原料名を補えば作成可能。
- 能力の作業場所は一律「一般部屋」既定。機械部屋/たらっぺ部屋等への振分けは要レビュー(reviewStatus=unreviewed)。
- 複数原料9品は主原料合算。厳密化するなら原料別数量の手当てが必要。
- 単価0の原料(products.jsonに単価なし)は原価が過少計上になる。

## 月間スケジュール出力 検証 (2026-06-08)

過去実績だけで月間スケジュールが出力できることを実機で確認。

- **プレビュー**(`loadMonthlyProductionSchedulePreview`, basis=historical_actual): 各月、商品別の提案生産数(=予測−確定実績−既存予定)を出力。例 2026-04: 23品/121,800袋、2026-05: 31品/84,198袋。検証スクリプト `app/scripts/verify-monthly-schedule.ts <YYYY-MM>`。
- **画面**: `/production-plans/monthly?dateFrom=&dateTo=` がHTTP200で前々月前年比予測+仮予定候補をレンダリング。
- **生成(materialize)**: POST `/api/product-planning/monthly-schedule` が提案を `simulateMonthlyShiftSchedule`(能力×シフト→日付/作業場所/人員/時刻) でドラフト `ProductionPlan` 化し、`recalculateProductionPlan` でBOM→資材所要を生成。2026-05で5件生成/28件未配置を確認(資材所要も生成)。デモ生成はロールバック済み。

### 出力の前提・特性（重要）
- **予測カバレッジ**: 厳密YoYは対象月Tに T-12/T-2/T-14 の3ヶ月すべての実績を要する。不定期生産品は揃わず `insufficient_data` となり、月あたり提案は約21〜31品(=規則的に作る主力品)。
- **鮮度**: データは2026-03まで→現状 2026-05まで予測可。実際の翌月を組むには対象月の2ヶ月前まで実績を入れる(毎月運用)。
- **日別人員割付**: 対象月のシフトが必要。2026-05はシフト12件のため5件のみ配置(数量計画は全件出る)。2026-06はシフト415件。シフトが揃う月ほど日別配置も充足。

## フェーズ3 予測カバレッジ拡大＋継続運用 (2026-06-09)

YoY厳密法だけだと月21〜31品しか提案されない（前年同月・今年前々月・前年前々月の3ヶ月が必須）。不定期品・新商品も拾えるよう、`monthly-production-forecast.ts` に**段階的フォールバック**を実装。

### 予測ロジック(優先度順)
1. `two_months_ago_yoy`(標準・原料リードタイム対応) = 前年同月 × (今年前々月 ÷ 前年前々月)
2. `previous_month_yoy` = 前年同月 × (今年前月 ÷ 前年前月)
3. `previous_year_same_month`(季節ベース・要確認) = 前年同月実績そのまま(比率1.0)
4. `trailing_average`(直近平均・新商品/不定期) = 在庫窓内の直近実績(前月・前々月)の平均
5. いずれも不可 → `insufficient_data`(手動登録)

各行に `forecastBasis` と日本語の根拠文を付与。画面の予測表にも「前年同月ベース」「直近平均ベース」等が表示され、低信頼の提案を**フィルタ/レビュー可能**。

### 効果(実測)
- 月あたり提案品数: 約21〜31品 → **約107〜130品**(例 2026-04: 23→120品)。実績のある商品をほぼ網羅。
- 注意: フォールバックは**包括的**なため、不定期品も毎月提案され合計袋数は過大に出やすい。`forecastBasis`(前年同月/直近平均)でレビュー対象を選別する想定。在庫データを入れれば suggestedQuantity = 予測 − 在庫 − 既存予定 で圧縮される。

### 継続運用(日報蓄積で自動的に育つ)
- 日報確定時に `daily-report-service.ts` → `syncMonthlyActualFromDailyReports` が走り `ProductMonthlyActual`(sourceType=daily_report)へ自動集計。取込済みの `import` 行は保護。
- 新商品は当初 `trailing_average` で予測 → 1年分貯まると自動的に `*_yoy` へ昇格。運用は「毎月、日報を確定する」だけでよい。

### テスト
- `monthly-production-forecast.test.ts` に各フォールバックのテストを追加(全11件)。ユニット全体 189件パス、型チェック通過。

### プラン生成ボタン(既存)
- `/production-plans/monthly`（"月間生産スケジュール生成"）の「シフト連動で仮予定生成」ボタンで、提案→ドラフト予定(日付/作業場所/時刻/人員)＋資材所要を生成。「対象期間の仮予定を置き換える」チェックあり。新規実装は不要(既存)。

## フェーズ4 生産順(優先度)の指定 (2026-06-09)

スケジュールの商品並び順は従来「納期→希望日→商品コード」の自動順（過去実績ベースでは実質コード順）だった。商品マスタに**固定の生産順**を持たせて指定可能にした。

### 仕様
- `Product.schedulePriority`(Int?, 小さいほど先, null=従来順)を追加（`prisma db push` で適用。※migrate はシャドウDBで既存履歴が再生不可のため db push を使用）。
- 並び順キーを **schedulePriority(昇順, null は最後尾) → 納期 → 希望日 → 商品コード** に変更。
  - 反映箇所: `monthly-shift-simulation.ts`(byPriority=実際の配置順)、`monthly-production-schedule.ts`(aggregateMonthlySuggestions / inventory_shortage)、`product-planning-service.ts`(historical_actual の suggestions/summaries)。route で simulation item に schedulePriority を受け渡し。
- UI: 商品マスタの新規作成(`product-create-form.tsx`)・編集(`product-editor.tsx`)に「生産順(優先度)」入力欄。空欄=従来順。
- 検証: ユニット追加(全190件パス)、型チェック通過。実機確認(`scripts/verify-schedule-order.ts <YYYY-MM>`): priority=1の商品が先頭、未設定はコード順で後続。デモ設定値は revert 済み(初期は全件 null=従来順)。

### 使い方
商品マスタで「生産順」に数値(例:作りたい順に 1,2,3…)を入れると、月間スケジュール生成時にその順で配置される。未設定の商品は従来どおり後続(コード順)。

## 再現用スクリプト/成果物

- 取込: `app/scripts/import-actuals-master.ts`（`--apply`。/tmp の中間JSON＋`files/products.json`を参照）
- 検証: `app/scripts/verify-forecast.ts <YYYY-MM>`
- 中間成果物(監査用): `docs/production_actuals_dataset_2026-06-08.json`, `…_verified_merges_…json`, `…_merge_review_…json`
- DBバックアップ: `app/prisma/dev.db.backup_20260608_pre_actuals`
