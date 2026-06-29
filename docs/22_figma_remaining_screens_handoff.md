# 22. Figma 不足画面 追加タスク 引き継ぎ書

このファイル単体で新しいチャットが実行できるように、必要な前提・再利用資産・ハマりどころ・各画面仕様をまとめている。
**新チャットへの指示: 本書を最初に通読し、手順どおりに Figma へ画面を追加し、`docs/20` と `docs/21` を更新すること。**

---

## 0. アクセス情報

- 対象リポジトリ: `/Users/shojiyuya/Downloads/kitagoya_production_system_handoff_v2`
- Figma file: `https://www.figma.com/design/MoFI6LDiDEmqDRqt16TLFo` / fileKey `MoFI6LDiDEmqDRqt16TLFo`
- Figmaアカウント: GiSO1412 (amode1115@gmail.com) / team `amode1115's team` = `team::1229721774315766934`（Pro・編集可）
- **MCPスキル**: `use_figma` 呼び出し前に毎回 `figma-use` スキルをロードし、`skillNames:"figma-use,figma-generate-design"` を渡す。画面生成は `figma-generate-design`、コンポーネント追加は `figma-generate-library` も併用。
- **Code Connect は使えない**（Proプランは Org/Enterprise 必須でエラー）。`add_code_connect_map` を呼ばない。代わりに必要なら各コンポーネントの `description` にコード対応を書く（FRAMEには description が無い点に注意）。

## 必ず読む資料

- `AGENTS.md` / `docs/12_screen_requirements.md` / `docs/19_flow_redesign_2026-06-29.md`
- `docs/20_design_coverage_matrix.md`（網羅表・本タスクで更新）
- `docs/21_ui_implementation_spec.md`（実装契約・トークン↔CSS変数・コンポーネント対応・本タスクで更新）
- 現行ルート（パスは実在を確認してから引用すること。リポジトリ構成により `planning/monthly` か `production-plans/monthly` 等の差異あり）:
  - `app/src/app/**/monthly/page.tsx`, `app/src/app/product-planning/page.tsx`
  - `app/src/app/prints/page.tsx`, `app/src/app/prints/production-schedule/page.tsx`, `app/src/app/prints/staff-assignments/page.tsx`
  - `app/src/app/shift-entry/[token]/page.tsx`
  - `app/src/app/masters/**/page.tsx`

---

## 1. すでにある Figma ページ（重複作成しない）

`00 Design System` / `01 Dashboard` / `02 Production Plan` / `03 Production Plan Detail` / `04 Material Inventory` / `05 Packaging Inventory` / `06 Shortage Alerts` / `07 Daily Report`（中に `07 製造日報（入力）`=node 65:2、`07 スタッフ日報（入力）`=node 70:2、`07 予実サマリ（参考）`）/ `08 Master Data` / `09 Voucher Export` / `10 Purchase Orders` / `11 Shift Schedule` / `12 Work Area Allocation` / `13 Cost & Labor`

新規ページは `14`〜`19` の連番で作る（下記 §5）。`figma.createPage()` で作成し `page.name` を設定。

## 2. 再利用資産

- **Sidebar マスター**: `00 Design System` 上の FRAME `node 8:2`。各画面へはクローンして使う:
  ```js
  const sb=(await figma.getNodeByIdAsync('8:2')).clone();
  screen.insertChild(0,sb); sb.layoutSizingVertical='FILL';
  // アクティブ表示の付け直し（activeKey 例: 'plan','master','report'...）
  for(const it of sb.findAll(n=>n.name&&n.name.startsWith('NavItem/'))){
    const on=it.name==='NavItem/'+activeKey;
    it.fills=on?[solid('color/brand/solid')]:[];
    const lbl=it.findOne(n=>n.type==='TEXT'); if(lbl)lbl.fills=[solid(on?'white':'stone/200')];
    const icon=it.findOne(n=>n.name==='icon');
    if(icon)icon.children.forEach(ch=>{ if('strokes'in ch&&ch.strokes&&ch.strokes.length)ch.strokes=[solid(on?'white':'stone/300')];
      if('fills'in ch&&Array.isArray(ch.fills)&&ch.fills.length)ch.fills=[solid(on?'white':'stone/300')]; });
  }
  ```
  ナビ active key: `dashboard/plan/shift/allocate/material/packaging/shortage/purchase/report/cost/master/export`。
- **コンポーネントセット nodeID**（参考）: Button 5:12 / StatusBadge 6:20 / Input 7:2 / Select 7:4 / DateInput 7:7 / NumberInput 7:12。
- **トークン**（バインド済み変数。`solid('color/...')` で参照）: 配色は `docs/21` §1.1 を正とする。要点: `color/bg/{canvas,surface,subtle,hover}`、`color/text/{primary,secondary,muted,inverse}`、`color/border/{default,strong,focus}`、`color/brand/{solid,hover,subtle,border,text}`（=実績 teal）、`color/info/*`（=予定 blue）、`color/warning/*`、`color/danger/*`、`color/success/*`。プリミティブは `stone/*`(=cool gray), `white` 等。
- **テキストスタイル**: `Heading/H1,H2,H3` / `Body/L,M,M Strong,S,S Strong` / `Number/Large,Data` / `Label` / `Caption` / `Table Header` / `Nav`。フォント `Noto Sans JP`（Regular/Medium/Bold/Black。**SemiBold は無い**）。

## 3. 標準シェル構造（デスクトップ画面）

- 画面 FRAME 名 = ページ名。`HORIZONTAL` で `[Sidebar(240,FILL), Content(FILL)]`。
- Content は `VERTICAL`：`PageHeader`（左=タイトル＋対象日/期間、右=主要アクション、下境界）→ `Body`（padding 24, gap 16, FILL幅）。
- 画面高さは固定。最後に内容に合わせて `screen.resize(1440, Math.ceil(78+body.height+24))`。`Content.clipsContent=true`。
- **印刷画面(16,17)・スマホ画面(18)はサイドバー無し**。TopBar＋本文のみ。

## 4. ヘルパーキット（各 use_figma 呼び出しに毎回コピー。状態は跨がない）

```js
const F='Noto Sans JP';for(const s of ['Regular','Medium','Bold','Black'])await figma.loadFontAsync({family:F,style:s});
const V={};(await figma.variables.getLocalVariablesAsync()).forEach(v=>V[v.name]=v);
const TS={};(await figma.getLocalTextStylesAsync()).forEach(s=>TS[s.name]=s.id);
function solid(n){let p={type:'SOLID',color:{r:0,g:0,b:0}};return figma.variables.setBoundVariableForPaint(p,'color',V[n]);}
async function T(c,s,col){const t=figma.createText();t.fontName={family:F,style:'Regular'};t.characters=c;if(s&&TS[s])await t.setTextStyleIdAsync(TS[s]);if(col)t.fills=[solid(col)];return t;}
const TONE={neutral:['color/bg/subtle','color/border/strong','color/text/secondary','color/text/muted'],info:['color/info/subtle','color/info/border','color/info/text','color/info/solid'],brand:['color/brand/subtle','color/brand/border','color/brand/text','color/brand/solid'],warning:['color/warning/subtle','color/warning/border','color/warning/text','color/warning/solid'],danger:['color/danger/subtle','color/danger/border','color/danger/text','color/danger/solid'],success:['color/success/subtle','color/success/border','color/success/text','color/success/solid']};
async function badge(tone,label){const t=TONE[tone];const b=figma.createFrame();b.name='StatusBadge';b.layoutMode='HORIZONTAL';b.primaryAxisSizingMode='AUTO';b.counterAxisSizingMode='AUTO';b.paddingLeft=8;b.paddingRight=10;b.paddingTop=3;b.paddingBottom=3;b.itemSpacing=6;b.cornerRadius=999;b.counterAxisAlignItems='CENTER';b.fills=[solid(t[0])];b.strokes=[solid(t[1])];b.strokeWeight=1;const d=figma.createEllipse();d.resize(6,6);d.fills=[solid(t[3])];b.appendChild(d);b.appendChild(await T(label,'Label',t[2]));return b;}
async function btn(label,style){const m={Primary:['color/brand/solid','color/text/inverse',null],Secondary:['color/bg/surface','color/text/primary','color/border/strong']}[style];const c=figma.createFrame();c.name='Button/'+style;c.layoutMode='HORIZONTAL';c.primaryAxisSizingMode='AUTO';c.counterAxisSizingMode='AUTO';c.paddingLeft=16;c.paddingRight=16;c.paddingTop=9;c.paddingBottom=9;c.cornerRadius=6;c.counterAxisAlignItems='CENTER';c.fills=m[0]?[solid(m[0])]:[];if(m[2]){c.strokes=[solid(m[2])];c.strokeWeight=1;}c.appendChild(await T(label,'Body/M Strong',m[1]));return c;}
async function field(label,value,kind,col){const ff=figma.createAutoLayout('VERTICAL',{name:'FormField',itemSpacing:6});ff.fills=[];ff.appendChild(await T(label,'Label','color/text/secondary'));const inp=figma.createFrame();inp.name='input/'+(kind||'text');inp.layoutMode='HORIZONTAL';inp.primaryAxisSizingMode='FIXED';inp.counterAxisSizingMode='AUTO';inp.resize(180,38);inp.paddingLeft=12;inp.paddingRight=12;inp.paddingTop=8;inp.paddingBottom=8;inp.counterAxisAlignItems='CENTER';inp.primaryAxisAlignItems='SPACE_BETWEEN';inp.cornerRadius=6;inp.fills=[solid('color/bg/surface')];inp.strokes=[solid('color/border/strong')];inp.strokeWeight=1;
 if(kind==='date'){const w=figma.createAutoLayout('HORIZONTAL',{name:'w',itemSpacing:8});w.fills=[];w.counterAxisAlignItems='CENTER';const cal=figma.createFrame();cal.resize(14,14);cal.fills=[];cal.strokes=[solid('color/text/muted')];cal.strokeWeight=1.4;cal.cornerRadius=2;w.appendChild(cal);w.appendChild(await T(value,'Number/Data',col||'color/text/primary'));inp.appendChild(w);inp.appendChild(await T('▾','Caption','color/text/muted'));}
 else{inp.appendChild(await T(value,(kind==='number'||kind==='time')?'Number/Data':'Body/M',col||'color/text/primary'));if(kind==='select')inp.appendChild(await T('▾','Caption','color/text/muted'));}
 ff.appendChild(inp);inp.layoutSizingHorizontal='FILL';return ff;}
function card(name){const c=figma.createFrame();c.name='Card/'+name;c.layoutMode='VERTICAL';c.counterAxisSizingMode='FIXED';c.primaryAxisSizingMode='AUTO';c.cornerRadius=8;c.fills=[solid('color/bg/surface')];c.strokes=[solid('color/border/default')];c.strokeWeight=1;c.itemSpacing=0;c.clipsContent=true;return c;}
async function cardHead(card,title,right){const h=figma.createFrame();h.name='h';h.layoutMode='HORIZONTAL';h.primaryAxisSizingMode='FIXED';h.counterAxisSizingMode='AUTO';h.resize(100,1);h.paddingLeft=20;h.paddingRight=20;h.paddingTop=13;h.paddingBottom=13;h.primaryAxisAlignItems='SPACE_BETWEEN';h.counterAxisAlignItems='CENTER';h.fills=[solid('color/bg/subtle')];h.strokes=[solid('color/border/default')];h.strokeWeight=1;h.strokeTopWeight=0;h.strokeLeftWeight=0;h.strokeRightWeight=0;h.strokeBottomWeight=1;h.appendChild(await T(title,'Heading/H3','color/text/primary'));if(right)h.appendChild(await T(right,'Body/S','color/text/secondary'));card.appendChild(h);h.layoutSizingHorizontal='FILL';}
function cbody(card){const b=figma.createAutoLayout('VERTICAL',{name:'cbody',itemSpacing:14});b.fills=[];b.paddingLeft=20;b.paddingRight=20;b.paddingTop=16;b.paddingBottom=18;card.appendChild(b);b.layoutSizingHorizontal='FILL';return b;}
async function frow(parent,fields){const r=figma.createAutoLayout('HORIZONTAL',{name:'r',itemSpacing:14});r.fills=[];parent.appendChild(r);r.layoutSizingHorizontal='FILL';for(const f of fields){r.appendChild(f);f.layoutSizingHorizontal='FILL';}return r;}
async function note(parent,tone,text){const wb=figma.createFrame();wb.name='WarningBanner';wb.layoutMode='HORIZONTAL';wb.primaryAxisSizingMode='FIXED';wb.counterAxisSizingMode='AUTO';wb.resize(100,1);wb.itemSpacing=10;wb.paddingLeft=12;wb.paddingRight=12;wb.paddingTop=10;wb.paddingBottom=10;wb.cornerRadius=6;wb.counterAxisAlignItems='MIN';wb.fills=[solid('color/'+tone+'/subtle')];wb.strokes=[solid('color/'+tone+'/border')];wb.strokeWeight=1;wb.appendChild(await T(tone==='warning'||tone==='danger'?'⚠':'ⓘ','Body/S Strong','color/'+tone+'/text'));const tx=await T(text,'Caption','color/text/secondary');wb.appendChild(tx);tx.textAutoResize='HEIGHT';tx.layoutSizingHorizontal='FILL';parent.appendChild(wb);wb.layoutSizingHorizontal='FILL';return wb;}
// cell: {v,col,style} テキスト / {badge,label} バッジ / {action:[...]} 行内リンク
async function makeTable(parent,cols,rows){const tbl=figma.createFrame();tbl.name='Table';tbl.layoutMode='VERTICAL';tbl.counterAxisSizingMode='FIXED';tbl.primaryAxisSizingMode='AUTO';tbl.resize(100,10);tbl.cornerRadius=8;tbl.clipsContent=true;tbl.strokes=[solid('color/border/default')];tbl.strokeWeight=1;tbl.fills=[solid('color/bg/surface')];const hr=figma.createFrame();hr.name='HeaderRow';hr.layoutMode='HORIZONTAL';hr.counterAxisSizingMode='AUTO';hr.primaryAxisSizingMode='AUTO';hr.fills=[solid('color/bg/subtle')];for(const c of cols){const h=figma.createFrame();h.name='th';h.layoutMode='HORIZONTAL';h.primaryAxisSizingMode='FIXED';h.counterAxisSizingMode='FIXED';h.resize(c.w,36);h.paddingLeft=12;h.paddingRight=12;h.counterAxisAlignItems='CENTER';h.primaryAxisAlignItems=c.align==='right'?'MAX':'MIN';h.fills=[];h.appendChild(await T(c.label,'Table Header','color/text/secondary'));hr.appendChild(h);}tbl.appendChild(hr);for(const rr of rows){const cells=rr.cells||rr;const tone=rr.tone;const tr=figma.createFrame();tr.name='Row';tr.layoutMode='HORIZONTAL';tr.counterAxisSizingMode='AUTO';tr.primaryAxisSizingMode='AUTO';tr.fills=[solid(tone?('color/'+tone+'/subtle'):'color/bg/surface')];tr.strokes=[solid('color/border/default')];tr.strokeWeight=1;tr.strokeTopWeight=0;tr.strokeLeftWeight=0;tr.strokeRightWeight=0;tr.strokeBottomWeight=1;for(let j=0;j<cols.length;j++){const c=cols[j];const cell=cells[j];const td=figma.createFrame();td.name='td';td.layoutMode='HORIZONTAL';td.primaryAxisSizingMode='FIXED';td.counterAxisSizingMode='FIXED';td.resize(c.w,44);td.paddingLeft=12;td.paddingRight=12;td.itemSpacing=8;td.counterAxisAlignItems='CENTER';td.primaryAxisAlignItems=c.align==='right'?'MAX':(c.align==='center'?'CENTER':'MIN');td.fills=[];if(cell&&cell.badge){td.appendChild(await badge(cell.badge,cell.label));}else if(cell&&cell.action){for(const a of cell.action)td.appendChild(await T(a,'Body/S Strong','color/brand/text'));}else{td.appendChild(await T(cell&&cell.v!=null?cell.v:'—',(cell&&cell.style)||(c.align==='right'?'Number/Data':'Body/M'),(cell&&cell.col)||'color/text/primary'));}tr.appendChild(td);}tbl.appendChild(tr);}parent.appendChild(tbl);tbl.layoutSizingHorizontal='FILL';return tbl;}
// 画面末尾で必ず実行（潰れ対策）。td/th と固定サイズの装飾は除外する。
function hugAll(root){root.findAll(n=>n.type==='FRAME'&&n.layoutMode&&n.layoutMode!=='NONE'&&!['td','th'].includes(n.name)&&!n.name.startsWith('input')).forEach(n=>{if(n.layoutMode==='VERTICAL')n.primaryAxisSizingMode='AUTO';else n.counterAxisSizingMode='AUTO';});}
```

## 5. ハマりどころ（必ず守る・これで時間を溶かさない）

1. **`resize()` は auto-layout の hug を FIXED に戻す** → コンテナが高さ1/幅10で潰れる。対策: 各画面の最後に `hugAll(body)` を実行。**幅をhugさせたい横並びの pill/chip/ボタン**は個別に `primaryAxisSizingMode='AUTO'` を後がけする（hugAll は横フレームに counterAxis=AUTO=高さhug しか当てない）。
2. `layoutGrow` は**整数**のみ（1.6 は不可 → 2）。
3. `fontSize` は**数値**（'30' は不可。`Number(size)` で変換）。テキストスタイル適用なら不要。
4. `node.query("...")` のセレクタは **`/` を含む名前を弾く** → `findAll` を使う。
5. `node.description` は **COMPONENT/COMPONENT_SET のみ**（FRAME は不可、`'description' in n` でガード）。
6. **use_figma は原子的**（失敗時は何も適用されない）。エラー文を読んで直して再実行。
7. `setCurrentPageAsync` は1コール1回。複数ページは1ページ=1コールで分ける（並行可）。
8. 色は 0–1 レンジ。`setBoundVariableForPaint` は**新しい paint を返す**ので再代入。
9. 検証: `get_screenshot`→ scratchpad へ `curl` 保存 → Read で目視。**潰れ・黒塗り（存在しないトークン名 `color/neutral/*` 等は黒くなる）**を確認。neutral は `TONE.neutral`（bg/subtle 等）を使い、`color/neutral/*` という変数は無いので直接参照しない。

---

## 6. 追加する画面の仕様

> 共通: `00 Design System` 踏襲。予定=info(青)/実績=brand(teal)。警告は色＋アイコン＋文言。マスタ由来は選択UI。数値は右寄せ。装飾ヒーロー不可。マスタ名は自由入力にしない。

### 14 Monthly Planning Hub（`/…/monthly`、active=`plan`）
月次計画ループの司令塔。1画面で工程を一筆書きで辿れる**ステッパ＋各ステップのカード**。
- PageHeader: 「月次計画」＋対象月（2026年7月）＋アクション（再計画 / 確定）。
- 横ステッパ（8段）: ①シフト登録 →②需要算出 →③候補生成 →④仮予定採用 →⑤発注候補 →⑥入荷予定 →⑦**仮確定**(`tentative_confirmed`) →⑧確定。各ノードに状態バッジ（完了=success/進行中=info/未=neutral）。**仮確定は「仮確定」ラベルを明示**し、確定(success)と仮(neutral)の中間として warning か brand で区別。
- 下に各ステップの要約カード（KPI＋次アクションボタン＋該当画面への導線）: 出勤人数、需要(前々月前年比)、候補件数、採用済、発注候補、入荷予定(確定/未確定)、仮確定件数、確定件数、日報承認待ち、在庫見える化（不足/安全在庫割れ）。
- `docs/19_flow_redesign_2026-06-29.md` の8ステップ（仮予定→仮確定→確定の3段化）に整合させる。

### 15 Print Hub（`/prints`、active=`report` か none）
印刷物への入口ハブ。
- 対象日切替（DateInput）＋拠点。
- カード2枚（または導線リスト）: 「作業日報印刷」「スタッフ配置印刷」。各カードに状態: 印刷OK(success)/要確認(warning)、生産予定件数、未配置人数(warning)。
- 各カードに「印刷プレビュー →」ボタン（16/17へ）。

### 16 Production Schedule Print（`/prints/production-schedule`、**サイドバー無し・印刷用**）
部屋別の作業日報 印刷レイアウト（A4横〜縦想定、白地・枠線中心）。
- 上部に印刷バー（画面のみ表示の体: 「印刷」ボタン＋対象日）。本体は印刷領域。
- 部屋ごとのブロック: ヘッダ（作業日 / ラインNo / 記入者 / 責任者）＋表（担当者 / 商品 / 数量 / 注意事項）＋**空行を数行**（手書き追記用）。
- ナビ・通常操作は最小化。枠線主体で紙に近い見た目（ただしトークン配色は維持）。

### 17 Staff Assignment Print（`/prints/staff-assignments`、**サイドバー無し・印刷用**）
スタッフ配置表（12 Work Area Allocation のタイムラインを印刷用に簡素化）。
- 作業場所別タイムライン（時間軸 9–18、部屋行、配置バー）＋ スタッフ別配置一覧。
- **未割当警告**（warning、文言＋アイコン）。印刷ボタン。
- 12 のタイムライン実装（time→x換算、休憩網掛け、`alloc`バー）を流用。`color/neutral/*` を使わず TONE.neutral で。

### 18 Self Shift Entry（`/shift-entry/[token]`、**サイドバー無し・スマホ/タブレット**）
従業員本人がシフト希望を入力。管理UIとは別。スマホ幅（例 frame 390×… と タブレット 834×… の2種、または 390 単体）。
- 上部: 氏名（トークンで特定）＋対象期間（後半 16–30 等）。
- 日付ごとに「出勤/休み」トグル＋希望時間（開始/終了）＋メモ。大きめのタップ領域。
- 送信ボタン（大）。**状態フレームを別に作る**: ①入力中(下書き) ②送信完了(success 画面) ③トークン無効(エラー) ④期限切れ(エラー)。各状態は独立フレームで。

### 19 Master Edit Forms（`masters/*`、編集はモーダル型、active=`master`）
08 Master Data の一覧に対する**編集フォーム/モーダル**群。`00` の Modal スタイル（ヘッダ/本文フォーム/フッタ操作＋オーバーレイ）を流用。各マスタ1モーダルずつ:
- 商品編集（商品番号/正式名/表示名/生産区分/標準作業場所/請求対象/**原料ロス率許容値**/有効）
- BOM編集（商品＋原料/包材行: 品目選択/1単位使用量/単位/ロス率）
- 原材料編集（原料番号/名称/単位/標準単価/賞味期限管理）
- 包材編集（番号/名称/単位/標準単価/ロット管理）
- 生産能力編集（商品×作業場所/1人時生産量/標準人数）
- 従業員編集（氏名/雇用区分/基本勤務時間/休憩/有効）
- 作業場所編集（名称/種別 internal/external/warehouse/標準開始終了/表示順/有効）
- 仕入先編集（名称/連絡先/対象品目）
- 請求単価編集（商品/請求単価/適用日）
- 伝票連携マッピング編集（システム項目 ↔ 出力カラムの対応表）
- マスタ由来の参照はすべて Select / SearchableCombobox。**商品編集に「原料ロス率許容値（既定5%、手詰め3%、NTSするめソーメン10g 8%）」を必ず入れる**（スタッフ日報のロス率ガードの根拠）。

---

## 7. ドキュメント更新（Figma追加後）

- `docs/20_design_coverage_matrix.md`:
  - A表/C表で該当行を ✅ / 🟡 に更新（発注=済、シフト=済、割り振り=済、原価=済 は既に反映済み。今回: 月間計画ハブ、印刷ハブ/作業日報印刷/配置印刷、セルフシフト入力、各マスタ編集フォームを追加・対応ルート明記）。
  - E「既知の残タスク」から、作成したものを削除/降格。
- `docs/21_ui_implementation_spec.md`:
  - §2 コンポーネント対応表に新パターン（ステッパ、印刷レイアウト、セルフ入力スマホ、各マスタ編集モーダル）の実装注意を追記。
  - §3/§4 に「未描画ケースの流用ルール」を追記（例: 他マスタ編集は商品編集モーダルの型を流用、印刷物は16/17の型を流用）。
  - **`Badge` の `info` variant（予定用）追加が必要**な点を残す（§2.1）。

## 8. 検証と最終報告

- 各画面作成後に `get_screenshot` で目視確認（潰れ・黒塗り・はみ出し）。修正は `hugAll` ＋ 幅hugの後がけで対応。
- 最後に短く報告する:
  1. 追加した Figma ページ/フレーム一覧（ページ名＋node id）
  2. まだ未カバーの機能（例: 自動生産提案・需要予測・拠点間在庫移動 = 将来Epic7、製品在庫クラウド連携 など）
  3. 実装時に**既存画面を残すべき箇所**（例: `07 予実サマリ（参考）` は分析用に残す、旧 `/daily-reports` はコード残置・非表示、印刷ルートは既存 `prints/*` を踏襲 等）
