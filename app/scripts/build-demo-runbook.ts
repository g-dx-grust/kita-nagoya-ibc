/**
 * デモ手順書(PDF)生成スクリプト。
 * アプリ同梱の pdf-lib + NotoSansJP フォントで、日本語のデモ用手順書を生成する。
 *   実行: npx tsx scripts/build-demo-runbook.ts
 *   出力: ../docs/demo_runbook.pdf
 * 内容を変えたい場合はこのファイルの SECTIONS / FLOW を編集して再実行する。
 */
import { PDFDocument, PDFFont, PDFPage, rgb, RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const OUT = path.join(APP, "..", "docs", "demo_runbook.pdf");

const A4 = { w: 595.28, h: 841.89 };
const M = { top: 56, bottom: 54, left: 54, right: 54 };
const CONTENT_W = A4.w - M.left - M.right;

const COL = {
  navy: rgb(0.11, 0.22, 0.40),
  navySoft: rgb(0.20, 0.34, 0.55),
  ink: rgb(0.15, 0.17, 0.20),
  sub: rgb(0.40, 0.43, 0.48),
  line: rgb(0.80, 0.83, 0.88),
  band: rgb(0.93, 0.95, 0.99),
  calloutBg: rgb(0.95, 0.98, 0.93),
  calloutBar: rgb(0.30, 0.62, 0.32),
  chip: rgb(0.88, 0.92, 0.98),
  white: rgb(1, 1, 1),
};

type Ctx = {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  reg: PDFFont;
  bold: PDFFont;
  pageNo: number;
};

// ---- 内容定義 -------------------------------------------------------------

const FLOW: { n: string; title: string; sub: string }[] = [
  { n: "①", title: "過去実績から月間生産予測", sub: "前年同月 × 前々月前年比で当月の作る量を算出" },
  { n: "②", title: "シフト取込 → 月間生産スケジュール(仮)", sub: "前月15日のシフトと予測から、誰が・いつ・何個の予定を生成" },
  { n: "③", title: "当日：3部屋へ割り当て・作業表を印刷", sub: "誰がどの部屋で何を→完了後どこへ移動するかを紙に出力" },
  { n: "④", title: "日報入力 → 実在庫へ反映", sub: "実績数量・使用量を入力し確定。実在庫と実原価に反映" },
  { n: "⑤", title: "予実差 → 月間スケジュールへ反映", sub: "当月の予実・過不足を表示し、残目標を再計算" },
  { n: "⑥", title: "原料不足アラート・発注期限", sub: "安全在庫割れ前に「いつまでに発注」を通知" },
  { n: "⑦", title: "発注書の作成", sub: "発注候補→発注→日本語の発注書(PDF/Excel)を出力" },
];

type Section = {
  no: string;
  title: string;
  screen: string;
  ops: string[];
  highlight: string[];
  link: string;
};

const SECTIONS: Section[] = [
  {
    no: "①",
    title: "過去実績から月間生産予測をつくる",
    screen: "月間生産計画  /production-plans/monthly （または /product-planning）",
    ops: [
      "対象月（例：2026-06）を選ぶ。",
      "商品ごとに「予測生産数」と、その根拠（前々月前年比・前月前年比）が表として表示される。",
    ],
    highlight: [
      "計算式は「前年当月の実績 × 前々月前年比（今年前々月 ÷ 前年前々月）」。前月確定を待たず原料の発注リードタイムに間に合わせるため、前々月を基準にしている点を説明する。",
      "月次実績のある商品は数値が出る。実績未登録の商品は「データ不足」と明示される（誤った予測を出さない）。",
    ],
    link: "→ ここで出た予測生産数が、②の月間スケジュールの数量の元になる。",
  },
  {
    no: "②",
    title: "シフトを取り込み、月間生産スケジュール（仮）を生成する",
    screen: "シフト /shifts ＋ 月間生産計画 /production-plans/monthly",
    ops: [
      "前月15日に出るシフト表を、シフト画面の「CSV取込」から取り込む（または画面のグリッドで入力）。",
      "月間生産計画の画面で期間を指定し、「シフト連動で仮予定生成」を押す。",
      "予測数量とシフトの作業能力から、draft（下書き）の生産予定が日付・部屋・人数つきで自動生成される。",
    ],
    highlight: [
      "取り込みは既存の従業員（正式名称）にのみ紐付け、未知の名前はスキップして警告（社員マスタを壊さない）。",
      "同じ画面に「当月 予実・過不足」表（目標／実績累計／未完了予定／残目標／過不足）が出る。",
    ],
    link: "→ 生成された生産予定が、③の当日割り当ての対象になる。",
  },
  {
    no: "③",
    title: "当日：3部屋へ割り当て、作業表を印刷する",
    screen: "当日割り当て /production-plans/allocate ＋ 印刷 /prints/staff-assignments・/prints/production-schedule",
    ops: [
      "日付を選び、自動割り当て→必要なら手修正→保存。",
      "「部屋レーン×時間」と「人×時間」の2ビューで、誰がどの部屋で何時から何を作るかを確認。",
      "印刷ページから作業表を出力（部屋ごとに改ページ）。",
    ],
    highlight: [
      "作業場所はマスター管理で、3部屋に固定せず追加・変更できる（一般部屋／機械部屋／たらっぺ部屋など）。",
      "作業表の「移動」列に、完了後に次へ移る部屋が「部屋A → 部屋B」と表示される。",
      "遊休（手待ち）を最小化するよう人を時間帯ごとに配分する。",
    ],
    link: "→ この予定どおり現場で作業し、結果を④の日報に入力する。",
  },
  {
    no: "④",
    title: "日報を入力し、実在庫へ反映する",
    screen: "生産予定詳細の日報フォーム /production-plans/[id] ＋ 日報一覧 /daily-reports",
    ops: [
      "実人数・実時間・実数量・実際に使った原料/資材量を入力 → 下書き保存。",
      "内容を確認して「確定」する。",
    ],
    highlight: [
      "確定すると、実績の在庫トランザクション（確定在庫）が記録され、生産予定は「完了」になる。",
      "予定在庫は台帳に残るが、理論在庫は二重計上されない（実績のみで算出）。",
      "実原価（実数量×単価＋実使用原料/資材）が再計算され、予定原価とは別に保存される。",
    ],
    link: "→ 確定した実績が、⑤の月間予実と、当月の実績集計に自動反映される。",
  },
  {
    no: "⑤",
    title: "予実差を月間スケジュールへ反映する",
    screen: "月間生産計画 /production-plans/monthly（再表示）",
    ops: [
      "日報確定後に月間画面を開くと、「当月 予実・過不足」表が更新されている。",
      "残目標（予測 − 実績累計 − 未完了予定）に基づき、追加で作る量の提案が更新される。",
    ],
    highlight: [
      "確定実績は当月の実績(ProductMonthlyActual)へ自動集計される（手入力した値は上書きしない）。",
      "完了した予定を二重に作り直さない。最終的な追加・調整はユーザーの判断（ボタン操作）に委ねる。",
    ],
    link: "→ 不足が見えたら、⑥の原料発注へ進む。",
  },
  {
    no: "⑥",
    title: "原料不足アラートと発注期限を出す",
    screen: "在庫 /inventory ＋ 発注 /purchases ＋ ホーム /",
    ops: [
      "在庫画面で、不足・マイナス・未確定入荷を判別。",
      "発注画面で期間を指定し「発注候補を生成」。",
    ],
    highlight: [
      "在庫ゼロ割れの前（安全在庫を下回る前）に早期警告を出す。",
      "各候補に「推奨発注日（不足日 − リードタイム）」と緊急度が付く（緊急度は表示時に再計算され古くならない）。",
      "発注推奨数量は発注ロット／最小発注数で切り上げる。ホームにも「発注期限アラート」を表示。",
    ],
    link: "→ 発注すべき候補が決まったら、⑦の発注書作成へ。",
  },
  {
    no: "⑦",
    title: "発注書を作成する",
    screen: "発注 /purchases",
    ops: [
      "候補行の「発注する」を押す（候補 → 発注済(未確定)へ）。",
      "「発注書ダウンロード（PDF / Excel）」を押す。",
      "入荷したら発注を「受領」にする → 確定入荷として在庫へ反映。",
    ],
    highlight: [
      "発注書PDFは日本語で出力される（仕入先名・品目名・項目名すべて）。ケース数も併記。",
      "仕入先はマスター管理（/masters/suppliers）。原料/資材に紐付けてあれば、発注書の仕入先が実名で出る。",
    ],
    link: "→ ①〜⑦が一連の作業として最後までつながる。",
  },
];

// ---- レイアウト・ヘルパ ----------------------------------------------------

function wrap(font: PDFFont, size: number, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const rawLine of text.split("\n")) {
    if (rawLine === "") {
      out.push("");
      continue;
    }
    let cur = "";
    for (const ch of rawLine) {
      const test = cur + ch;
      if (font.widthOfTextAtSize(test, size) > maxW && cur !== "") {
        out.push(cur);
        cur = ch;
      } else {
        cur = test;
      }
    }
    if (cur !== "") out.push(cur);
  }
  return out;
}

function newPage(ctx: Ctx) {
  ctx.page = ctx.doc.addPage([A4.w, A4.h]);
  ctx.pageNo += 1;
  ctx.y = A4.h - M.top;
  // footer
  const f = `北名古屋 製造システム デモ手順書`;
  ctx.page.drawText(f, { x: M.left, y: M.bottom - 22, size: 8, font: ctx.reg, color: COL.sub });
  const pn = `${ctx.pageNo}`;
  ctx.page.drawText(pn, {
    x: A4.w - M.right - ctx.reg.widthOfTextAtSize(pn, 8),
    y: M.bottom - 22,
    size: 8,
    font: ctx.reg,
    color: COL.sub,
  });
  ctx.page.drawLine({
    start: { x: M.left, y: M.bottom - 10 },
    end: { x: A4.w - M.right, y: M.bottom - 10 },
    thickness: 0.5,
    color: COL.line,
  });
}

function ensure(ctx: Ctx, need: number) {
  if (ctx.y - need < M.bottom) newPage(ctx);
}

function lines(
  ctx: Ctx,
  text: string,
  opts: { font?: PDFFont; size?: number; color?: RGB; indent?: number; lh?: number; maxW?: number } = {},
) {
  const font = opts.font ?? ctx.reg;
  const size = opts.size ?? 10.5;
  const color = opts.color ?? COL.ink;
  const indent = opts.indent ?? 0;
  const lh = opts.lh ?? size * 1.55;
  const maxW = opts.maxW ?? CONTENT_W - indent;
  for (const ln of wrap(font, size, text, maxW)) {
    ensure(ctx, lh);
    if (ln !== "") ctx.page.drawText(ln, { x: M.left + indent, y: ctx.y - size, size, font, color });
    ctx.y -= lh;
  }
}

function gap(ctx: Ctx, h: number) {
  ctx.y -= h;
}

// ---- 描画パーツ ------------------------------------------------------------

function coverPage(ctx: Ctx) {
  ctx.page = ctx.doc.addPage([A4.w, A4.h]);
  ctx.pageNo = 1;
  const p = ctx.page;
  // top band
  p.drawRectangle({ x: 0, y: A4.h - 230, width: A4.w, height: 230, color: COL.navy });
  p.drawText("DEMO", { x: M.left, y: A4.h - 96, size: 13, font: ctx.bold, color: rgb(0.62, 0.74, 0.92) });
  const t1 = "北名古屋 製造計画・在庫連動・日報・請求システム";
  for (const [i, ln] of wrap(ctx.bold, 22, t1, A4.w - M.left * 2).entries()) {
    p.drawText(ln, { x: M.left, y: A4.h - 130 - i * 30, size: 22, font: ctx.bold, color: COL.white });
  }
  p.drawText("デモ手順書 ― 7ステップを一連の流れで見せる", {
    x: M.left,
    y: A4.h - 200,
    size: 13,
    font: ctx.reg,
    color: rgb(0.85, 0.89, 0.96),
  });

  ctx.y = A4.h - 280;
  lines(ctx, "本書は、過去の発注実績から月間予測を立て、シフトに連動した生産スケジュールを組み、当日の3部屋への割り当てと作業表印刷、日報による実績入力と実在庫反映、予実差の月間反映、原料不足アラート、発注書作成までを、一連の作業として実演するための手順書です。", {
    size: 11,
    lh: 18,
  });
  gap(ctx, 8);
  lines(ctx, "対象システム: Next.js + Prisma（北名古屋拠点・製造/在庫/日報/発注）", { size: 10, color: COL.sub, lh: 16 });
  lines(ctx, "想定の対象月: 2026年6月（デモデータに当月シフト・確定予定を用意済み）", { size: 10, color: COL.sub, lh: 16 });

  // flow box on cover
  gap(ctx, 16);
  chip(ctx, "このデモで見せる一連の流れ");
  gap(ctx, 6);
  for (const f of FLOW) {
    lines(ctx, `${f.n} ${f.title}`, { font: ctx.bold, size: 10.5, color: COL.navySoft, lh: 15 });
    lines(ctx, f.sub, { size: 9.5, color: COL.sub, indent: 16, lh: 14 });
    gap(ctx, 2);
  }
}

function chip(ctx: Ctx, text: string) {
  const size = 11;
  const w = ctx.bold.widthOfTextAtSize(text, size) + 18;
  ensure(ctx, 24);
  ctx.page.drawRectangle({ x: M.left, y: ctx.y - 17, width: w, height: 21, color: COL.chip });
  ctx.page.drawText(text, { x: M.left + 9, y: ctx.y - 12, size, font: ctx.bold, color: COL.navy });
  ctx.y -= 28;
}

function flowDiagramPage(ctx: Ctx) {
  newPage(ctx);
  sectionBand(ctx, "", "全体フロー ― ①〜⑦が一本の作業としてつながる");
  gap(ctx, 6);
  const boxH = 56;
  const boxW = CONTENT_W;
  for (const [i, f] of FLOW.entries()) {
    ensure(ctx, boxH + 18);
    const top = ctx.y;
    ctx.page.drawRectangle({
      x: M.left,
      y: top - boxH,
      width: boxW,
      height: boxH,
      color: COL.band,
      borderColor: COL.line,
      borderWidth: 1,
    });
    // number badge
    ctx.page.drawText(f.n, { x: M.left + 12, y: top - 36, size: 22, font: ctx.bold, color: COL.navySoft });
    ctx.page.drawText(f.title, { x: M.left + 54, y: top - 24, size: 12, font: ctx.bold, color: COL.navy });
    for (const [j, ln] of wrap(ctx.reg, 9.5, f.sub, boxW - 70).entries()) {
      ctx.page.drawText(ln, { x: M.left + 54, y: top - 40 - j * 12, size: 9.5, font: ctx.reg, color: COL.sub });
    }
    ctx.y = top - boxH;
    if (i < FLOW.length - 1) {
      // down arrow
      const cx = M.left + 26;
      ctx.page.drawLine({ start: { x: cx, y: ctx.y }, end: { x: cx, y: ctx.y - 14 }, thickness: 1.4, color: COL.navySoft });
      ctx.page.drawLine({ start: { x: cx - 4, y: ctx.y - 9 }, end: { x: cx, y: ctx.y - 14 }, thickness: 1.4, color: COL.navySoft });
      ctx.page.drawLine({ start: { x: cx + 4, y: ctx.y - 9 }, end: { x: cx, y: ctx.y - 14 }, thickness: 1.4, color: COL.navySoft });
      ctx.y -= 18;
    }
  }
}

function sectionBand(ctx: Ctx, no: string, title: string) {
  ensure(ctx, 40);
  const h = 30;
  ctx.page.drawRectangle({ x: M.left, y: ctx.y - h, width: CONTENT_W, height: h, color: COL.navy });
  let tx = M.left + 12;
  if (no !== "") {
    ctx.page.drawText(no, { x: M.left + 12, y: ctx.y - 21, size: 15, font: ctx.bold, color: COL.white });
    tx = M.left + 12 + ctx.bold.widthOfTextAtSize(no, 15) + 10;
  }
  ctx.page.drawText(title, { x: tx, y: ctx.y - 20, size: 13, font: ctx.bold, color: COL.white });
  ctx.y -= h + 12;
}

function labelLine(ctx: Ctx, label: string, value: string) {
  ensure(ctx, 16);
  ctx.page.drawText(label, { x: M.left, y: ctx.y - 10, size: 9.5, font: ctx.bold, color: COL.navySoft });
  const lx = M.left + 64;
  for (const [i, ln] of wrap(ctx.reg, 9.5, value, CONTENT_W - 64).entries()) {
    ensure(ctx, 14);
    ctx.page.drawText(ln, { x: lx, y: ctx.y - 10, size: 9.5, font: ctx.reg, color: COL.ink });
    ctx.y -= 14;
  }
  ctx.y -= 4;
}

function numbered(ctx: Ctx, items: string[]) {
  items.forEach((it, i) => {
    const head = `${i + 1}. `;
    const headW = ctx.bold.widthOfTextAtSize(head, 10.5);
    ensure(ctx, 16);
    ctx.page.drawText(head, { x: M.left + 6, y: ctx.y - 10.5, size: 10.5, font: ctx.bold, color: COL.navySoft });
    const wrapped = wrap(ctx.reg, 10.5, it, CONTENT_W - 6 - headW);
    wrapped.forEach((ln, j) => {
      ensure(ctx, 16);
      ctx.page.drawText(ln, { x: M.left + 6 + headW, y: ctx.y - 10.5, size: 10.5, font: ctx.reg, color: COL.ink });
      ctx.y -= 16;
    });
    ctx.y -= 2;
  });
}

function callout(ctx: Ctx, title: string, items: string[]) {
  const size = 10;
  const pad = 9;
  const innerW = CONTENT_W - pad * 2 - 6;
  // pre-measure height
  let h = 16 + 4;
  for (const it of items) h += wrap(ctx.reg, size, "・" + it, innerW).length * 14 + 2;
  h += pad;
  ensure(ctx, h + 8);
  const top = ctx.y;
  ctx.page.drawRectangle({ x: M.left, y: top - h, width: CONTENT_W, height: h, color: COL.calloutBg });
  ctx.page.drawRectangle({ x: M.left, y: top - h, width: 4, height: h, color: COL.calloutBar });
  ctx.page.drawText(title, { x: M.left + pad + 4, y: top - 15, size: 10.5, font: ctx.bold, color: rgb(0.18, 0.42, 0.2) });
  let yy = top - 15 - 16;
  for (const it of items) {
    for (const [j, ln] of wrap(ctx.reg, size, "・" + it, innerW).entries()) {
      ctx.page.drawText(j === 0 ? ln : "  " + ln.replace(/^・/, ""), {
        x: M.left + pad + 4,
        y: yy,
        size,
        font: ctx.reg,
        color: COL.ink,
      });
      yy -= 14;
    }
    yy -= 2;
  }
  ctx.y = top - h - 12;
}

function sectionPage(ctx: Ctx, s: Section) {
  newPage(ctx);
  sectionBand(ctx, s.no, s.title);
  labelLine(ctx, "画面", s.screen);
  gap(ctx, 2);
  chip(ctx, "操作手順");
  numbered(ctx, s.ops);
  gap(ctx, 4);
  callout(ctx, "デモでの見せどころ", s.highlight);
  lines(ctx, s.link, { font: ctx.bold, size: 10, color: COL.navySoft, lh: 15 });
}

function setupPage(ctx: Ctx) {
  newPage(ctx);
  sectionBand(ctx, "準備", "デモ開始前の準備と注意");
  chip(ctx, "起動");
  lines(ctx, "cd app && npm install && npx prisma generate && npx prisma db push && npm run dev", {
    font: ctx.reg,
    size: 9.5,
    color: COL.ink,
    lh: 15,
  });
  lines(ctx, "ブラウザで http://localhost:3000 を開く（別プロセスが3000を使用中なら表示されたポートを使う）。", { size: 10, lh: 15 });
  gap(ctx, 6);
  chip(ctx, "デモデータの考え方");
  callout(ctx, "見せるためのデータ準備", [
    "実マスタ（多数の商品）が入っている環境では、月間予測は「月次実績(ProductMonthlyActual)」のある商品で、原料不足・発注は「BOM(レシピ)」のある商品で数値が出る。デモ前にこの2つを見せたい商品へ用意しておくと全ステップが映える。",
    "クリーン環境で一気に見せたい場合は、少数サンプルのデモ一式を作る SEED_FORCE_SAMPLE_RESET=1 npm run db:seed を使う。ただし既存データを全削除するため、本番/実データ環境では実行しないこと。",
    "シフトは対象月の分が必要（デモデータは2026-06上旬を用意済み）。実運用ではシフトCSV取込または画面入力で投入する。",
  ]);
  gap(ctx, 4);
  chip(ctx, "現時点で未対応（将来対応・デモでは触れない）");
  lines(ctx, "ログイン/利用者ID（監査ログの「誰が」）、請求/売上CSVの請求先・摘要・二重出力防止、規格違い商品の合算予測、営業予測専用入力。詳細は docs/HANDOFF_2026-06-02.md。", {
    size: 9.5,
    color: COL.sub,
    lh: 14,
  });
  gap(ctx, 8);
  chip(ctx, "品質確認状況（このデモ時点）");
  callout(ctx, "検証済み", [
    "型チェック クリーン / テスト 272件 全通過 / 本番ビルド 成功。",
    "7段階を一連で駆動する統合テスト（test/integration/e2e_full_flow.test.ts）が green。",
    "発注書PDFの日本語フォント埋め込みを実機レンダリングで確認（Type0/CIDFontType2, NotoSansJP）。",
    "実データ（279商品）でも全画面が表示され、当日割り当て・日報確定・発注書PDF生成まで実APIで一周することを確認（検証後にデータは復元）。",
  ]);
}

// ---- メイン ----------------------------------------------------------------

async function main() {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  // subset:false で埋め込む。subset:true は本フォント(NotoSansJP)で一部グリフが
  // 欠落する不具合があるため、確実性を優先してフルサブセットなしで埋め込む。
  const reg = await doc.embedFont(fs.readFileSync(path.join(APP, "src/assets/fonts/NotoSansJP-Regular.ttf")), {
    subset: false,
  });
  const bold = await doc.embedFont(fs.readFileSync(path.join(APP, "src/assets/fonts/NotoSansJP-Bold.ttf")), {
    subset: false,
  });
  const ctx: Ctx = { doc, page: null as unknown as PDFPage, y: 0, reg, bold, pageNo: 0 };

  coverPage(ctx);
  flowDiagramPage(ctx);
  for (const s of SECTIONS) sectionPage(ctx, s);
  setupPage(ctx);

  doc.setTitle("北名古屋 製造システム デモ手順書");
  doc.setSubject("7ステップ業務フローのデモ手順");
  const bytes = await doc.save();
  fs.writeFileSync(OUT, bytes);
  // eslint-disable-next-line no-console
  console.log(`Wrote ${OUT} (${bytes.length} bytes, ${ctx.pageNo} pages)`);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
