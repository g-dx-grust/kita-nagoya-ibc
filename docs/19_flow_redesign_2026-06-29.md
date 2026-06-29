# 製造計画システム 動線・状態機械 再設計書

対象リポジトリ: `/Users/shojiyuya/Downloads/kitagoya_production_system_handoff_v2/app`
作成: リードアーキテクト / 2026-06-29
前提: コードは変更せず、設計と実装指示のみ。現行ファイル名・モデル名・status値は実コードで検証済み（`app/prisma/schema.prisma:358`, `app/src/lib/schemas.ts:33`, `app/src/lib/labels.ts:20-48`, `app/src/app/api/production-plans/[id]/confirm/route.ts:10-16`, `app/src/lib/material-forecast.ts:57-147`, `app/src/app/api/purchase-candidates/generate/route.ts:65-94` を直接確認）。

---

## 0. 検証反映済みの訂正サマリ（実装前に必読）

本書は独立レビューで実コードと突き合わせ済み。中核診断（計算エンジンは揃い、欠落は状態機械と画面連結。`purchase-order-refresh.ts` が `ProductionPlan.status` を一切触らずステップ7連動が物理的に無い。`tentative_confirmed` は String 列追加でマイグレーション不要）は妥当と確認された。一方で、確定・発注判定の**算術に直結する6点**を訂正済み。各該当章にも反映してあるが、要点を先に集約する。

| # | 重大度 | 訂正内容（誤→正） |
|---|---|---|
| C1 | 高 | 確定ゲートの式 `onHandBefore + confirmedInboundBefore >= plannedQuantity` は**二重計上で誤り**。`material-forecast.ts:135-136` で `onHandBefore(=confirmedBefore)` は確定入荷を既に含む。正: `confirmedBefore >= plannedQuantity`（加算しない）。 |
| C2 | 高 | 確定ゲートを strict `shortageType==="none"` にすると、確定在庫で所要は賄えるが安全在庫を割る `below_safety` 予定が**永久に確定できなくなり**、仮確定方針（below_safetyは妨げない）と矛盾。正: 確定ゲート＝`shortageType ∈ {none, below_safety}` かつ `confirmedBefore >= plannedQuantity`。 |
| C3 | 中 | 月末予測式の確定入荷を `{confirmed, received}` とすると `received` を opening と**二重計上**（`received` PO は `purchase-order-stock-sync.ts:46-49` で CONFIRMED movement を作り opening に算入済み）。正: 確定入荷＝`confirmed` のみ（既存 `loadMaterialForecast` の `[confirmed, ordered_unconfirmed]` 集合を踏襲、`received`は opening 側）。 |
| C4 | 中 | 仮確定の裏付けを「格納済み `shortageType` 再利用＋POが1件存在するか」で判定すると、(a)着日nullのPOがtoday着扱いで過大算入、(b)同一未確定入荷を複数planが二重に裏付け主張し**過剰昇格**。正: `expectedArrivalDate <= plan.date` のPOのみを入荷として `buildMaterialForecast` で再評価し、入荷数量を所要日順に**逐次配分**して賄えるplanだけ昇格。 |
| C5 | 中 | `bulk-confirm/route.ts:13-21` は `status==='draft'` 固定でフィルタ。改修で `status` フィルタ／`updateMany` の where を `tentative_confirmed` を含む形に変えないと、仮確定済み予定が確定へ進めない。 |
| C6 | 中 | 事実訂正: `ProductDemand.status='fulfilled'` は手動ドロップダウン（`product-planning-client.tsx:1081-1086`）で設定可能。欠落しているのは「生産完了/日報確定からの**自動消し込み**」であって設定手段ではない。 |

補足の盲点2点: (i) `below_safety` は `material-forecast.ts:122,168` で実際にDB列へ書かれるが、`production-plans/[id]/page.tsx` のrequirementバッジは3値(hard/unconfirmed/none)しか描画せず**不可視**→ゲートUI前提と食い違うのでバッジ追加が必要。(ii) `ProductDemand` にFKは無いが、日報側は既に `productionPlanId` を持ち `completeMatchingPlans`(`product-daily-report-service.ts:643-650`)で plan を completed 化する経路があるので、`ProductDemand.productionPlanId` を足せば日報→plan→demand の既存連鎖に乗せられる（C6の自動消し込みの実装経路）。

### Codex統合レビューで追加採用する補強方針

本書の中核方針（`tentative_confirmed`、仮確定/確定ゲート、月末在庫予測、PO更新からの格上げ）は採用する。そのうえで、実装時に長期運用で破綻しないよう、以下5点を本指示書へ追加する。

| # | 補強領域 | 追加理由 |
|---|---|---|
| P1 | 月間計画ラン/候補保存 | 現行の月間生成は直接 `ProductionPlan(draft)` を作るため、候補比較・採用・再生成差分・巻き戻しの履歴が弱い。生成結果を `MonthlyPlanningRun` と `ProductionPlanCandidate` として保存してから採用する。 |
| P2 | 再計画イベント | 受注登録、入荷予定変更、当日割当変更、日報確定、在庫修正がそれぞれ個別に再計算を呼ぶと因果が追えない。`ReplanEvent/ReplanJob` を中心に、在庫商品のみ再編成・月間数量維持・差分レビューを担保する。 |
| P3 | 在庫台帳の不変性 | `StockMovement` は実績/確定入出庫を削除再作成しない。予定行も可能な限り取消・差替・supersedeで追跡し、AGENTS.md の immutable ledger 要件に寄せる。 |
| P4 | 日報系統の整理 | A系統 `DailyReport` とB系統 `ProductionDailyReportEntry` が混在しているため、B系統を在庫・原価・月次実績・需要消し込みの正とし、A系統は互換/参照に退避する。 |
| P5 | UI再編の明文化 | 状態機械だけでなく、ホーム、月次ハブ、仮確定画面、発注、受注、当日割当、日報、在庫見える化の画面改修を明示し、実装担当が「どこをどう変えるか」を迷わないようにする。 |

---

## 1. エグゼクティブサマリ

### 現行の重心は「今日の業務（日次実行）」中心
ホーム `src/app/page.tsx:25-162` は冒頭から `today` 基準でしか集計しない（本日の生産予定件数・未配置人数・本日の発注期限CRITICAL・本日日報未確定）。`homeNextAction`（`page.tsx:111-200`）も当日運用の単一フローを連結するだけで、月次計画ループの「次の一手」を一切提示しない。月次計画ループ専用ハブ `production-plans/monthly/page.tsx:161-260` は内部で需要→予測→在庫見込→スケジュール→カレンダーを横断できるが、サイドバー（`Sidebar.tsx:41-89`）の「計画・確認 > 月間予定」からしか到達できず、ホームに露出していない。**=> 現行は「今日の業務中心」。月次計画ループは部品としては実装済みだが、IA(情報設計)上は埋もれている。**

裏を返すと、計算ロジック（予測 `monthly-production-forecast.ts`、割付 `staff-allocation.ts`、材料予測 `material-forecast.ts`）は純関数として高品質に揃っており、**不足しているのは「状態機械」と「画面の next-action 連結」であって、計算エンジンではない。** これは再設計の難易度を大きく下げる。

### 理想動線との最大ギャップ4つ

**ギャップ① 状態機械が2段で、ステップ4(仮予定)とステップ7(仮確定)が単一の `confirmed` に潰れている**
`ProductionPlan.status`（`schema.prisma:358`）は `draft | confirmed | cancelled | completed` の4値だが、計画ワークフロー上は実質 `draft(仮)→confirmed(確定)` の2段。理想が要求する中間状態「仮確定(入荷予定で裏付け済み)」が存在しない。確定操作 `confirm/route.ts:10-16` は `shortageType` を一切見ずに無条件で `status:"confirmed"` へ上書きする（在庫充足・入荷裏付けゲートなし）。`bulk-confirm/route.ts:13-21` も `status==='draft'` のものを無検証で confirmed 化する。

**ギャップ② 月次計画ループが「状態の因果」として繋がっていない（イベント連動の欠落）**
発注候補生成は手動ボタン `purchases/generate-button.tsx:18` のみで、「仮予定が確定された時に発注一覧を作成」という生産予定イベントとの連動がない。さらに決定的なのは、PO更新時 `api/purchase-orders/[id]/route.ts:43-70` の `refreshAroundPurchaseOrder` は `ProductionPlanRequirement.confirmedInbound/unconfirmedInbound/shortageType` を再計算するだけで `ProductionPlan.status` を一切触らない（`purchase-order-refresh.ts` 内に `productionPlan` 参照ゼロ）。よってステップ7「入荷予定に合わせて仮予定→仮確定へ昇格」に対応するデータ連動が物理的に存在しない。

**ギャップ③ 「月末締めの在庫予測」概念が無く、受注(8)が需要消し込みに繋がらない**
`material-forecast.ts:57-147` は `dateFrom..dateTo`（画面既定は今日〜+30日, `purchases/page.tsx:23-24`）の任意窓で、各所要日時点の `confirmedBefore` を `plannedQuantity+safetyStock` と逐次比較するだけで、「今月末時点の残高」を基準にした発注判断になっていない。また `ProductDemand`（`schema.prisma:464-480`）には `productionPlanId` 等の参照が無く、`status` の `fulfilled` は手動ドロップダウン（`product-planning-client.tsx:1081-1086`）では設定できるが、**生産予定完了/日報確定からの自動消し込みが無い**（C6訂正）。受注を登録しても生産予定・日報完了が需要を自動で消し込まない。

**ギャップ④ 月間生成・再計画・実績反映の履歴が弱く、あとから「なぜこの予定になったか」を追えない**
月間生成APIはプレビュー結果を候補として永続化せず、採用すると直接 `ProductionPlan(draft)` を作る。再生成も note prefix に依存して自動生成draftを置換するため、どの予測・シフト・受注・在庫条件から作られた計画かを追跡しにくい。また、受注割込み・PO更新・日報確定・当日割当変更のたびに「在庫商品のみ再編成」「月間製造数維持」「変更差分レビュー」を一貫して扱う中枢が無い。ここは `MonthlyPlanningRun` と `ReplanEvent/ReplanJob` を導入して補う。

---

## 2. 現状 vs 理想 ギャップ表（8ステップ）

| # | ステップ | 現状exists | 主要gap | 動線断絶 | 必要対応 |
|---|---|---|---|---|---|
| 1 | スタッフシフト登録 | full | `Shift.status`(draft/confirmed/off, `schema.prisma:311`)が入口ごとに分散付与（本人初回=draft, 月置換既定=confirmed `month/route.ts:65`, 申請承認=confirmed）。一貫した「シフト確定」定義なし | `/shifts` から月次需要算出(step2)への導線が画面に無い。月次カードの「割り当て」も単日 `allocate?date=` に飛ぶ(`shifts/page.tsx:291`) | シフト確定の定義を1本化。`/shifts`→月次計画ハブへの「月次計画を作る」next-actionを追加。**(流用可中心)** |
| 2 | 過去実績→翌月製造数算出 | full | `ProductEquivalenceGroup`(`schema.prisma:649`)が予測に未連携。予測数量が永続化されず preview都度再計算の一過性データ。`historical_actual` と `inventory_shortage` の2系統が並存 | 予測→draft化の経路が2つ(`product-planning-client.tsx:435` と monthly のActions)に分裂。特需/同等品にUIなし(API直叩き) | 予測基準を1本化。`SpecialDemandEvent`/`EquivalenceGroup`の登録UI新設。**(改修＋新規)** |
| 3 | シフトから稼働率100%振り分け | full | 「作れるだけ作る」最大化が未実装。固定数量を詰めるだけで、空き時間を埋める在庫生産を自動追加しない(`staff-allocation.ts:392-398`は警告のみ)。あふれ/skippedは表示止まり | step3画面から「発注一覧へ」「仮確定へ」の導線なし。当日`/auto`・`/allocate`・月間`monthly-schedule`の3系統併存 | 月間生成を正系に一本化。生成結果フッターに step4/5 への next-action。**(改修)** |
| 4 | 仮での製造予定確定(仮予定) | **partial** | `draft`が「仮予定」だが、step4固有の「採用」操作と step7「仮確定」が単一confirmedにcollapse。`planStatusLabel`(`labels.ts:20-33`)に仮確定ラベル無し | 旧本決定画面 `monthly-plan-decision-client.tsx:187-211` の bulk-confirm が不足を無視して confirmed 化。step5(発注)へ自動連鎖しない | **新status `tentative_confirmed` 追加**。旧本決定画面を「仮確定」ゲートに改修。**(改修＋schema)** |
| 5 | 原料/資材確認・月末予測・発注一覧 | full | **月末締め残高予測が無い**。不足起点が「生産予定の所要日」で月末残高基準でない(`material-forecast.ts:108`)。`recommendedOrderDate=shortageDate−leadTime`のみで発注処理バッファ無し(`generate/route.ts:68-69`) | 生成トリガが手動ボタンのみ。期間が画面クエリ手入力で計画期間(step2/3)と非連動。在庫変更後はcandidate再生成されず手動再押下 | **月末締めモードの予測関数を新設**。仮確定イベントから自動生成を発火。**(改修＋新規)** |
| 6 | 発注一覧へ入荷予定日入力 | full | 入荷予定日が必須でない(`order/confirm`は未検証)。在庫のconfirmed/unconfirmed振り分けはPO.status依存で、入荷予定日の有無では切り替わらない | PO→裏付ける生産予定へのリンク無し(`PurchaseOrder`と`ProductionPlan`にリレーション無し, `schema.prisma:437-460`)。effectiveDate fallbackで誤as-of算入リスク | PO↔Plan の逆引きリンク(read-model)を追加。入荷予定日入力後に step7 評価を発火。**(改修＋新規read-model)** |
| 7 | 入荷予定に合わせ仮予定→仮確定 | **partial** | `ProductionPlan.status`に仮確定段階が無い。PO更新が`shortageType`を書き換えるだけで`status`に波及しない(`material-forecast.ts:160-172`)。confirmがゲートされない | 製造予定詳細 `production-plans/[id]/page.tsx:65-73` に発注/入荷予定へのリンク無し。「確定可能になった予定一覧」ビュー/APIが無い | **入荷予定→Plan自動格上げ**ロジックを新設。逆引き「昇格可能一覧」API。**(新規)** |
| 8 | 受注生産の登録(受注/仮受注) | **partial** | 「仮受注」状態無し(`demandType`=order/shipment/forecast, `status`=open/fulfilled/cancelled, `schema.prisma:469-471`)。出荷予定日と製造日を分離不可(単一`dueDate`)。`ProductDemand`と`ProductionPlan`にFK無し | 推奨生産数テーブル(`product-planning-client.tsx:833-883`)が読取専用で「予定化」ボタン無し。日報/生産完了から `fulfilled` への自動消し込み無し | 受注↔予定の参照リンク。日付分離。`tentative_order`状態追加。**(改修＋schema)** |

### 2.1 追加ギャップ表（理想動線9〜15）

| # | ステップ | 現状exists | 主要gap | 必要対応 |
|---|---|---|---|---|
| 9 | 受注登録時に在庫商品の製造スケジュールを自動組み直し | **partial** | 受注登録後の再生成はあるが、自動生成draft置換中心。受注生産固定、在庫生産のみ移動、月間数量維持、差分確認の保証が弱い | `ReplanEvent(demand_created)` → `ReplanJob` → 差分UI → 管理者適用。受注生産/確定/完了は固定し、在庫生産だけ再配置 |
| 10 | 受注・製造予定・納品予定が揃った段階で確定 | **partial** | 確定可能性を一覧で見る `PlanReadiness` が無い。confirm API が材料/入荷/受注充当を総合判定していない | `PlanReadiness` read-model を追加し、材料裏付け、PO入荷予定、受注充当、シフト/部屋、日付矛盾をチェックして「確定可能」一覧を出す |
| 11 | 当日製造スケジュールをスタッフ/現場印刷し、管理者変更に応じ翌日以降を再編成 | **partial** | 当日割当・印刷はあるが、変更後に翌日以降の在庫商品だけを再編成する導線が無い | 当日割当保存時に `ReplanEvent(day_allocation_changed)` を発行。現場印刷は当日変更後の部屋/順番/担当を反映 |
| 12 | スタッフが製造日報を提出 | **partial** | A系統/B系統の日報が混在し、どれが実績の正か分かりにくい | B系統 `ProductionDailyReportEntry` を正とし、予定との差分入力をUIに明示 |
| 13 | 管理者が日報を確認し計上 | **partial** | 承認時の副作用（在庫・月次実績・需要消し込み・再計画）が画面上も実装上も散らばる | 承認時の処理を一箇所に集約し、承認前に反映内容をプレビューする |
| 14 | 手間賃・原料在庫・資材在庫・商品在庫を最新活動データで更新 | **partial** | 実績在庫と予定在庫の差替が一部 delete/recreate で監査しづらい。手間賃基礎データの更新タイミングも日報Bへ一本化が必要 | 実績movementは不変台帳へ。B系統日報承認で `ProductMonthlyActual`、商品在庫、材料/資材、手間賃基礎を更新 |
| 15 | 常にリアルな在庫状況や稼働状況を見える化 | **partial** | 現在庫・予定引当・未確定入荷込み・月末予測・不足警告が画面横断で散らばる | 在庫ダッシュボードに5系列を表示し、StockMovement/PO/製造予定/日報へドリルダウン。ホームにも月次ループの警告を出す |

---

## 3. 状態機械の再設計（ProductionPlan 中心）

### 3.1 目標とする状態遷移図

```
                 [自動生成 / 手動登録]
                         │
                         ▼
   ┌──────────────── draft (仮予定) ───────────────┐
   │  materials未確認。step3/4の出力。所要量は計算       │
   │  済みだが入荷裏付けは問わない。                      │
   └───────────────┬───────────────────────────────┘
       (仮確定ゲート: 材料裏付け成立)│  ←─ step5/6/7
                   ▼
   ┌──────── tentative_confirmed (仮確定) ★新規 ──────┐
   │  hard_shortage が1件も無く、unconfirmed依存は       │
   │  PO.expectedArrivalDate ≤ 製造予定日 で裏付け済み。  │
   └───────────────┬───────────────────────────────┘
       (確定ゲート: 入荷確定で裏付け)  │  ←─ PO confirmed/received
                   ▼
   ┌──────────────── confirmed (確定) ────────────────┐
   │  全所要が confirmedInbound + onHand で充足。         │
   │  実行に回す最終計画。                                │
   └───────────────┬───────────────────────────────┘
       (日報実績で消し込み)│  ←─ product-daily-report-service.ts:636-663
                   ▼
              completed (完了)

   いずれの段階からも → cancelled (取消)
```

### 3.2 status enum の拡張方針（既存データ影響込み）

**推奨: `status` enum に値 `tentative_confirmed` を1つ追加する（別フィールド方式ではなくenum拡張）。**

理由と既存データへの影響:
- 既存 `PlanStatusEnum`(`schemas.ts:33`)は `["draft","confirmed","cancelled","completed"]`。ここに `"tentative_confirmed"` を `"confirmed"` の前に挿入する。
- **後方互換: 既存の `confirmed` 行は意味を保持できる。** 既存運用では「確定」=最終確定として使われており、移行時に `confirmed` を機械的に `tentative_confirmed` へ落とす必要はない（破壊的データ移行ゼロ）。むしろ移行スクリプトで「`confirmed` かつ全 requirement が unconfirmed_dependency を含む」行を `tentative_confirmed` へ再分類する任意ジョブを後追いで流せる。
- **別フィールド案（`materialBackingStatus` を別に持つ）との比較:** 別フィールド方式は status と裏付けが直交し理論上きれいだが、(a)ユーザーのメンタルモデルは明示的に「仮予定→仮確定→確定」の単一軸（このドキュメントのstep4/7要求）、(b)`labels.ts`・一覧フィルタ・`material-forecast` の `plan.status in [...]` 判定・home集計が全て単一 `status` 文字列前提、という2点から、**単一 status 軸の拡張が現行コードへの差分が最小**。裏付けの「材料根拠」は既存 `ProductionPlanRequirement.shortageType/confirmedInbound/unconfirmedInbound`（`schema.prisma:382-399`）が既に保持しているので、別フィールドを足す必要はない。status はその根拠から導出される「到達点」を表す。

影響を受ける箇所（値追加に伴い必ず直す）:
- `schema.prisma:358` コメント → `draft | tentative_confirmed | confirmed | cancelled | completed`
- `schemas.ts:33` `PlanStatusEnum` に値追加。`schemas.ts:723` の `planStatuses` 既定 `["draft","confirmed"]` → `["draft","tentative_confirmed","confirmed"]`
- `labels.ts:20-33` `planStatusLabel`: `tentative_confirmed → "仮確定"`、`draft → "仮予定"`（現「仮」を改称）、`confirmed → "確定"`。`planStatusClass`(`labels.ts:35-48`)に warning 系クラス追加
- `material-forecast.ts`（JSON記載 `:217` の plan.status フィルタ `[draft, confirmed]`）→ `[draft, tentative_confirmed, confirmed]` に拡張（仮確定の所要も在庫予測に算入するため必須）
- ホーム `page.tsx:49-54`（upcoming は status in [draft,confirmed]）→ tentative_confirmed を含める

### 3.3 各遷移の定義【誰が / トリガ / 前提条件 / 副作用】

#### 遷移A: （生成）→ `draft`（仮予定）
- **誰が**: 計画担当 or システム（自動生成）
- **トリガ**: step3の月間生成 `api/product-planning/monthly-schedule/route.ts:251-270`（`status:'draft'` 固定）、手動新規 `api/production-plans POST`（既定draft）
- **前提**: シフトと需要(step2)が揃っていること
- **副作用**: `recalculateProductionPlan` で `ProductionPlanRequirement` に `onHand/confirmedInbound/unconfirmedInbound/shortageType` を埋める。監査 `audit()`。

#### 遷移B: `draft` → `tentative_confirmed`（仮確定）★新規の中核
- **誰が**: 計画担当（本決定/仮確定画面の操作）、または step7 の自動格上げ
- **トリガ**:
  - 手動: 改修後の `monthly-plan-decision-client.tsx` の「仮確定する」ボタン → 新API `POST /api/production-plans/[id]/tentative-confirm`（および `bulk-tentative-confirm`）
  - 自動(step7): PO の `expectedArrivalDate` 入力/PO確定後 `purchase-orders/[id]/route.ts:69` の再計算に続けて `evaluatePlanBacking()` を実行し、条件成立 plan を昇格
- **前提条件（仮確定ゲート、これが「仮確定」の定義そのもの）**:
  1. 当該 plan の全 `ProductionPlanRequirement` で `shortageType !== "hard_shortage"`（=確定在庫＋未確定入荷を含めれば所要が満たせる。`material-forecast.ts:120-127` の判定に一致）
  2. `shortageType === "unconfirmed_dependency"` の requirement それぞれについて、対応する `PurchaseOrder`（同一 `itemType/itemId`、`status in [ordered_unconfirmed, confirmed]`）に `expectedArrivalDate` が入力済みで、かつ `expectedArrivalDate <= plan.date`（=入荷が製造日に間に合う見込み）
  3. `below_safety` のみの requirement は仮確定を妨げない（早期警告扱い）
- **副作用**: `status` を `tentative_confirmed` に更新。監査 `audit({action:"tentative_confirm"})`。在庫は減らさない（予定引当のまま）。step5の発注候補生成を自動発火（後述4章のイベント連動）。

> 重要: 現行 `confirm/route.ts:10-16` と `bulk-confirm/route.ts:13-22` は前提1〜2を**全く検証していない**。新ゲートはこの検証を `assertTentativeConfirmEligible(planId)` として `lib/plan-backing.ts`（新規）に実装し、両APIから呼ぶ。

#### 遷移C: `tentative_confirmed` → `confirmed`（確定）
- **誰が**: 計画担当（または入荷確定の自動格上げ）
- **トリガ**: 「確定する」操作（改修後の `plan-actions.tsx` / 月次一括）、または PO が `confirmed/received` に進んだ後の自動評価
- **前提条件（確定ゲート）★C1・C2訂正済み**: 全 `ProductionPlanRequirement` が `shortageType ∈ {none, below_safety}` かつ `confirmedBefore(=onHandBefore) >= plannedQuantity`（=確定在庫＋確定入荷のみで所要を満たし、未確定入荷に依存しない）。
  - **C1（二重計上の回避）**: `material-forecast.ts:135-136` で `onHandBefore` は既に `confirmedBefore`（opening＋確定入荷の積算値）であり、`confirmedInboundBefore = max(0, confirmedBefore - opening)` はその確定入荷部分。両者を足すと確定入荷を2回数えるため、**加算してはならない**。判定は `confirmedBefore >= plannedQuantity` 単独。
  - **C2（below_safety を確定不能にしない）**: `below_safety` は「素の所要は確定在庫で賄えるが安全在庫を割り込む早期警告」（`material-forecast.ts:120-122`、`confirmedBefore >= plannedQuantity` は成立）。strict `none` を要求すると生産可能な予定が安全在庫割れだけで確定できなくなり、遷移B（below_safety は仮確定を妨げない）と矛盾する。よって確定ゲートも `none/below_safety` の両方を許す。
- **副作用**: `status='confirmed'`。監査。以降この plan は実行対象として現場印刷・日報入力の母集合になる。

#### 遷移D: `confirmed`（または `tentative_confirmed`）→ `completed`（完了）
- **誰が**: システム（日報実績の確定）
- **トリガ**: 既存 `product-daily-report-service.ts:636-663 completeMatchingPlans`（同一商品×生産日の draft|confirmed を completed 化）。**新status 追加に伴い、対象を `draft|tentative_confirmed|confirmed` に拡張する。**
- **前提**: 承認済み日報B（`approvalStatus='approved'`）が存在
- **副作用**: 実績で在庫・原価を再計算（予実をBへ）。`supersededPlanIds` 機構で予約を実績へ置換。

#### 遷移E: 任意 → `cancelled`（取消）
- 既存 `cancel/route.ts:8-26`（→cancelled＋予約取消）。新statusからも遷移可とする（ガード追加不要、ただし completed からの取消は禁止）。

### 3.4 「仮確定」が逆戻りするケースの扱い
PO がキャンセルされる、入荷予定日が後ろ倒しになって `expectedArrivalDate > plan.date` になった等で前提条件2が崩れたとき、`evaluatePlanBacking()` は `tentative_confirmed` を `draft` へ**自動降格**させる（監査 `action:"demote_to_draft"`、UIに警告表示）。これにより「仮確定＝入荷裏付け済」の不変条件を常に保つ。現行は降格経路が一切無い（`statusNotes`「confirmed後に段階を上げる/戻す遷移が存在しない」）ため、これを新設するのが要点。

---

## 4. 月末在庫予測ロジックの定義

### 4.1 基本式（品目ごと、対象=当月末 `D_end`）

ステップ5の要件「今月末時点の在庫を予測して、足りないものの発注一覧を作成」を満たすため、**「所要日ごとの逐次減算（現行）」とは別に「月末締め残高」を明示計算する**。

```
月末予測在庫(item, D_end) =                                    ★C3訂正済み
    期首在庫(opening)
  + Σ 確定入荷  ( PO.status = confirmed のみ,                  today < expectedArrivalDate ≤ D_end )
  + Σ 未確定入荷( PO.status = ordered_unconfirmed,             today < expectedArrivalDate ≤ D_end )
  − Σ 予定使用量( ProductionPlanRequirement.plannedQuantity,
                  plan.status ∈ {draft, tentative_confirmed, confirmed},
                  plan.date ≤ D_end )
  ※ received は opening に計上済みのため確定入荷へ再加算しない（二重計上回避）
```

- `期首在庫(opening)` = `StockMovement`（`status=CONFIRMED`, `effectiveDate ≤ today`）の集計。現行 `material-forecast.ts:192` の opening 集計を流用。
- **C3（received の二重計上回避）**: PO status と StockMovement の対応は `purchase-order-stock-sync.ts:29-50` で、`received` PO → `INBOUND_CONFIRMED`/movement.status=`CONFIRMED`（＝opening に入る）、`confirmed` PO → `INBOUND_CONFIRMED`/movement.status=`PLANNED`、`ordered_unconfirmed` PO → `INBOUND_UNCONFIRMED`/`PLANNED`。よって確定入荷として加算するのは **`confirmed`（PLANNED movement）のみ**で、`received` は opening 経由。現行 `loadMaterialForecast` も inbounds を `[confirmed, ordered_unconfirmed]` に限定して received を除外（`material-forecast.ts:209`）しており、本式はこれを踏襲する。
- 確定/未確定の入荷は **別計上**（CLAUDE.md「発注済みでも未確定の入荷は確定在庫とは別扱い」要件）。confirmed残高と withUnconfirmed残高の2系列を持つのは現行 `buildMaterialForecast` の `state.confirmed / state.withUnconfirmed`（`material-forecast.ts:84-99`）と同じ構造を流用できる。

### 4.2 翌月の所要に対する不足判定と発注量

月末残高は「翌月生産の出発点在庫」。翌月の所要を月初から逐次減算し、確定在庫が安全在庫を割り込む最初の日を求める。

```
shortageDate(item) = 翌月の所要を月初から逐次減算したとき、
                     confirmedProjected が (当日所要 + safetyStockQuantity) を初めて下回る日
                     ※ safetyStockQuantity は Product/品目マスター値（schema.prisma:63 相当の材料側 safetyStock）

発注すべき量 = roundOrderQuantity(
                 max(0, (翌月リードタイム期間の所要 + safetyStockQuantity) − 月末予測在庫),
                 { orderLotQty, minOrderQty }     // 現行 order-quantity.ts:3-37 を流用
              )

recommendedOrderDate = shortageDate − leadTimeDays − orderProcessingBufferDays   ★バッファ新設
urgency = computeUrgency({ requiredOrderDate: recommendedOrderDate, asOfDate: today })  // 現行流用
```

`orderProcessingBufferDays`（発注処理日数の安全余裕）は品目マスターまたはシステム設定に新フィールドとして追加。現行は `recommendedOrderDate = shortageDate − leadTimeDays` のみ（`generate/route.ts:68-69`）でバッファゼロ。

### 4.3 現行 `purchase-candidates/generate` との差分

| 観点 | 現行（`generate/route.ts` + `material-forecast.ts`） | 新（月末締めモード） |
|---|---|---|
| 期間 | `dateFrom..dateTo` 画面クエリ手入力（既定 今日〜+30日） | 「当月末」「翌月」を計画期間から自動算出（手入力依存を排除） |
| 不足起点 | 生産予定の所要日が在庫を割り込む最初の日（`material-forecast.ts:108`） | **月末残高を出してから翌月所要で逐次減算** した最初の割れ日 |
| 残高概念 | 月締め残高なし（窓内の逐次のみ） | `期首+確定入荷+未確定入荷−予定使用量` の月末残高を明示 |
| 発注日 | `shortageDate − leadTimeDays` のみ | `− leadTimeDays − orderProcessingBufferDays` |
| トリガ | 手動ボタンのみ（`generate-button.tsx:18`） | 仮確定イベント(遷移B)で**自動発火**＋手動も維持 |
| plan status対象 | `draft|confirmed`（`material-forecast.ts:217`） | `draft|tentative_confirmed|confirmed` |
| 在庫手入力後 | candidate再生成されず手動再押下 | `refreshCumulativeMaterialRequirements`(`material-forecast.ts:149`)後にcandidate差分再生成 |

**実装方針**: `material-forecast.ts` に `loadMonthEndInventoryForecast({ targetMonth })` を追加（既存 `loadMaterialForecast` を内部利用し、入荷・所要の集計境界を「today→月末→翌月」に組み替える）。`generate/route.ts` に `mode: "month_end" | "window"` を `GenerateSchema`(`generate/route.ts:9-13`) へ追加し、month_end のとき新関数を使う。既存の window モードは後方互換で残す。

---

## 5. 再設計後の一本の動線（画面遷移シーケンス）

### 5.1 IAの基本方針: 「今日の業務」と「月次計画ループ」を二層で同居させる

ホーム `page.tsx` を**2カラム構成**に再編する。

- **左/上段「今日の業務」**: 現行の today 集計（`page.tsx:25-162`）と `homeNextAction` をそのまま維持。日次実行の現場担当向け。
- **右/下段「今月の計画ループ」**: 新カード群。`yearMonth`（今月/翌月トグル）に対して、(1)シフト充足、(2)需要算出済み、(3)振り分け済み、(4)仮予定件数、(5)仮確定件数、(6)未発注/入荷予定未入力件数、(7)確定件数 を **8ステップの進捗バッジ**で表示し、各カードが「月次計画ハブ `/planning/monthly`」の該当ステップへ deep-link する。

さらに**新設「月次計画ハブ `/planning/monthly`」**（既存 `production-plans/monthly/page.tsx` を母体に拡張）にステッパー UI を載せ、ステップ1→8を1画面から横断できるようにする。Sidebar.tsx:41-89 の「計画・確認」グループ先頭に配置し、ホームの月次カードからも入れる。

### 5.2 画面遷移シーケンス（ボタンと next-action）

```
[ホーム /]
  └「今月の計画を進める」→ [月次計画ハブ /planning/monthly?ym=2026-07]

① /shifts （ハブのステップ1リンク）
   操作: ShiftMonthEditor で月次シフト入力 → PUT /api/shifts/month
   next-action(新): 画面右上「② 翌月の製造数を算出する」→ /planning/monthly#demand

② /planning/monthly#demand （HistoricalForecastTable）
   操作: 「過去実績から予測を再計算」（planningBasis=historical_actual に一本化）
   next-action(新): 「③ シフトに振り分ける」→ 同ハブ #allocate

③ /planning/monthly#allocate （月間生成）
   操作: monthly-schedule-actions.tsx の「シフト連動で仮予定生成」
         → POST /api/product-planning/monthly-schedule（status:'draft' 一括生成）
   next-action(改修): 生成フッターに「④ 仮予定を確認・採用する」→ /production-plans/monthly/confirm

④ /production-plans/monthly/confirm （旧本決定画面を「仮確定ゲート」に改修）
   表示: draft各行に shortageType バッジ（資材不足/入荷確認）を維持（既に :478-480 で表示）
   操作A(残す): まず「仮予定として採用」（status=draft のまま、レビュー済みフラグ）
   操作B(新): 「仮確定する」ボタン → POST /api/production-plans/bulk-tentative-confirm
              ゲート: hard_shortage を含む行はボタン無効化＋「先に発注一覧へ」誘導
   next-action(新): 「⑤ 不足を発注する」→ /purchases?ym=2026-07&mode=month_end

⑤ /purchases （発注一覧, 月末締めモード）
   操作: 「月末在庫予測から発注候補を生成」（mode=month_end）
         → POST /api/purchase-candidates/generate { mode:"month_end" }
   表示: ShortageForecastTable に月末予測在庫列・recommendedOrderDate・urgency
   next-action(新): 「⑥ 入荷予定を入力する」（同画面のインライン編集へスクロール）

⑥ /purchases （同画面・行インライン編集）
   操作: expectedArrivalDate を入力 → PUT /api/purchase-orders/{id}
         必要なら「発注」→「発注確定」ボタン（order/confirm/receive）
   副作用(新): 保存後 refreshAroundPurchaseOrder に続けて evaluatePlanBacking() 発火
   next-action(新): 「⑦ 裏付けできた仮予定を仮確定にする」→ /planning/monthly#promotable

⑦ /planning/monthly#promotable （新ビュー: 昇格可能一覧）
   表示: GET /api/production-plans/promotable?ym=2026-07
         「この入荷予定で仮確定にできる予定」「入荷確定で確定にできる予定」の2リスト
   操作: 「一括で仮確定」「一括で確定」 → bulk-tentative-confirm / bulk-confirm
   next-action: 「現場へ（確定予定を印刷）」→ 既存の作業日報印刷フォーム

⑧ /product-planning （受注は随時、ループに割り込み）
   操作: 「受注/仮受注を登録」フォーム（demandType + 仮受注フラグ + 出荷予定日/製造日）
         → POST /api/product-demands
   推奨生産数テーブルに「この受注を予定化」ボタン(新) → monthly-schedule（make_to_order分）
   → 生成された draft が ④以降の同じループに合流
```

### 5.3 ホームと月次ループの同居（具体仕様）
- `page.tsx` に `monthlyLoopProgress(yearMonth)` を新設し、8ステップの達成状況を集計（例: step4達成=draft件数>0、step7達成=tentative_confirmed件数≥対象需要の80%等）。
- `homeNextAction`（当日）に加え `monthlyNextAction`（月次）を併置。`monthlyNextAction` は未達の最小ステップへ誘導（シフト未入力→/shifts、振り分け未→#allocate、未発注→/purchases…）。
- Sidebar.tsx に月次計画ハブを追加し、`activeMenuHref` 最長一致（`Sidebar.tsx:102-117`）でステッパーと整合。

---

## 6. ステップ7・8の不足機能の具体仕様

### 6.1 ステップ7: 入荷予定 → 生産予定の自動格上げ

**新ライブラリ `app/src/lib/plan-backing.ts`（新規）**

```
// 1件の plan が仮確定/確定に到達できるかを判定する読み取り関数
export type PlanBackingResult = {
  planId: string;
  canTentativeConfirm: boolean;   // 遷移Bゲート充足
  canConfirm: boolean;            // 遷移Cゲート充足
  blockingRequirements: Array<{ itemId; shortageType; reason }>;
  backingPurchaseOrderIds: string[]; // 裏付けに使った PO（逆引き）
};

export async function evaluatePlanBacking(planIds: string[]): Promise<PlanBackingResult[]>
```

判定ロジック ★C4訂正済み — **格納済み `shortageType` をそのまま信用しない**。`loadMaterialForecast` は `expectedArrivalDate` が null の PO を `dateFrom(=today)` 着とみなして在庫算入する（`material-forecast.ts:210,265`）ため、着日未入力POでも `unconfirmed_dependency` と記録され得る。また「POが1件存在するか」だけでは同一未確定入荷を複数planが各々裏付け主張して過剰昇格する。よって plan-backing は **`expectedArrivalDate <= plan.date` のPOのみを入荷として扱う条件で `buildMaterialForecast` を再評価**し、入荷数量を所要日順に**逐次配分**して数量充足を確認する:
- `canTentativeConfirm` = 上記再評価で、全 requirement が `hard_shortage` でない（確定在庫＋「着日が製造日までに間に合う未確定入荷」を所要日順に配分しても所要を賄える）。着日nullのPOは裏付けに数えない。
- `canConfirm` ★C1・C2訂正済み = 全 requirement が `shortageType ∈ {none, below_safety}` かつ `confirmedBefore >= plannedQuantity`（`onHandBefore` に `confirmedInboundBefore` を加算しない＝二重計上回避。`below_safety` は確定を妨げない早期警告）。
- `backingPurchaseOrderIds` = 数量配分で実際に裏付けに使った `ordered_unconfirmed/confirmed` PO を列挙（PO↔Plan のリレーションが schema に無い問題を read-model で解消）。複数planへ配分済みのPO残量を超えて裏付け主張させない。

**PO更新フックへの組み込み**: `api/purchase-orders/[id]/route.ts:69` の `refreshAroundPurchaseOrder` 呼び出し直後に、影響を受けた品目を所要に持つ plan を引き、`evaluatePlanBacking` を実行。設定 `autoPromotePlans=true` のとき:
- `draft` かつ `canTentativeConfirm` → `tentative_confirmed` へ自動昇格（監査 `auto_tentative_confirm`）
- `tentative_confirmed` かつ前提が崩れた → `draft` へ自動降格（3.4節）
`false` のときは昇格せず、`GET /api/production-plans/promotable` の「昇格可能一覧」に出すだけ（手動操作を促す）。

**新API**:
- `GET /api/production-plans/promotable?ym=` … 昇格可能/降格警告の plan を返す（⑦のビュー用）
- `GET /api/production-plans/readiness?ym=` … 確定可能性を一覧化する。材料裏付け、PO入荷予定、受注充当、シフト/部屋、日付矛盾、日報済み有無を返す（step10用）
- `POST /api/production-plans/[id]/tentative-confirm` … 単票仮確定（ゲート検証つき）
- `POST /api/production-plans/bulk-tentative-confirm` … 一括（`bulk-confirm` と対）
- `confirm/route.ts` / `bulk-confirm/route.ts` に `assertConfirmEligible`（`canConfirm`）ガードを追加

**製造予定詳細にPO逆引きリンク**: `production-plans/[id]/page.tsx:318-356` の requirement バッジに、`backingPurchaseOrderIds` から `/purchases#po-{id}` へのリンクを追加（現状リンク皆無の動線断絶を解消）。

### 6.2 ステップ8: 受注登録 → 需要/割付への反映

**schema 変更（`ProductDemand`, `schema.prisma:464-480`）**:
- `productionPlanId String?` ＋ relation を追加（受注↔生成された予定のFK。現状リレーション皆無）
- 日付を分離: 既存 `dueDate` を「出荷予定日 `shipDueDate`」と位置づけ、新たに `productionDueDate DateTime?`（作業/製造予定日）を追加。リードタイム逆算（出荷−productionLeadDays）を受注単位で表現可能にする（現状 monthly-schedule 呼び出しの `productionLeadDays:1` 固定依存を解消）。
- 「仮受注」: `demandType` に `tentative_order` を追加するか、`status` に `tentative` を追加。**推奨は `status` に `tentative` 追加**（`open|tentative|fulfilled|cancelled`）。`tentative` は予測・割付には「見込み」として弱い重みで反映、`open`（確定受注）は安全在庫0で即不足計上（現行 `product-planning.ts:62,76-78` の make_to_order ロジックを活かす）。
- `fulfilled` の自動化 ★C6訂正済み（現状は手動ドロップダウン `product-planning-client.tsx:1081-1086` でのみ設定可、自動消し込みが無い）: `ProductDemand.productionPlanId` を足し、既存の日報→plan completed 化連鎖（`product-daily-report-service.ts:643-650 completeMatchingPlans`）に乗せて、紐づく `productionPlan.status` が `completed` になったら自動で `fulfilled` へ更新する。日報側は既に `productionPlanId` を保持しているので、demand 側にFKを足すだけで日報→plan→demand の消し込みが繋がる。

**UI（`product-planning-client.tsx`）**:
- 推奨生産数テーブル（`:833-883`、現状読取専用）に **「この受注を予定化」ボタン**を追加 → make_to_order 分を `monthly-schedule` へ渡して draft 生成し、生成 plan の id を `ProductDemand.productionPlanId` に書き戻す。現状の「production-plans/new へ移動して再入力」という動線断絶を解消。
- 登録フォーム（`:651-711`）に「仮受注/確定受注」トグルと「出荷予定日/製造予定日」2フィールドを追加。
- `customerName` の「得意先/メモ」兼用（`:699-700`）を解消し、得意先マスタ参照に分離（中期。MVPでは現状維持可）。

### 6.3 月間計画ラン・候補保存（step2〜4の土台）

現行の月間生成は、プレビュー/採用の境界が弱く、採用時に直接 `ProductionPlan(status:'draft')` を作る。これでは「どの条件で作った計画か」「前回生成との差分は何か」「管理者が採用した候補はどれか」を後から追えない。理想動線の step2〜4 は、**生成候補を保存 → 差分確認 → 採用 → `ProductionPlan(draft)` 作成**の順に変更する。

**新規モデル（推奨）**:
- `MonthlyPlanningRun`: 月間計画の1回の生成単位。`yearMonth`, `status(draft/simulated/adopted/superseded)`, `basis(historical_actual/inventory_shortage/mixed)`, `generatedById`, `generatedAt`, `adoptedAt`, `sourceSnapshotJson`, `capacitySummaryJson`, `demandSummaryJson`, `materialForecastSnapshotJson` を持つ。
- `ProductionPlanCandidate`: 採用前の候補行。`planningRunId`, `productId`, `planDate`, `quantity`, `workAreaId`, `roomId?`, `demandType(inventory/order/forecast)`, `priority`, `estimatedMinutes`, `capacityReason`, `materialRisk`, `sourceDemandIdsJson`, `replacesPlanId?` を持つ。
- `ProductionPlanBatch`: 採用された計画群の束。`planningRunId`, `status(active/superseded)`, `adoptedById`, `adoptedAt` を持ち、`ProductionPlan` 側に `planningRunId?` / `planningBatchId?` を追加する。

**生成・採用ルール**:
- `monthly-schedule` API は、まず `MonthlyPlanningRun` と `ProductionPlanCandidate` を作る。即時に `ProductionPlan` を作らない。
- 管理者が候補一覧で数量・日付・部屋・順序を確認し、「仮予定として採用」した時点で `ProductionPlan(status:'draft')` を作る。
- 既存の `replaceGeneratedDraftsOnly` は note prefix 依存をやめ、`planningRunId/planningBatchId` 単位で置換対象を決める。
- 再生成時は、前回採用済み計画との差分（追加/削除/日付変更/数量変更/部屋変更/材料リスク変更）を表示し、管理者が採用してから反映する。
- `confirmed/completed` は自動置換しない。`draft/tentative_confirmed` のうち、在庫生産かつ未着手の予定だけを差替候補にする。

**UI**:
- `/planning/monthly#allocate` に「生成履歴」リストを追加する。各runに「生成条件」「候補数」「必要時間」「空き時間」「材料リスク」「採用状態」を表示。
- 候補プレビューはカレンダーと表の両方で表示し、既存予定との差分を色分けする。追加は青、移動は黄、削除候補は赤、変更なしはグレー。
- 採用ボタンのラベルは「仮予定として採用」。採用後に「仮確定へ進む」next-action を表示する。

### 6.4 再計画イベント（受注割込み・入荷変更・当日変更の中枢）

理想動線の step9 と step11 は、単なる再計算ではなく「何が起きたから、どの予定を、どの制約で動かしたか」を残す必要がある。各APIが個別に再計算を呼ぶのではなく、`ReplanEvent` と `ReplanJob` を通す。

**新規モデル（推奨）**:
- `ReplanEvent`: 再計画の原因。`eventType(demand_created/demand_updated/purchase_arrival_updated/po_confirmed/stock_adjusted/day_allocation_changed/daily_report_approved/shift_changed)`, `targetMonth`, `sourceType`, `sourceId`, `createdById`, `payloadJson`, `status(pending/processed/ignored/failed)`。
- `ReplanJob`: 再計画の実行単位。`eventId`, `scopeMonth`, `scopeDateFrom`, `scopeDateTo`, `policyJson`, `status(planned/applied/rejected/failed)`, `diffJson`, `createdAt`, `appliedAt`。
- `ReplanDiff`: 必要なら別テーブル化。`planId`, `changeType(add/move/resize/cancel/lock)`, `beforeJson`, `afterJson`, `reason`。

**再計画ポリシー**:
- 受注生産（`ProductDemand.status=open` に紐づく計画）は固定する。必要なら優先度最高で空き枠を確保する。
- 変動させるのは在庫生産のみ。`confirmed/completed` と日報入力済みの予定は原則ロックする。
- 月間の在庫商品ごとの製造数は維持する。どうしても維持できない場合は「未配置数量」として差分に残し、管理者判断に回す。
- 当日割当の変更は、その日の確定/仮確定計画にだけ直接反映し、翌日以降は在庫生産だけを再配置する。
- PO入荷予定の後ろ倒しで材料裏付けが崩れた場合、対象の `tentative_confirmed` は `draft` へ降格し、代替日があれば在庫生産のみ移動する。

**UI**:
- `/planning/monthly#replan` に「再計画キュー」を追加する。原因、影響件数、変更候補、未解決の不足を表示する。
- 再計画差分画面では、管理者が「適用」「一部適用」「破棄」を選べるようにする。適用前に `ProductionPlan` を直接更新しない。
- 受注登録後、画面上部に「受注を反映する再計画が必要です」バナーを出し、差分確認へ誘導する。
- 当日割当画面には「翌日以降の在庫予定を再編成」アクションを置く。ラベルは明確にし、受注生産や完了済み予定が動かないことを画面上で示す。

### 6.5 在庫台帳と日報系統の整理

AGENTS.md の「planned values と actual values の分離」「immutable ledger」を満たすには、在庫反映と日報確定の正を明確にする必要がある。

**在庫台帳ルール**:
- `CONFIRMED` な実績入出庫・入荷・調整行は削除再作成しない。訂正は逆仕訳または `CANCELLED`/`supersededMovementId` で追跡する。
- `PLANNED` 行も、可能な限り delete/recreate ではなく `CANCELLED` で旧予定を残し、新しい予定行を追加する。移行初期は `PLANNED` のみ delete/recreate を許容してもよいが、最終的には `sourceType/sourceId/revision/supersedesMovementId` を持たせる。
- `StockMovement` には `sourceType(production_plan/daily_report/purchase_order/manual_adjustment)`, `sourceId`, `sourceRevision`, `supersedesMovementId?`, `createdById?` を追加検討する。
- Excel風在庫表の手入力は、実在庫の上書きではなく `MANUAL_ADJUSTMENT` movement を発行する。自動値との差分が分かるUIにする。

**日報整理ルール**:
- 実績の正はB系統 `ProductionDailyReportEntry(approvalStatus='approved')` に寄せる。
- B系統の日報承認時に、商品在庫、原料/資材在庫、`ProductMonthlyActual`、手間賃基礎データ、`ProductDemand.fulfilled`、`ReplanEvent(daily_report_approved)` を一括で更新/発行する。
- A系統 `DailyReport` は互換表示・過去データ参照・移行期間の入力補助に限定する。新規の在庫/原価反映はB系統のみから行う。
- 二重反映を避けるため、同じ `ProductionPlan` に対して A/B 両方から actual movement が出ないよう一意制約またはガードを置く。

### 6.6 UI変更チェックリスト（実装時に必ず見る）

**ホーム `/`**:
- 「今日の業務」と「月次計画ループ」を明確に分ける。
- 月次計画カードに `シフト → 需要算出 → 候補生成 → 仮予定採用 → 発注 → 入荷予定 → 仮確定 → 確定` の進捗を表示する。
- `monthlyNextAction` を追加し、未完了の最小ステップへ誘導する。

**月次計画ハブ `/planning/monthly`**:
- ステッパーUIを追加し、8ステップを1画面から横断できるようにする。
- `#demand`, `#allocate`, `#candidates`, `#confirm`, `#purchase`, `#promotable`, `#replan` のアンカーを用意する。
- 月・計画run・採用batchを切り替えられるようにする。

**候補生成/採用UI**:
- 生成結果をすぐ計画化せず、候補表とカレンダーで確認させる。
- 既存予定との差分、受注固定枠、在庫生産枠、未配置数量、材料リスクを同じ画面で見せる。
- ボタン文言は「候補を生成」「仮予定として採用」「仮確定へ進む」に統一する。

**仮確定/確定UI**:
- `draft` は「仮予定」、`tentative_confirmed` は「仮確定」、`confirmed` は「確定」と表示する。
- 行ごとに `hard_shortage`, `unconfirmed_dependency`, `below_safety`, `none` を見える化する。
- `hard_shortage` 行は仮確定ボタンを無効化し、「発注一覧へ」導線を出す。
- `tentative_confirmed` 行は「確定する」ボタンを表示し、未確定入荷依存が残る場合は理由を表示する。

**発注/入荷UI `/purchases`**:
- 月末在庫予測モードを標準にする。
- 発注候補に「月末予測在庫」「翌月必要量」「不足開始日」「推奨発注日」「入荷予定日」「裏付け予定件数」を表示する。
- 入荷予定日入力後に、昇格可能な製造予定へのリンクを表示する。

**受注UI `/product-planning`**:
- 受注/仮受注トグル、出荷予定日、製造予定日、数量、得意先を明確に分ける。
- 登録後に「予定化」「再計画差分を見る」を出す。
- 受注生産の予定は、在庫生産と視覚的に区別する。

**当日割当/現場印刷UI**:
- 当日の部屋・順番・担当者変更を管理者が行えるようにする。
- 変更が翌日以降へ影響する場合は「在庫商品のみ再編成」へ誘導する。
- 現場印刷/スタッフ印刷は、確定予定を基準にしつつ、当日変更後の部屋・順番を反映する。

**日報UI**:
- 予定との差分（数量、時間、材料使用、部屋、担当者）を入力/確認できるようにする。
- 承認時に在庫・月次実績・需要消し込みへ反映されることを、管理者向けに確認表示する。

**在庫見える化UI**:
- 現在庫、予定引当後、未確定入荷込み、月末予測、翌月不足を同じ品目行で見られるようにする。
- 各数値から `StockMovement` 台帳、関連PO、関連製造予定へドリルダウンできるようにする。

---

## 7. 実装インパクト分類

### 7.1 既存で流用可（変更最小、呼び方を変えるだけ）
- `app/src/lib/staff-allocation.ts`（割付エンジン本体）— step3は無改修で流用
- `app/src/lib/monthly-production-forecast.ts` / `monthly-production-schedule.ts`（予測・分散）— step2流用
- `app/src/lib/material-forecast.ts:57-147 buildMaterialForecast`（confirmed/withUnconfirmed 2系列）— 月末予測の内部計算に流用
- `app/src/lib/order-quantity.ts`（ロット丸め）/ `app/src/lib/purchase-order-urgency.ts`（緊急度）— そのまま
- `app/src/app/api/purchase-orders/[id]/{order,confirm,receive}/route.ts`（PO遷移表ガード `ALLOWED_STATUS_TRANSITIONS`）— PO側は既に成熟、流用
- 作業日報印刷フォーム（MEMORY: nippo-print-form）— 確定予定の出力先として流用

### 7.2 既存を改修
| ファイル | 改修内容 |
|---|---|
| `app/prisma/schema.prisma:358` | `ProductionPlan.status` コメントに `tentative_confirmed` 追加（enum は文字列なのでマイグレーション不要だが移行ノート必須） |
| `app/prisma/schema.prisma` | `MonthlyPlanningRun` / `ProductionPlanCandidate` / `ProductionPlanBatch` / `ReplanEvent` / `ReplanJob` を追加。`ProductionPlan` に `planningRunId?` / `planningBatchId?` を追加 |
| `app/prisma/schema.prisma:464-480` | `ProductDemand` に `productionPlanId?`(+relation)、`productionDueDate?`、`status` に `tentative` |
| `app/prisma/schema.prisma` | `StockMovement` に `sourceType/sourceId/sourceRevision/supersedesMovementId` を追加検討。実績/確定movementは削除再作成しない方針へ移行 |
| `app/src/lib/schemas.ts:33,723` | `PlanStatusEnum` に値追加、`planStatuses` 既定を3値に。`ProductDemand` status enum 拡張 |
| `app/src/lib/labels.ts:20-48` | `planStatusLabel/Class` に `tentative_confirmed=仮確定`、`draft=仮予定` 改称、warning クラス |
| `app/src/lib/material-forecast.ts` | plan.status フィルタ（`:217`相当）を3値に。月末締めモード関数 `loadMonthEndInventoryForecast` 追加 |
| `app/src/lib/monthly-shift-simulation.ts` / `monthly-production-schedule.ts` | 生成結果を直接 `ProductionPlan` にせず、`ProductionPlanCandidate` として返す/保存する経路を追加 |
| `app/src/app/api/product-planning/monthly-schedule/route.ts` | direct createMany を候補保存→採用APIに分離。`replaceGeneratedDraftsOnly` の note prefix 依存を `planningBatchId` 基準へ置換 |
| `app/src/app/api/production-plans/[id]/confirm/route.ts:10-16` | 無条件更新を撤廃し `assertConfirmEligible`（canConfirm）ゲート＋遷移は tentative_confirmed→confirmed のみ許可 |
| `app/src/app/api/production-plans/bulk-confirm/route.ts:13-21` | ★C5: `status==='draft'` 固定フィルタと `updateMany` の `where:{status:'draft'}` を外し、対象を `tentative_confirmed`（必要なら `draft` も）に拡張したうえで `canConfirm` ゲートで絞る。現状のままだと仮確定済み予定がスキップされ確定へ進めない |
| `app/src/app/api/purchase-orders/[id]/route.ts:43-70` | `refreshAroundPurchaseOrder` 後に `evaluatePlanBacking()`→自動昇格/降格を発火 |
| `app/src/app/api/purchase-candidates/generate/route.ts:9-13` | `GenerateSchema` に `mode` 追加、month_end 分岐 |
| `app/src/app/production-plans/monthly/confirm/monthly-plan-decision-client.tsx:187-211` | 「本決定」を「仮確定」ゲートに。hard_shortage 行はボタン無効化 |
| `app/src/app/production-plans/monthly/page.tsx` / `monthly-schedule-actions.tsx` | 月間生成履歴、候補プレビュー、差分表示、採用batch表示を追加 |
| `app/src/app/production-plans/[id]/page.tsx:318-356` / `plan-actions.tsx:33-38` | requirement に PO逆引きリンク、status別アクション（仮確定/確定の出し分け）。**＋盲点(i)対応: requirementバッジに `below_safety`（安全在庫割れ早期警告）を追加描画**（現状は hard/unconfirmed/none の3値のみで `below_safety` が無バッジ＝不可視。ゲートUIで none と区別して可視化する） |
| `app/src/app/product-planning/product-planning-client.tsx:651-883` | 受注フォームに仮受注トグル・2日付、推奨生産数テーブルに「予定化」ボタン |
| `app/src/lib/day-allocation-service.ts` / `allocate-day/route.ts` | 当日割当保存後、翌日以降に影響がある場合は `ReplanEvent(day_allocation_changed)` を発行。受注生産/完了済み予定は固定 |
| `app/src/lib/inventory-ledger.ts` / `purchase-order-stock-sync.ts` | 実績/確定movementの削除再作成を禁止。予定movementは移行期のみ許容し、最終的に cancel/supersede 方式へ寄せる |
| `app/src/app/page.tsx:25-200` | 月次ループ進捗カード `monthlyLoopProgress` ＋ `monthlyNextAction` を併置 |
| `app/src/components/layout/Sidebar.tsx:41-89` | 月次計画ハブをグループ先頭に追加 |
| `app/src/lib/product-daily-report-service.ts:636-663` | `completeMatchingPlans` の対象 status を `draft|tentative_confirmed|confirmed` に拡張、`ProductDemand.fulfilled` 連動 |
| `app/src/lib/daily-report-service.ts` | A系統日報からの在庫/原価反映を段階的に停止し、B系統を正とする移行方針に合わせる |

### 7.3 新規追加
- `app/src/lib/plan-backing.ts` … `evaluatePlanBacking` / `assertTentativeConfirmEligible` / `assertConfirmEligible`（6.1）
- `app/src/lib/plan-readiness-service.ts` … 確定前チェック（材料、PO入荷、受注充当、シフト/部屋、日付矛盾、日報済み）を集約
- `app/src/lib/monthly-planning-run-service.ts` … 生成run作成、候補保存、採用、差分生成、batch管理
- `app/src/lib/replan-service.ts` … `ReplanEvent/ReplanJob` の作成、影響範囲抽出、在庫商品のみ再配置、差分適用
- `app/src/lib/stock-ledger-policy.ts` … movement差替/取消/訂正の共通ポリシー
- `app/src/app/api/production-plans/[id]/tentative-confirm/route.ts` … 単票仮確定
- `app/src/app/api/production-plans/bulk-tentative-confirm/route.ts` … 一括仮確定
- `app/src/app/api/production-plans/promotable/route.ts` … 昇格可能一覧（⑦ビュー用）
- `app/src/app/api/production-plans/readiness/route.ts` … 確定可能一覧（⑩ビュー用）
- `app/src/app/api/planning/monthly-runs/route.ts` … 月間計画run一覧/作成
- `app/src/app/api/planning/monthly-runs/[id]/adopt/route.ts` … 候補を仮予定として採用
- `app/src/app/api/planning/monthly-runs/[id]/diff/route.ts` … 前回採用済み計画との差分
- `app/src/app/api/replan-events/route.ts` / `app/src/app/api/replan-jobs/[id]/apply/route.ts` … 再計画キューと差分適用
- `app/src/app/planning/monthly/page.tsx`（または既存 `production-plans/monthly/page.tsx` 拡張）… 8ステップ・ステッパー付き月次計画ハブ。`#demand / #allocate / #promotable` アンカー
- `app/src/app/planning/monthly/replan-diff-client.tsx` … 再計画差分の確認・適用UI
- `app/src/app/api/special-demand-events` 用UI / `equivalence-groups` 用UI（step2の運用画面欠落の解消、中期）
- DBマイグレーション: `ProductDemand` の新カラム（`productionPlanId`, `productionDueDate`）、計画run/候補/再計画系モデル、品目マスターへ `orderProcessingBufferDays`（任意）、`StockMovement` 追跡カラム（段階導入）

---

## 8. 段階的移行計画（動線を壊さず5スプリント）

### スプリント0: 仕様固定・E2E安全網・データモデル準備
- 本書を採用版の実装指示書として固定し、理想動線1〜15を E2E テストシナリオへ落とす。まずは失敗するテストでよい。
- `MonthlyPlanningRun` / `ProductionPlanCandidate` / `ProductionPlanBatch` / `ReplanEvent` / `ReplanJob` / `ProductDemand.productionPlanId` / `productionDueDate` のマイグレーションを作る。
- 既存 `confirmed` データ、日報A/B、StockMovement の source を棚卸しし、移行スクリプト方針を決める。
- UI文言を固定する: `draft=仮予定`, `tentative_confirmed=仮確定`, `confirmed=確定`, `completed=完了`, `cancelled=取消`。
- **受け入れ**: 型チェック/既存テストが通る。新モデルは nullable/未使用で既存挙動を壊さない。E2Eシナリオに「未実装で失敗する」期待が明示されている。

### スプリント1: 状態機械の地ならし（既存動線は壊さない）
- `tentative_confirmed` を `PlanStatusEnum`(`schemas.ts:33`)・`labels.ts`・`material-forecast` の status フィルタ・home集計に**値として追加するだけ**。まだ誰も生成しないので既存挙動は不変。
- `app/src/lib/plan-backing.ts` を新規実装（読み取り専用 `evaluatePlanBacking`）。副作用なし。
- `GET /api/production-plans/promotable` を追加（表示のみ）。
- `below_safety` バッジを画面に出し、確定ゲートで何が妨げ/警告なのかを可視化する。
- マイグレーション: `orderProcessingBufferDays` を nullable で追加（既存データ影響ゼロ）。
- **受け入れ**: 既存の draft→confirmed が従来通り動く。promotable APIが正しい候補を返す（CLAUDE.md: 計算式はユニットテスト化 → `plan-backing.test.ts` でゲート判定を網羅）。

### スプリント2: 月間計画ラン・候補保存（step2〜4の中核）
- `monthly-schedule` の direct createMany を止め、`MonthlyPlanningRun` と `ProductionPlanCandidate` に保存する。
- `/planning/monthly#candidates` に候補プレビュー、カレンダー、既存予定との差分、採用ボタンを実装する。
- 採用時に `ProductionPlan(status:'draft')` と `ProductionPlanBatch` を作る。既存自動生成draftの置換は note prefix ではなく `planningBatchId` で行う。
- 受注生産・確定済み・完了済み計画は置換対象から除外する。
- **受け入れ**: 月間生成→候補確認→仮予定採用までが履歴付きで追える。再生成時に差分が表示され、管理者が採用するまで本予定に反映されない。

### スプリント3: 仮確定ゲートと自動格上げ（step4・7の中核）
- `tentative-confirm` / `bulk-tentative-confirm` API 新規、`assertTentativeConfirmEligible` ゲート。
- `confirm/route.ts` / `bulk-confirm/route.ts` に `assertConfirmEligible` を追加。**ここで「無検証確定」が塞がる**ので、移行スクリプトで既存 `confirmed` のうち未確定依存を含む行を `tentative_confirmed` へ再分類（任意・後追い可）。
  - ★C7（二段階移行で既存フローを壊さない）: 現行 `confirm/route.ts:10-13` は任意 status から無条件で confirmed 化しており、`plan-actions.tsx` 等が `draft` から直接 confirm を呼んでいる可能性が高い。遷移元を `tentative_confirmed` のみに**いきなり限定すると過渡期の draft 直接確定が 400 で破綻**する。よって本スプリントで draft→confirmed を呼ぶ既存UIを同時に仮確定経由へ差し替えるか、過渡期は `draft→confirmed` も許容しつつ `canConfirm` ゲートだけを課す二段階移行とする。
- `purchase-orders/[id]/route.ts` に `evaluatePlanBacking` 後処理＋自動昇格/降格。
- 旧本決定画面 `monthly-plan-decision-client.tsx` を「仮確定」ゲートUIに改修、`production-plans/[id]/page.tsx` にPO逆引きリンク。
- **受け入れ**: hard_shortage がある予定は仮確定/確定できない。入荷予定日を入れると対象 draft が仮確定へ昇格（手動 or 自動）。在庫を減らさない＝予定引当（`confirm/route.ts:14` の原則維持）。監査ログが各遷移で残る（CLAUDE.md要件）。

### スプリント4: 月末在庫予測・発注連動・再計画イベント（step5・9・11）
- `material-forecast.ts` に `loadMonthEndInventoryForecast`、`generate/route.ts` に month_end モード、`orderProcessingBufferDays` 反映。
- 仮確定イベント（遷移B）から発注候補生成を自動発火。在庫手入力後の candidate 差分再生成。
- `/purchases` 画面に月末予測在庫列・期間自動連動。
- `ReplanEvent/ReplanJob` を導入し、受注登録、PO入荷予定変更、当日割当変更、日報承認、在庫修正から再計画キューを作る。
- 再計画差分UIを追加し、在庫商品のみ再編成・月間数量維持・受注生産固定を保証する。
- **受け入れ**: 月末予測在庫＝期首＋確定入荷＋未確定入荷−予定使用量 がユニットテストで一致。仮確定すると発注候補が自動で出る。`recommendedOrderDate` がバッファ込みで算出される。受注割込み時に在庫生産だけが移動し、差分確認後に適用できる。

### スプリント5: IA再編・受注ループ・日報/台帳統合（step1・8・12〜15）
- 月次計画ハブ `/planning/monthly`（ステッパー）新設、ホーム月次カード＋`monthlyNextAction`、Sidebar追加。各画面に next-action リンク（5.2のシーケンス）。
- 受注フォームの仮受注トグル・2日付分離、推奨生産数テーブルの「予定化」ボタン、`ProductDemand.fulfilled` 自動消し込み。
- 当日割当/現場印刷に、部屋・順番・担当変更と「翌日以降の在庫商品のみ再編成」導線を追加する。
- 日報B系統を実績の正にし、A系統は互換/参照へ寄せる。承認時に在庫・手間賃・月次実績・需要消し込み・再計画イベントを一貫して発行する。
- `StockMovement` の実績/確定行は削除再作成しない方針へ移行し、在庫見える化画面から台帳・PO・製造予定へドリルダウンできるようにする。
- 特需/同等品の登録UI（step2運用欠落の解消、`EquivalenceGroup` の予測連携は時間が許せば）。
- **受け入れ**: ホームから月次ループ1→15を一筆書きで辿れる。受注を登録→予定化→仮確定→確定→日報完了で `ProductDemand` が `fulfilled` まで進む。実績在庫と月次実績はB系統日報だけから反映される。当日業務動線（既存）は無傷で同居。

### 移行時の不変条件（全スプリント共通の安全装置）
- `tentative_confirmed` を導入しても、未対応コードは「知らない status 文字列」として無害に無視できる（enum追加は破壊的でない）。
- `planned_*` と `actual_*` の分離（CLAUDE.md）は維持。仮確定/確定はあくまで予定引当で実在庫を減らさない。実績は日報B（`ProductionDailyReportEntry`, approved）のみが在庫・原価を動かす。
- 在庫を減らす処理・日報確定・発注確定・請求出力・**新設の各状態遷移**は `audit()` で監査ログを残す（CLAUDE.md必須要件）。
- 再計画は自動で本反映しない。必ず `ReplanJob.diffJson` を作り、管理者が適用してから `ProductionPlan` を更新する。ただし安全な状態ラベルの自動昇格/降格（仮確定条件の維持）は監査ログ付きで許容する。
- 実績/確定 `StockMovement` は削除しない。訂正は取消・逆仕訳・supersedeで追跡する。

---

### 付録: 現行→理想の status マッピング早見表

| 概念 | 理想 | 現行値 | 対応 |
|---|---|---|---|
| 仮予定(materials未確認) | 仮予定 | `draft`（`schema.prisma:358`） | ラベルを「仮」→「仮予定」に。値は据え置き |
| 仮確定(入荷予定で裏付け済) | 仮確定 | **無し** | `tentative_confirmed` を新設（本書3章） |
| 確定 | 確定 | `confirmed` | ゲート付き遷移に（無検証確定を撤廃） |
| 完了 | 完了 | `completed`（日報Bが付与） | 対象 status を3値に拡張 |
| 取消 | 取消 | `cancelled` | 維持＋自動降格と区別 |
| 入荷裏付けの根拠 | (status導出元) | `ProductionPlanRequirement.shortageType` = `none/hard_shortage/unconfirmed_dependency/below_safety`（`material-forecast.ts:117-127`、※enumコメント `schema.prisma:395` は below_safety 未記載で要修正） | status を導出する read-model として活用 |

PO側（`candidate→draft→ordered_unconfirmed→confirmed→received`、`schema.prisma:450`）と `StockMovement`（`PLANNED→CONFIRMED→CANCELLED`）は既に段階分けが成熟しており、**「仮確定」実装の本質は新status追加そのものより、PO/在庫の裏付け状態を `ProductionPlan` へ伝播させる遷移ロジック（現在 `purchase-order-refresh.ts` に欠落）の新設**にある。本書のスプリント1〜3がその中核を埋め、スプリント4〜5で再計画・日報・在庫見える化まで接続する。
