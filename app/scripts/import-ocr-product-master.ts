/**
 * OCR化した商品マスタ(docs/product_master_structured.json)を既存商品へ登録する。
 * - 入り数 H(g)→packSizeG, CS(ケース)→casePackQty を設定(信頼できる値のみ、数値>0のとき)。
 * - 原料/袋/段ボール/トレー/乾燥剤/売価 は構造化メモ(note)として商品に登録。
 *   ※OCRは原料に資材が混入する等の誤分類があり、かつ1個あたり数量が無いため、
 *     原料/資材マスタやBOMの自動生成はしない(誤データ・数量捏造を避ける)。後で編集画面で正式化する。
 *
 *   ドライラン: npx tsx scripts/import-ocr-product-master.ts
 *   反映      : npx tsx scripts/import-ocr-product-master.ts apply
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { normalizeForSearch } from "../src/lib/search";

type Entry = {
  商品名?: string;
  入り数?: { H?: number | null; T?: number | null; CS?: number | null; B?: number | null };
  原料?: { 明細?: { 名称?: string | null; 単価?: number | null }[] };
  資材?: {
    袋?: { 名称?: string | null; コード?: unknown; 単価?: number | null };
    段ボール?: { コード?: unknown; 規格?: string | null; 単価?: number | null };
    トレー?: { コード?: unknown; 単価?: number | null };
    乾燥剤?: { 名称?: string | null; 単価?: number | null };
  };
  単価?: { 資材合計?: number | null; 売価?: number | null };
};

const noSpace = (s: string | null | undefined) => normalizeForSearch(s).replace(/ /g, "");
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
const str = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s && s !== "0" ? s : null;
};

function buildNote(e: Entry): string {
  const ir = e.入り数 ?? {};
  const irParts = (["H", "T", "CS", "B"] as const).map((k) => `${k}=${ir[k] ?? "-"}`).join("/");
  const raws = (e.原料?.明細 ?? []).map((m) => str(m.名称)).filter(Boolean);
  const z = e.資材 ?? {};
  const lines = [
    `【OCR取込 商品マスタ】`,
    `入り数: ${irParts}`,
    raws.length ? `原料: ${raws.join(" / ")}` : null,
    str(z.袋?.名称) ? `袋: ${str(z.袋?.名称)}` : null,
    str(z.段ボール?.コード) ? `段ボール: ${str(z.段ボール?.コード)}${z.段ボール?.規格 ? `(${z.段ボール?.規格})` : ""}` : null,
    str(z.トレー?.コード) ? `トレー: ${str(z.トレー?.コード)}` : null,
    str(z.乾燥剤?.名称) ? `乾燥剤: ${str(z.乾燥剤?.名称)}` : null,
    num(e.単価?.売価) ? `売価: ${e.単価?.売価}` : null,
    `※原料/資材の正式なBOM(数量)は編集画面で登録してください(OCRは数量・分類が不確実)。`,
  ].filter(Boolean);
  return lines.join("\n");
}

async function main() {
  const apply = process.argv.includes("apply");
  const prisma = new PrismaClient();
  try {
    const json = readFileSync(path.join(process.cwd(), "..", "docs", "product_master_structured.json"), "utf8");
    const entries: Entry[] = JSON.parse(json);

    const products = await prisma.product.findMany({
      select: { id: true, productCode: true, officialName: true, note: true },
    });
    const byKey = new Map<string, (typeof products)[number]>();
    for (const p of products) {
      const k = noSpace(p.officialName);
      if (k && !byKey.has(k)) byKey.set(k, p);
    }

    const matched: { entry: Entry; product: (typeof products)[number]; packSizeG: number | null; casePackQty: number | null }[] = [];
    const unmatched: string[] = [];
    for (const e of entries) {
      const name = e.商品名 ?? "";
      const key = noSpace(name);
      let prod = byKey.get(key);
      if (!prod && key.length >= 4) {
        // フォールバック: 正式名称が一致しなければ包含で探す
        prod = products.find((p) => {
          const pk = noSpace(p.officialName);
          return pk.length >= 4 && (pk.includes(key) || key.includes(pk));
        });
      }
      if (prod) {
        matched.push({ entry: e, product: prod, packSizeG: num(e.入り数?.H), casePackQty: num(e.入り数?.CS) });
      } else {
        unmatched.push(name);
      }
    }

    console.log(`JSON商品: ${entries.length} / DB商品: ${products.length}`);
    console.log(`★ マッチ: ${matched.length} / 未マッチ: ${unmatched.length}`);
    console.log("");
    console.log("=== マッチした商品(設定する 入り数g/ケース入数) ===");
    for (const m of matched) {
      console.log(`  ${m.product.productCode}\t${m.product.officialName}  → g=${m.packSizeG ?? "-"} / case=${m.casePackQty ?? "-"}`);
    }
    console.log("");
    console.log(`=== 未マッチのJSON商品名 (${unmatched.length}) ===`);
    for (const n of unmatched) console.log(`  ✗ ${n}`);
    console.log("");
    console.log("=== noteに登録する内容のサンプル(先頭1件) ===");
    if (matched[0]) console.log(buildNote(matched[0].entry));

    if (apply) {
      let n = 0;
      for (const m of matched) {
        const data: { packSizeG?: number; casePackQty?: number; note: string } = { note: buildNote(m.entry) };
        if (m.packSizeG != null) data.packSizeG = m.packSizeG;
        if (m.casePackQty != null) data.casePackQty = m.casePackQty;
        await prisma.product.update({ where: { id: m.product.id }, data });
        n++;
      }
      console.log("");
      console.log(`APPLIED: ${n} 商品を更新(入り数 + 構造化メモ)。`);
    } else {
      console.log("");
      console.log("(ドライラン。反映: npx tsx scripts/import-ocr-product-master.ts apply)");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
