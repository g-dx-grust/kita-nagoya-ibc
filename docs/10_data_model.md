# 10. データモデル案

## 設計原則

- 商品名や原料名を主キーにしない。
- 予定値と実績値を分ける。
- 在庫は台帳で管理する。
- マスターは履歴/適用日を持つ。
- 文字起こし上の曖昧な部屋名・外注名はマスターで管理する。

## 主なテーブル

### users

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid | ユーザーID |
| name | text | 氏名 |
| email | text | メール |
| role | enum | 権限 |
| active | boolean | 有効/無効 |

### products

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid | 商品ID |
| product_code | text | 商品番号 |
| official_name | text | 正式商品名 |
| display_name | text | 表示名 |
| production_type | enum | stock / make_to_order / both |
| default_work_area_id | uuid | 標準作業場所 |
| billing_enabled | boolean | 請求対象 |
| active | boolean | 有効/無効 |

### product_aliases

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid | ID |
| product_id | uuid | 商品ID |
| alias_name | text | 旧名・略称・Excel名 |

### materials

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid | 原料ID |
| material_code | text | 原料番号 |
| name | text | 正式名称 |
| unit | text | kg等 |
| standard_unit_price | numeric | 標準単価 |
| shelf_life_managed | boolean | 賞味期限管理 |

### packaging_materials

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid | 資材ID |
| material_code | text | 資材番号 |
| name | text | 正式名称 |
| unit | text | 枚、個、ケース等 |
| standard_unit_price | numeric | 標準単価 |

### product_bom_items

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid | ID |
| product_id | uuid | 商品ID |
| item_type | enum | raw_material / packaging |
| item_id | uuid | 原料IDまたは資材ID |
| quantity_per_unit | numeric | 商品1単位あたり使用量 |
| unit | text | kg、枚等 |
| loss_rate | numeric | ロス率 |

### production_capacities

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid | ID |
| product_id | uuid | 商品ID |
| work_area_id | uuid | 作業場所ID |
| units_per_person_hour | numeric | 1時間1人あたり生産量 |
| standard_people | numeric | 標準人数 |
| note | text | 備考 |

### work_areas

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid | 作業場所ID |
| name | text | 名称 |
| area_type | enum | internal / external / warehouse |
| default_start_time | time | 標準開始 |
| default_end_time | time | 標準終了 |
| display_order | int | 表示順 |
| active | boolean | 有効/無効 |

### employees

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid | 従業員ID |
| name | text | 氏名 |
| employment_type | enum | own / temp / other |
| default_start_time | time | 基本勤務開始 |
| default_end_time | time | 基本勤務終了 |
| default_break_minutes | int | 基本休憩 |
| active | boolean | 有効/無効 |

### shifts

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid | ID |
| employee_id | uuid | 従業員ID |
| date | date | 日付 |
| start_time | time | 開始 |
| end_time | time | 終了 |
| break_minutes | int | 休憩 |
| status | enum | draft / confirmed / off |

### production_plans

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid | 生産予定ID |
| date | date | 生産日 |
| product_id | uuid | 商品ID |
| production_type | enum | stock / make_to_order / external / other |
| planned_quantity | numeric | 予定数量 |
| unit | text | 単位 |
| work_area_id | uuid | 作業場所 |
| planned_start_time | time | 予定開始 |
| planned_end_time | time | 予定終了 |
| planned_people_count | numeric | 予定人数 |
| status | enum | draft / confirmed / cancelled / completed |
| overflow_quantity | numeric | あふれ数量 |
| overtime_minutes | int | 残業見込み |

### production_plan_assignments

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid | ID |
| production_plan_id | uuid | 生産予定ID |
| employee_id | uuid | 従業員ID |
| start_time | time | 割当開始 |
| end_time | time | 割当終了 |
| move_after_plan_id | uuid | 終了後移動先 |

### production_plan_requirements

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid | ID |
| production_plan_id | uuid | 生産予定ID |
| item_type | enum | raw_material / packaging |
| item_id | uuid | 原料/資材ID |
| planned_quantity | numeric | 予定使用量 |
| shortage_quantity | numeric | 不足量 |

### daily_reports

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid | 日報ID |
| production_plan_id | uuid | 生産予定ID |
| actual_start_time | time | 実開始 |
| actual_end_time | time | 実終了 |
| actual_break_minutes | int | 実休憩 |
| actual_people_count | numeric | 実人数 |
| actual_quantity | numeric | 実生産数量 |
| status | enum | draft / confirmed / voided |
| confirmed_at | datetime | 確定日時 |

### daily_report_consumptions

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid | ID |
| daily_report_id | uuid | 日報ID |
| item_type | enum | raw_material / packaging |
| item_id | uuid | 原料/資材ID |
| actual_quantity | numeric | 実使用量 |
| unit_price_snapshot | numeric | 確定時単価 |

### stock_movements

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid | ID |
| item_type | enum | raw_material / packaging / product |
| item_id | uuid | 対象ID |
| location_id | uuid | 拠点/在庫場所 |
| movement_type | enum | opening / planned_reserve / actual_consume / inbound / adjustment / transfer |
| quantity | numeric | 数量。消費はマイナス |
| effective_date | date | 反映日 |
| source_type | text | daily_report, purchase_order等 |
| source_id | uuid | 元データID |

### product_monthly_actuals

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid | ID |
| product_id | uuid | 商品ID |
| year_month | text | 対象年月 YYYY-MM |
| actual_quantity | numeric | 月次実績数量 |
| source_type | enum | manual / import / daily_report |
| note | text | メモ |

### purchase_orders

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid | 発注ID |
| item_type | enum | raw_material / packaging |
| item_id | uuid | 原料/資材ID |
| supplier_id | uuid | 仕入先 |
| ordered_quantity | numeric | 発注数量 |
| confirmed_quantity | numeric | 確定数量 |
| expected_arrival_date | date | 入荷予定日 |
| status | enum | candidate / draft / ordered_unconfirmed / confirmed / received / cancelled |

### invoice_exports

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid | 出力ID |
| period_start | date | 対象開始 |
| period_end | date | 対象終了 |
| exported_by | uuid | 出力者 |
| exported_at | datetime | 出力日時 |
| file_name | text | ファイル名 |

### audit_logs

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid | ID |
| actor_id | uuid | 操作者 |
| action | text | 操作 |
| entity_type | text | 対象種別 |
| entity_id | uuid | 対象ID |
| before_json | jsonb | 変更前 |
| after_json | jsonb | 変更後 |
| created_at | datetime | 日時 |
