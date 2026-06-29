# 21. UI実装仕様書（Design Contract）

UIコードを変更するAI / 実装者が**最初に必ず読む**1枚。Figmaデザインを「曖昧さのない実装契約」に変換し、判断の迷いを無くす。

**大原則: どの設計判断にも「描いた実例(Figma)」か「書いたルール(本書)」が必ず存在する（decision-complete）。**
画面に無い＝作らない、ではない。本書のルールでパターンを導出する。

- Figmaファイル: `北名古屋 製造管理システム UI` / fileKey `MoFI6LDiDEmqDRqt16TLFo`
- 併読: `docs/20_design_coverage_matrix.md`（機能↔画面の網羅）, `docs/12_screen_requirements.md`, `docs/13_business_rules.md`, `docs/19_flow_redesign_2026-06-29.md`（仮予定→仮確定→確定の状態機械）
- 最終更新: 2026-06-30（`/product-planning`・`/production-plans/auto`・`/production-plans/monthly/confirm`・ProductDemand・再計画キューを**実装対象/現行MVP**として明記。§2.4・§7 を追加）

---

## 0. 真実の源泉と優先順位（衝突したらこの順）

| 観点 | 正となるもの |
|---|---|
| 見た目・レイアウト・配色 | **Figma**（本ファイル） |
| 適用ルール・状態・未描画ケースの導出 | **本書 + docs/13 業務ルール** |
| トークン名・コンポーネントAPI | **既存コード** `app/src/app/globals.css` / `app/src/components/**` |
| 機能の網羅（取りこぼし防止） | **docs/20 カバレッジ表** |

トークンは**新しい命名を作らない**。既存の CSS 変数名（`--primary` 等）をそのまま使い、値だけ Figma に合わせる（更新済み）。

---

## 1. デザイントークン

### 1.1 Figmaトークン ↔ CSS変数 ↔ 値（唯一の対応表）

配色は **ティール(実績) × ブルー(予定) × クールグレー**。`app/src/app/globals.css` の `:root` に定義済み。

| Figma 変数 | CSS 変数 | 値 | 用途 |
|---|---|---|---|
| color/bg/canvas | `--bg` | `#F8FAFC` | 画面背景 |
| color/bg/surface | `--surface` `--card` `--panel` `--background` | `#FFFFFF` | カード/テーブル面 |
| color/bg/subtle | `--surface-subtle` `--secondary` `--muted-bg` | `#F1F5F9` | ヘッダ行/淡い面 |
| color/bg/hover | `--surface-strong` | `#E8EEF4` | hover/強めの面 |
| color/text/primary | `--text` `--foreground` | `#0F172A` | 本文/見出し |
| color/text/secondary | `--muted` | `#475569` | 補助テキスト |
| color/text/muted | `--text-subtle` | `#64748B` | 三次/プレースホルダ |
| color/text/inverse | `--primary-foreground` | `#FFFFFF` | 濃色上の文字 |
| color/border/default | `--border` | `#E2E8F0` | 標準境界 |
| color/border/strong | `--border-strong` `--input` | `#CBD5E1` | 入力枠/強い境界 |
| color/border/focus | `--ring` | `#0E8E8A` | フォーカスリング |
| color/brand/solid | `--primary` | `#0E8E8A` | 主要操作・**実績** |
| color/brand/hover | `--primary-hover` | `#0B7370` | primary hover |
| color/brand/subtle | `--primary-soft` `--accent-bg` | `#E6F4F3` | brand淡色背景 |
| color/brand/text | `--accent` | `#0B7370` | brandテキスト/リンク |
| color/info/solid | `--info` | `#2563EB` | **予定**・情報 |
| color/info/subtle | `--info-soft` | `#EFF4FF` | 予定淡色背景 |
| color/info/border | `--info-border` | `#C7D9FD` | 予定境界 |
| color/info/text | `--info-text` | `#1D4ED8` | 予定テキスト |
| color/warning/solid | `--warn-solid` | `#D97706` | 注意（ドット/アイコン） |
| color/warning/subtle | `--warn-soft` | `#FEF3E2` | 注意淡色背景 |
| color/warning/border | `--warn-border` | `#FACC7A` | 注意境界 |
| color/warning/text | `--warn` | `#B45309` | 注意テキスト |
| color/danger/solid | `--danger` `--destructive` | `#DC2626` | 不足・エラー |
| color/danger/subtle | `--danger-soft` | `#FDECEC` | 不足淡色背景 |
| color/danger/border | `--danger-border` | `#F4B4B4` | 不足境界 |
| color/danger/text | `--danger` | `#DC2626` | 不足テキスト |
| color/success/solid | `--success-solid` | `#16A34A` | 完了・確定 |
| color/success/subtle | `--success-soft` | `#E7F6EC` | 完了淡色背景 |
| color/success/border | `--success-border` | `#9FD9B4` | 完了境界 |
| color/success/text | `--success` | `#15803D` | 完了テキスト |

**Spacing**（Figma spacing/N = Npx）: 2,4,6,8,12,16,20,24,32,40,48,64。**Radius**: sm4 / md6 / lg8 / xl12 / full999（`--radius`=8px基準）。

### 1.2 トークン使用ルール（厳守）

- **HEX をハードコードしない。** 必ず CSS 変数を使う。Tailwind は `bg-[var(--primary)]` `text-[var(--muted)]` `border-[var(--border)]` 形式。
- JS で生の値が要る時（チャート等）だけ `app/src/lib/tokens.ts` を import。
- 新しい色名・グレーの暖色化（ベージュ/ストーン）は**禁止**（Claude調に戻さない）。

### 1.3 タイポグラフィ（Figma text style → 実装）

フォント = OS標準（globals.css の font-family、日本語可）。Figma は Noto Sans JP で表示。サイズ/太さ対応:

| Figma style | px / 太さ | Tailwind 目安 |
|---|---|---|
| Heading/H1 | 24 / bold | `text-2xl font-bold` |
| Heading/H2 | 20 / bold | `text-xl font-bold` |
| Heading/H3 | 16 / bold | `text-base font-bold` |
| Body/M(Strong) | 14 / 400(500) | `text-sm` (`font-medium`) |
| Body/S | 13 / 400 | `text-[13px]` |
| Label | 12 / medium | `text-xs font-medium` |
| Caption | 12 / 400 | `text-xs` |
| Table Header | 12 / bold | `text-xs font-bold` |
| Number/Data | 14 / medium・等幅 | `text-sm font-medium tabular-nums` |

数値は常に `tabular-nums`（body既定で有効）。

---

## 2. コンポーネント対応表（Figma → コード）

既存コード（`app/src/components/**`）に**必ずマッピング**する。新規に重複コンポーネントを作らない。

| Figma | コード | variant / props 対応 |
|---|---|---|
| Button (Style=Primary) | `ui/button.tsx` `<Button>` | `variant="default"` |
| Button (Secondary) | 〃 | `variant="secondary"`（枠線）/ または `outline` |
| Button (Ghost) | 〃 | `variant="ghost"` |
| Button (Danger) | 〃 | `variant="destructive"` |
| StatusBadge (Tone=Brand=実績) | `ui/badge.tsx` `<Badge>` | `variant="default"` |
| StatusBadge (Neutral=仮/候補) | 〃 | `variant="secondary"` |
| StatusBadge (Success=確定/完了) | 〃 | `variant="success"` |
| StatusBadge (Warning=未確定/注意) | 〃 | `variant="warning"` |
| StatusBadge (Danger=不足/未対応) | 〃 | `variant="destructive"` |
| StatusBadge (Info=予定) | 〃 | **`variant="info"`（要追加・下記）** |
| Input | `ui/input.tsx` `<Input>` | `type="text"` |
| DateInput | 〃 | `<Input type="date">` |
| NumberInput | 〃 | `<Input type="number" inputMode="numeric">` ＋単位サフィックス |
| Select | `ui/searchable-combobox.tsx` `<SearchableCombobox>` | options[] / value / onChange（マスタ由来の選択は必ずこれ） |
| Table（行/列/ヘッダ） | `ui/table.tsx` `<Table>/<TableHeader>/<TableRow>/<TableHead>/<TableCell>` | 数値セルは `className="text-right tabular-nums"` |
| Card / CardHeader | `ui/card.tsx` | `<Card>/<CardHeader>/<CardTitle>/<CardContent>/<CardFooter>` |
| SectionTabs / Tabs | `ui/section-tabs.tsx` `<SectionTabs>` | items[]（id/label/count/content） |
| Sidebar（階層ナビ） | `layout/Sidebar.tsx` | menuSections（lucide icon）。**セクション内に複数ビューがある場合はサブ項目を常時展開**（`NavItem/<section>.<view>`、例 `plan.calendar`/`plan.hub`/`plan.list`、`material.ledger`/`material.projection`、`print.hub`/`print.schedule`/`print.staff`）。active=現在ルートの最長一致でサブ項目を点灯し、親セクション名は brand text で示す。**印刷は独立セクション**。 |
| PageHeader | `layout/Header.tsx` / 各ページ見出し | タイトル＋対象期間＋右上アクション |
| KPICard | （共通化候補。無ければ Card で構成） | label / value / unit / delta + toneドット |
| WarningBanner | （共通化候補） | tone(danger/warning/info)＋アイコン＋文言 |
| FilterBar | （各ページで構成） | 検索 Input ＋ Select 群 ＋ トグル |
| Modal | （Radix Dialog 等） | Header / Body(フォーム) / Footer(操作) ＋オーバーレイ |
| Empty/Loading/Error | （共通State） | 後述 §3.7 |

### 2.1 Badge に `info` variant を追加（予定バッジ用）

`ui/badge.tsx` の `variants.variant` に追記:

```ts
info: "border-[var(--info-border)] bg-[var(--info-soft)] text-[var(--info-text)]",
```

業務語 → variant の確定対応は `app/src/lib/tokens.ts` の `STATUS_TONE` を参照（予定→info / 実績→default / 確定→success / 仮→secondary / 未確定→warning / 不足→destructive …）。

> **このvariant追加は必須のまま残す。** 14 Monthly Planning Hub のステッパ「進行中」ノードや予定系KPI（翌月需要・入荷予定）は info(青) を使う。`info` variant が未追加だと予定バッジが描けず、予定(青)と実績(teal)の色分け（§3.4）が崩れる。

### 2.2 Code Connect の状態（重要）

Figma 公式の **Code Connect は現在のプラン(Pro)では利用不可**（Organization/Enterprise + Dev/Full シートが必要）。
そのため代替として、**各 Figma コンポーネントの description にコード対応を埋め込み済み**（`get_design_context`/`get_metadata` で返る）。Button / StatusBadge / Input / Select / DateInput / NumberInput に設定済み。

- AIがFigmaノードを読む際は、その description に書かれた「コード: <X> @ path」を正とする。
- 本書 §2 の表が常に最優先の対応表（descriptionと表が食い違ったら表を採用）。
- 将来 Enterprise へ上げたら、`@figma/code-connect` を導入し `*.figma.tsx`(`figma.connect()`) を作成 → `figma connect publish` で Dev Mode 連携に昇格できる（その時の元データが本表）。

### 2.3 新規パターン（Figma 14〜19）の実装注意

| パターン | 使う画面 | コード方針 / props |
|---|---|---|
| **Stepper（横ステッパ）** | 14 | 番号サークル＋ラベル＋StatusBadge を `→` で連結。ノード状態: 完了→success / 進行中→info / 未→neutral(secondary) / **仮確定→warning**（確定=success と仮=neutral の中間として明示）。`docs/19` の8ステップ（仮予定→仮確定→確定）と1:1。実装は配列 driven（`steps[]`）で。 |
| **KPICard（要約カード）** | 14, 15 | label＋大数値＋単位＋tone付きサブ行＋次アクションlink。サブ行は warning/danger に `⚠`、tone色は §1.1。Card で構成（共通化候補）。 |
| **印刷レイアウト（PaperTable／Sheet）** | 16, 17 | **サイドバー無し**。画面=印刷バー（`画面のみ表示`・印刷/戻る）＋中央寄せA4シート(白地)。表は全セル枠線（border/strong）、空行は手書き用に高さ確保。配色はトークン維持しつつ白地・枠線主体。CSSは `@media print` でバー非表示・影/角丸除去。 |
| **タイムライン（配置バー）** | 17（12を流用） | time→x換算（hourWidth固定）、休憩=網掛け(bg/subtle)、配置バー=brand(配置済)。`color/neutral/*` は使わず neutral は bg/subtle・text/secondary。未割当はwarningで別掲。 |
| **セルフ入力（スマホ）** | 18 | **サイドバー無し**・390幅。ブランド色アプリバー＋大タップ領域（トグル/入力 ≥44px）。**状態は独立フレーム**: 下書き / 送信完了(success) / トークン無効(danger) / 期限切れ(warning)。管理UIとは別コンポーネント系統。 |
| **SegmentedToggle / Switch** | 18, 19 | 出勤/休み等の二択=セグメント（active=brand/inverse、inactive=transparent/secondary）。有効/請求対象等のon-off=Switch（on=brand、knob=white）。Radix等で実装。 |
| **Master編集モーダル** | 19 | Modal型（ヘッダ＋本文フォーム＋フッタ[キャンセル/保存]＋オーバーレイ）。マスタ参照フィールドは**必ず SearchableCombobox**。**商品編集に「原料ロス率 許容値（既定5%/手詰め3%/NTSするめソーメン10g 8%）」を必須**。BOM/伝票マッピングは本文に明細テーブルを内包。 |
| **月間カレンダー（マス目）** | 20 | 7×N週グリッド。日セルは固定高で内容クリップ＋「＋N 他」あふれ表示。土=info(青)/日=danger(赤)/平日=primary の日付色、週末セルは bg/subtle。予定チップは status色（予定=info / 仮確定=warning / 確定=success の subtle＋border）。月初の曜日オフセットに注意（2026-07-01=水）。上部に「前々月・前年同月比」の月次予測テーブル（予測値=info、採用=success/要確認=warning）。 |
| **在庫見込み 時系列チャート** | 21 | 日別棒チャート。**確定在庫見込み=brand(teal)棒**、**未確定入荷込み=info(青)ゴースト棒（背面）**、**安全在庫=warning水平線**、**0未満(マイナス)=danger棒（zero線の下）**。安全在庫割れは warning。`color/neutral/*` は使わず neutral は bg/subtle。下に日別テーブル（期首/確定入荷/未確定入荷/使用予定/確定見込/未確定込見込/状態）。状態=充足(success)/安全在庫割れ(warning)/未確定入荷で充足(warning)。**確定と未確定を列・色で必ず分離**（§3.4・§3.6）。 |

### 2.4 新規パターン（Figma 22〜25・現行MVP）の実装注意

| パターン | 使う画面 | コード方針 / props |
|---|---|---|
| **状態ゲート（3段ステージ）** | 23 | 仮予定(draft)→仮確定(tentative_confirmed)→確定(confirmed) を 3 カード＋`→` で連結。tone: draft=neutral / 仮確定=warning / 確定=success。各ステージに件数＋**昇格条件**（仮確定: BOM解決・能力登録・安全在庫OK／確定: 仮確定済＋発注裏付け済）を明示。`docs/19` の状態機械と1:1。 |
| **判定一覧（簡易編集セル＋ゲートチェック列）** | 23 | 1行=1 ProductionPlan。**日付/数量/作業場所/開始/人数**は枠付き input セル（編集可）。**BOM不足 / 原料·包材不足 / 未確定入荷依存 / 安全在庫割れ / 発注裏付け済み**を**別列**で表示（確定在庫不足=danger と 未確定入荷依存=warning を混同しない）。行tone: 仮確定不可=danger / 確定不可=warning。一括操作バーに**一括仮確定**(secondary)・**一括確定**(primary)。条件を満たす行のみ実行（不可はスキップ）。 |
| **製品在庫/生産候補テーブル** | 22 | 列=商品/現在庫(=確定)/予定生産/受注·出荷/安全在庫/不足/推奨生産数/理由。**区分バッジ**: 在庫生産=brand / 受注生産=info / 未確定依存=warning。現在庫は**確定在庫のみ**、未確定入荷込みで足りる行は「未確定入荷込みで充足（要確認）」(warning) として確定不足と分離。数量は袋/ケース等の単位付き右寄せ。 |
| **需要登録パネル（ProductDemand）** | 22 | 商品=SearchableCombobox（マスター由来）。需要種別=受注(order)/出荷予定(shipment)/需要予測(forecast)。状態=受注(open)/仮受注(tentative)。出荷予定日・製造予定日=DateInput。数量=NumberInput。得意先/外部参照/備考=任意。登録は ProductDemand 作成＋再計画待ち（在庫生産の再判定は再計画キューへ）。 |
| **自動作成プレビュー** | 24 | 準備フローカード（対象日/商品候補/能力登録/出勤シフト）→入力（計算モード/開始/休憩）→候補→プレビュー表（当日実施トグル・作業場所=変更可Select・配置スタッフ=変更可Select・注意バッジ・時間/数量）。**作成物は draft（仮予定）**。確定後に印刷導線（作業日報印刷=16/スタッフ配置印刷=17）。受注生産を先・在庫生産を後に配置。休み/シフト未登録者は配置・印刷対象外。 |
| **再計画キュー（ReplanJobテーブル）** | 25 | ポリシーカード2枚（再編成する=翌日以降の在庫生産draft／固定する=受注生産·confirmed·completed）。一覧列=発生日時/原因/対象月/**再計画対象日**/**作成·置換·未配置**/状態(planned=warning/applied=success/rejected=neutral)/関連リンク(ProductDemand·ProductionPlan·ReplanJob)/操作(差分を適用·見送り)。差分適用は最小実装である旨を info バナーで明示。 |

> §2.3 で導入した **`info` variant（予定用）** は 22〜25 でも必須（予定生産・需要・入荷予定・状態バッジ）。

---

## 3. パターン共通ルール（未描画ケースはここから導出）

### 3.1 レイアウト
- 左に**固定サイドナビ240px**（`layout/Sidebar.tsx`）。本文は残り幅。
- 各ページ上部に **PageHeader**: 左=タイトル＋対象日/期間、右=主要アクション。
- デスクトップ優先（**1280px+**）。重要操作は右上、行ごとの操作は行末。

#### 3.1.1 ナビゲーション階層（セクション と ビュー）— 重要
**1サイドバー項目＝1機能セクション**。1セクションに複数ページ（Figmaページ）がぶら下がるのは正常で、弊害ではない。実装ではこれを2種類に分けて扱う:

| 種類 | 例 | 切替手段 |
|---|---|---|
| **モード切替（兄弟ビュー）** | 生産計画: 月間カレンダー(20) / 計画ハブ(14) / 予定一覧(02)。原料在庫: 在庫台帳(04) / 日別見込み(21)。印刷: 印刷ハブ(15) / 作業日報印刷(16) / 配置印刷(17) | **サイドバーのサブ項目**（常時展開）。`NavItem/<section>.<view>` を点灯、親セクション名は brand text |
| **ドリルダウン（親子）** | 予定一覧(02)→予定詳細(03)、マスタ一覧(08)→編集モーダル(19) | 行クリック/ボタンで遷移。**サブ項目にしない**（“どの対象の詳細か”が決まらないため） |

- ページ内の表示モード切替（例: 02 の「月/週/日/作業エリア別」）は、ページ内 **SectionTabs** として併存させてよい（サイドバー＝どのページ、タブ＝そのページ内の表示）。階層が違うので競合しない。
- サイドバーは現在ルートの**最長一致**で active を解決（`/production-plans/[id]` は `plan.list` を点灯 等）。
- KPIサマリ帯（例: 03 詳細上部の予定数量/終了時刻…）は「選択中ビューの中身」。**切替UIではない**ので、サイドバー/タブとは階層を分ける。

### 3.2 テーブル（業務の中心）
- 数値列は**右寄せ＋等幅**（`text-right tabular-nums`）。文字列は左。
- ヘッダ行は `--surface-subtle`、行下線 `--border`、hoverで `--surface-subtle`。
- **重要列は左**に置き、列が多い時は横スクロール前提（重要列は固定の体裁）。
- **行レベルの警告は行背景を淡色 tint**（不足=`--danger-soft` / 注意=`--warn-soft`）＋状態列にバッジ。色だけに頼らない。
- 合計行は `--surface-subtle`＋太字。

### 3.3 フォーム
- **数値 / 日付 / 選択を見た目で区別**する（NumberInput=右寄せ＋ステッパ＋単位、DateInput=カレンダーアイコン、Select=▾）。
- マスタ由来（商品/原材料/包材/仕入先/作業エリア/従業員）は**必ず SearchableCombobox**。自由入力テキストをキーにしない。
- 必須・バリデーション・フォーカスは `--ring`/`--danger`。エラーは枠 `--danger`＋下にメッセージ（文言必須）。

### 3.4 予定 と 実績（鉄則）
- **同じ色・同じ列構造で混同させない。**
- 予定=**info(青)**、実績=**brand(ティール)**。比較表示は列を分け、実績側を強調（入力枠は `--ring`）。
- `planned_*` と `actual_*` を別データとして扱う（差分も表示）。

### 3.5 警告・ステータス表現
- 警告は**色＋アイコン＋文言の3点**で表す（赤だけ禁止）。例: `⚠` + 「原料不足」 + danger tint。
- 状態は StatusBadge（ドット＋ラベル）。語→variant は §2.1 / STATUS_TONE 固定。
- 「不足 / 未入力 / 未確定 / 完了」が一目で判別できること。

### 3.6 確定/未確定 在庫の区別
- 確定在庫見込みと「未確定入荷依存」を分けて表示（warning=未確定込みでのみ充足）。詳細は docs/13。

### 3.7 状態（全データビューに必ず用意）
- **Empty**: 破線枠＋アイコン＋「データがありません」＋次アクション。
- **Loading**: スケルトン行（`--surface-subtle` バー）。
- **Error**: danger アイコン＋「読み込みに失敗しました」＋再試行。
- 00 Design System ページに実例あり。

---

## 4. 「迷ったらこうする」デフォルト集

| 迷いどころ | デフォルト |
|---|---|
| 色をどう当てる | §1.1 の CSS 変数。無ければ最も近いトーンを選び、勝手にHEXを作らない |
| 新しいステータス語が出た | STATUS_TONE に追記し variant を決める（意味でtoneを選ぶ） |
| 一覧に行操作が要る | 行末に ghost リンク（詳細/編集 等）。破壊的操作は確認を挟む |
| 列が画面に収まらない | 横スクロール。重要列(名称/状態)を左、操作を右端 |
| マスタの編集画面が未描画 | **19 Master Edit Forms の商品編集モーダル型を流用**（ヘッダ/本文フォーム/フッタ＋オーバーレイ）。マスタ参照は SearchableCombobox。10種未満の新マスタも同型で増やす |
| 印刷物が未描画 | **16/17 の印刷型を流用**（サイドバー無し・印刷バー＋A4シート・全セル枠線・`@media print`）。入口は 15 Print Hub に1カード追加 |
| 従業員セルフ入力系が未描画 | **18 Self Shift Entry の型を流用**（スマホ390・ブランドアプリバー・大タップ領域・状態は独立フレーム） |
| 月次計画の「次の一手」を出す | **14 Monthly Planning Hub** の8ステッパ＋要約カード型を流用。未完の最小ステップへ誘導（`docs/19` の状態機械に整合） |
| 数量の単位 | 値の右に `--text-subtle` で単位（袋/kg/枚/個/ケース） |
| 空き/未割当 | neutral（`--surface-subtle`＋`--text-secondary`）。破線枠で「未確定/空き」を示す |
| 余白 | spacing スケールから選ぶ（カード内16/20、要素間8〜16、セクション間16〜24） |
| 説明文 | 画面に多用しない。ラベル・状態・配置で理解させる |

---

## 5. やってはいけないこと

- HEX 直書き / 新トークン名の乱立 / 暖色グレー(ベージュ・ストーン)への回帰。
- 予定と実績を同じ色・同じ列で表す。
- 警告を赤一色だけで表す（アイコン・文言なし）。
- マスタ名称を自由入力テキストで持つ（必ずマスタ選択）。
- Excelの見た目をそのまま移植（整理された業務Webにする）。
- 既存コンポーネントがあるのに重複を新規作成。

---

## 6. 運用（このファイルの育て方）
- 新機能を足したら: docs/20（網羅）＋ 本書（トークン/コンポーネント/ルール）に追記。
- Figmaの色/コンポーネントを変えたら: §1.1 表と globals.css / tokens.ts を同期。
- 「描く or ルール化」の判断: 固有レイアウトは描く、繰り返し・状態・値はルール化（1リファレンス＋Nルール）。

---

## 7. 製品在庫・受注計画／月次ゲート／自動計画／再計画 の実装契約（現行MVP）

これらは「将来扱い」ではなく**現行コードに存在する実装対象**である（Figma 22〜25 / `docs/20` C・F.2）。UI を作る/変えるときは以下を必ず満たす。

### 7.1 実装対象（将来扱いにしない）
- `/product-planning`（製品在庫・受注計画。Figma 22）は**実装対象**。
- `/production-plans/auto`（生産スケジュール自動作成。Figma 24）は**実装対象**。
- `/production-plans/monthly/confirm`（月次 仮確定・確定ゲート。Figma 23）は**実装対象**。
- `/planning/monthly#replan`（再計画キュー。Figma 25）は**実装対象**。
- これらは既存ルートを正式に画面化したもの。**既存画面（02/12/14/20 等）・現行ルートを削除/統合する前提にしない**。14 Monthly Planning Hub からの導線（`docs/20` §F.1.1）で接続する。

### 7.2 ProductDemand（受注/仮受注/出荷予定/需要予測）
- 状態 **`open / tentative / fulfilled / cancelled`** を**表示・操作できる**こと（一覧の状態列＋登録/編集の状態Select）。`open`=未処理 / `tentative`=仮受注 / `fulfilled`=消し込み済 / `cancelled`=取消。
- 需要種別 **`order`（受注）/ `shipment`（出荷予定）/ `forecast`（需要予測）** を区別する。
- 商品・得意先などマスター参照は **SearchableCombobox**（自由入力テキストをキーにしない）。
- **受注/出荷予定から ProductionPlan へ「予定化」**できること（受注生産の仮予定 draft を作成し、`ProductDemand.productionPlanId` で紐付け）。残数がある demand は coverage（未予定/一部充足/充足）を表示。

### 7.3 状態遷移（draft → tentative_confirmed → confirmed）
- **自動計画（24）で作る予定は `draft`（仮予定）として作成**する。手動登録の新規予定も既定 draft。
- **昇格条件を UI で明示**する:
  - draft → **tentative_confirmed（仮確定）**: 原料/包材 BOM が解決・生産能力が登録済み・安全在庫割れなし（または許容）。`canTentativeConfirm`。
  - tentative_confirmed → **confirmed（確定）**: 仮確定済み＋必要発注が裏付け済み（発注確定 / 入荷予定が確定）。`canConfirm` / `backingPurchaseOrderIds`。
- 状態バッジ: draft=neutral（仮）/ tentative_confirmed=warning（仮確定）/ confirmed=success（確定）。`completed`=success・`cancelled`=neutral。一括仮確定/一括確定は条件を満たす行のみ。

### 7.4 確定在庫不足 と 未確定入荷依存 を別表示
- **確定在庫不足（hard_shortage, danger）** と **未確定入荷依存（unconfirmed_dependency, warning）** を**別の列・別のトーン**で表す（§3.4・§3.6）。
- 現在庫は**確定在庫**を指す。未確定入荷込みで足りる行は「未確定入荷込みで充足（要確認）」(warning) とし、確定在庫で足りる(success)と混同しない。
- 予定値 `planned_*` と実績値 `actual_*` を同じ色・同じ列で混同しない（予定=info / 実績=brand）。

### 7.5 リンク導線を切らない
- **ProductDemand → ProductionPlan → PurchaseOrder → ReplanJob** の相互リンクを必ず張る:
  - 22: 未処理受注の行から「紐づく生産予定」「再計画差分」へ。
  - 23: 判定行から発注裏付け（PurchaseOrder）・要件（BOM/在庫）へ。未処理 ProductDemand を仮予定化。
  - 24: プレビュー予定の詳細（ProductionPlan）・作成後の印刷（16/17）へ。
  - 25: ReplanJob 行から関連 ProductDemand / ProductionPlan / ReplanJob（および ReplanEvent / ReplanJob API）へ。
- 再計画は **在庫生産（自動生成 draft）だけを再編成**し、**受注生産・確定・完了済み・当日以前は固定**（`moveStockProductionOnly` / `lockConfirmedAndCompletedPlans` / `keepMonthlyProductionQuantity`）。作成/置換/未配置の差分件数を表示。差分適用は最小実装である旨を明示する。

### 7.6 データ源泉
- 商品・作業場所・従業員・仕入先・原料・包材・需要はすべて**マスター/API由来**。Figma 上のサンプルデータは実データ扱いしない。部屋名・外注先名は固定値にせずマスターで増減できる前提。
