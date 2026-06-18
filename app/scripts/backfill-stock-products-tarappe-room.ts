/* eslint-disable no-console */

import {
  PrismaClient,
  type Prisma,
  type ProductionCapacity,
  type WorkArea,
} from "@prisma/client";
import { normalizeForSearch } from "../src/lib/search";

const TARAPPE_WORK_AREA_NAME = "たらっぺ部屋";
const AUTO_SCHEDULE_ROLE_STOCK_PRIMARY = "STOCK_PRIMARY";
const REVIEW_MEMO = "在庫商品一覧の作業場所確定により、たらっぺ部屋を第1候補へ補正";

const prisma = new PrismaClient();

type ProductWithRoomData = Prisma.ProductGetPayload<{
  include: {
    aliases: true;
    capacities: { include: { workArea: true } };
    defaultWorkArea: true;
  };
}>;

type TargetRule = {
  label: string;
  matches: (text: string) => boolean;
};

const TARGET_RULES: TargetRule[] = [
  {
    label: "個食美学28gたらっぺ",
    matches: (text) => hasAll(text, ["個食美学", "たらっぺ", "28g"]),
  },
  {
    label: "65g 贅沢焼かま（20入り）",
    matches: (text) => hasAll(text, ["贅沢焼かま", "65g"]) && !hasAny(text, ["ピリ辛", "80g"]),
  },
  {
    label: "NTSするめそーめん10g",
    matches: (text) => hasAll(text, ["nts", "するめそーめん", "10g"]),
  },
  {
    label: "NTS焼めざし14g",
    matches: (text) => hasAll(text, ["nts", "焼めざし", "14g"]),
  },
  {
    label: "こんがり焼きかま 70g 20入り",
    matches: (text) => hasAll(text, ["こんがり焼きかま", "70g"]),
  },
  {
    label: "NS無差別 するめそーめん95g（10x10）",
    matches: (text) => hasAll(text, ["ns", "するめそーめん", "95g"]),
  },
  {
    label: "30g MM焼かまぼこ",
    matches: (text) => hasAll(text, ["30g"]) && hasAny(text, ["焼きかまぼこ", "焼かまぼこ"]) && hasAny(text, ["mm", "ミスターマックス"]),
  },
  {
    label: "するめそーめん 35g",
    matches: (text) => hasAll(text, ["するめそーめん", "35g"]),
  },
  {
    label: "55g ドライ塩とまと夢クリエイト",
    matches: (text) => hasAll(text, ["55g", "ドライ塩とまと", "夢クリエイト"]),
  },
  {
    label: "おくら梅かつお53g KSB",
    matches: (text) => hasAll(text, ["おくら梅かつお", "53g"]) && hasAny(text, ["ksb"]),
  },
  {
    label: "うめ玉",
    matches: (text) => hasAny(text, ["うめ玉"]),
  },
  {
    label: "焼きかま（大黒天物産用）30g（12x15）",
    matches: (text) =>
      hasAll(text, ["30g"]) &&
      hasAny(text, ["大黒天物産", "dprice", "dプライス", "デイプライス"]) &&
      hasAny(text, ["焼きかま", "焼かま"]) &&
      !hasAny(text, ["こんがり", "そーめん", "ソーメン"]),
  },
  {
    label: "NIDピリ辛贅沢焼きかま18g（12x10）",
    matches: (text) => hasAll(text, ["nid", "ピリ辛", "贅沢焼かま", "18g"]),
  },
  {
    label: "40g 素焼きマカダミアナッツ",
    matches: (text) => hasAll(text, ["素焼きマカダミアナッツ", "40g"]),
  },
  {
    label: "個食プラス30g くんさき",
    matches: (text) => hasAll(text, ["個食プラス", "くんさき", "30g"]),
  },
];

type Options = {
  apply: boolean;
};

type ProductPatchPreview = {
  productId: string;
  productCode: string;
  productName: string;
  matchedTargets: string[];
  beforeWorkArea: string | null;
  needsCapacityCopy: boolean;
  hasTemplateCapacity: boolean;
};

type CapacityTemplate = {
  capacity: ProductionCapacity & { workArea: WorkArea };
  sourceProductCode: string;
  sourceProductName: string;
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const tarappe = await findOrCreateTarappeWorkArea(options);
  const products = await prisma.product.findMany({
    where: { active: true },
    include: {
      aliases: true,
      capacities: { include: { workArea: true } },
      defaultWorkArea: true,
    },
    orderBy: { productCode: "asc" },
  });

  const matchedProducts = products
    .map((product) => ({ product, matchedTargets: matchedTargetLabels(product) }))
    .filter((entry) => entry.matchedTargets.length > 0);
  const templateByTargetLabel = buildTemplateByTargetLabel(matchedProducts, tarappe.id);
  const matchedProductIds = new Set(matchedProducts.map((entry) => entry.product.id));
  const missingTargets = TARGET_RULES.filter(
    (rule) => !matchedProducts.some((entry) => entry.matchedTargets.includes(rule.label)),
  ).map((rule) => rule.label);

  const previews = matchedProducts.map(({ product, matchedTargets }) => {
    const tarappeCapacity = product.capacities.find((capacity) => capacity.workAreaId === tarappe.id);
    const templateCapacity = chooseTemplate(product, matchedTargets, tarappe.id, templateByTargetLabel);
    return {
      productId: product.id,
      productCode: product.productCode,
      productName: product.displayName ?? product.officialName,
      matchedTargets,
      beforeWorkArea: product.defaultWorkArea?.name ?? null,
      needsCapacityCopy: !tarappeCapacity && !!templateCapacity,
      hasTemplateCapacity: !!templateCapacity,
    };
  });

  const noCapacityProducts = previews.filter((preview) => !preview.hasTemplateCapacity);
  const alreadyTarappeCount = previews.filter((preview) => preview.beforeWorkArea === tarappe.name).length;

  console.log("=== 在庫商品 作業場所補正 ===");
  console.log(`mode: ${options.apply ? "APPLY" : "dry-run"}`);
  console.log(`target work area: ${tarappe.name}`);
  console.log(`matched products: ${matchedProducts.length}`);
  console.log(`already target work area: ${alreadyTarappeCount}`);
  console.log(`capacity rows to copy: ${previews.filter((preview) => preview.needsCapacityCopy).length}`);
  console.log(`products without any capacity template: ${noCapacityProducts.length}`);
  console.log(`unmatched target labels: ${missingTargets.length}`);
  if (missingTargets.length > 0) {
    for (const label of missingTargets) console.log(`  - ${label}`);
  }
  console.log("\nmatched sample:");
  for (const preview of previews.slice(0, 80)) {
    console.log(
      `  ${preview.productCode}\t${preview.productName}\t${preview.beforeWorkArea ?? "-"} -> ${tarappe.name}\t${preview.matchedTargets.join(" / ")}`,
    );
  }
  if (previews.length > 80) console.log(`  ... (+${previews.length - 80}件)`);
  if (noCapacityProducts.length > 0) {
    console.log("\ncapacity template missing:");
    for (const preview of noCapacityProducts) console.log(`  ${preview.productCode}\t${preview.productName}`);
  }

  if (!options.apply) {
    console.log("\nDry-run only. Re-run with --apply to write to DB.");
    return;
  }

  const result = await applyBackfill({
    tarappe,
    matchedProducts,
    matchedProductIds,
    products,
    templateByTargetLabel,
    missingTargets,
    noCapacityProducts,
  });

  console.log("\nApplied:");
  console.log(result);
}

async function applyBackfill(input: {
  tarappe: WorkArea;
  matchedProducts: { product: ProductWithRoomData; matchedTargets: string[] }[];
  matchedProductIds: Set<string>;
  products: ProductWithRoomData[];
  templateByTargetLabel: Map<string, CapacityTemplate>;
  missingTargets: string[];
  noCapacityProducts: ProductPatchPreview[];
}) {
  const beforeByProductId = new Map(
    input.products
      .filter((product) => input.matchedProductIds.has(product.id))
      .map((product) => [
        product.id,
        {
          defaultWorkAreaId: product.defaultWorkAreaId,
          defaultWorkAreaName: product.defaultWorkArea?.name ?? null,
          productionType: product.productionType,
          capacities: product.capacities.map((capacity) => capacitySnapshot(capacity)),
        },
      ]),
  );

  const updatedArea = await prisma.workArea.update({
    where: { id: input.tarappe.id },
    data: {
      areaType: "internal",
      externalFlag: false,
      active: true,
      autoScheduleRole: AUTO_SCHEDULE_ROLE_STOCK_PRIMARY,
    },
  });

  let productsUpdated = 0;
  let capacitiesCreated = 0;
  let capacitiesUpdated = 0;
  let capacityPrioritiesUpdated = 0;

  for (const { product, matchedTargets } of input.matchedProducts) {
    await prisma.product.update({
      where: { id: product.id },
      data: {
        defaultWorkAreaId: updatedArea.id,
        productionType: "stock",
        usedAtKitagoya: true,
      },
    });
    productsUpdated++;

    const tarappeCapacity = product.capacities.find((capacity) => capacity.workAreaId === updatedArea.id);
    const template = chooseTemplate(product, matchedTargets, updatedArea.id, input.templateByTargetLabel);

    if (tarappeCapacity) {
      await prisma.productionCapacity.update({
        where: { id: tarappeCapacity.id },
        data: {
          active: true,
          candidatePriority: 1,
          reviewStatus: "confirmed",
          reviewMemo: REVIEW_MEMO,
          reviewedAt: new Date(),
        },
      });
      capacitiesUpdated++;
    } else if (template) {
      await prisma.productionCapacity.upsert({
        where: { productId_workAreaId: { productId: product.id, workAreaId: updatedArea.id } },
        update: {
          active: true,
          candidatePriority: 1,
          reviewStatus: "confirmed",
          reviewMemo: REVIEW_MEMO,
          reviewedAt: new Date(),
        },
        create: {
          productId: product.id,
          workAreaId: updatedArea.id,
          unitsPerPersonHour: template.capacity.unitsPerPersonHour,
          standardPeople: template.capacity.standardPeople,
          standardBreakMinutes: template.capacity.standardBreakMinutes,
          candidatePriority: 1,
          note: withRoomCorrectionNote(template.capacity.note, template),
          sourceType: template.capacity.sourceType,
          locked: false,
          active: true,
          validFrom: template.capacity.validFrom,
          validTo: template.capacity.validTo,
          reviewStatus: "confirmed",
          reviewMemo: REVIEW_MEMO,
          reviewedAt: new Date(),
        },
      });
      capacitiesCreated++;
    }

    const otherInternalCapacities = product.capacities
      .filter(
        (capacity) =>
          capacity.workAreaId !== updatedArea.id &&
          capacity.workArea.active &&
          capacity.workArea.areaType === "internal" &&
          !capacity.workArea.externalFlag,
      )
      .sort(compareCapacityPriority);
    for (const [index, capacity] of otherInternalCapacities.entries()) {
      const nextPriority = index + 2;
      if (capacity.candidatePriority !== nextPriority) {
        await prisma.productionCapacity.update({
          where: { id: capacity.id },
          data: { candidatePriority: nextPriority },
        });
        capacityPrioritiesUpdated++;
      }
    }
  }

  await prisma.auditLog.create({
    data: {
      action: "backfill_stock_products_tarappe_room",
      entityType: "Product",
      beforeJson: JSON.stringify([...beforeByProductId.values()]),
      afterJson: JSON.stringify({
        targetWorkArea: updatedArea.name,
        productsUpdated,
        capacitiesCreated,
        capacitiesUpdated,
        capacityPrioritiesUpdated,
        unmatchedTargets: input.missingTargets,
        productsWithoutCapacityTemplate: input.noCapacityProducts.map((product) => ({
          productCode: product.productCode,
          productName: product.productName,
        })),
      }),
    },
  });

  return { productsUpdated, capacitiesCreated, capacitiesUpdated, capacityPrioritiesUpdated };
}

async function findOrCreateTarappeWorkArea(options: Options) {
  const existing = await prisma.workArea.findFirst({ where: { name: TARAPPE_WORK_AREA_NAME } });
  if (existing) return existing;

  const displayOrder = ((await prisma.workArea.aggregate({ _max: { displayOrder: true } }))._max.displayOrder ?? 0) + 1;
  const data = {
    name: TARAPPE_WORK_AREA_NAME,
    areaType: "internal",
    defaultStartTime: "09:00",
    defaultEndTime: "17:00",
    maxPeopleCount: 6,
    displayOrder,
    equipmentKind: "ROOM",
    autoScheduleRole: AUTO_SCHEDULE_ROLE_STOCK_PRIMARY,
    concurrentOperationAllowed: true,
    active: true,
    externalFlag: false,
    note: "在庫商品作業場所として追加",
  };
  if (!options.apply) {
    return {
      id: "dry-run-tarappe-work-area",
      ...data,
      validFrom: null,
      validTo: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } satisfies WorkArea;
  }
  return prisma.workArea.create({ data });
}

function matchedTargetLabels(product: ProductWithRoomData) {
  const text = productText(product);
  return TARGET_RULES.filter((rule) => rule.matches(text)).map((rule) => rule.label);
}

function buildTemplateByTargetLabel(
  matchedProducts: { product: ProductWithRoomData; matchedTargets: string[] }[],
  tarappeWorkAreaId: string,
) {
  const templateByTargetLabel = new Map<string, CapacityTemplate>();
  for (const { product, matchedTargets } of matchedProducts) {
    const capacity = chooseProductCapacityTemplate(product, tarappeWorkAreaId);
    if (!capacity) continue;
    for (const target of matchedTargets) {
      if (templateByTargetLabel.has(target)) continue;
      templateByTargetLabel.set(target, {
        capacity,
        sourceProductCode: product.productCode,
        sourceProductName: product.displayName ?? product.officialName,
      });
    }
  }
  return templateByTargetLabel;
}

function productText(product: ProductWithRoomData) {
  return compact(
    [
      product.productCode,
      product.officialName,
      product.displayName,
      product.brandName,
      product.specification,
      ...product.aliases.map((alias) => alias.aliasName),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function chooseTemplate(
  product: ProductWithRoomData,
  matchedTargets: string[],
  tarappeWorkAreaId: string,
  templateByTargetLabel: Map<string, CapacityTemplate>,
) {
  const productTemplate = chooseProductCapacityTemplate(product, tarappeWorkAreaId);
  if (productTemplate) {
    return {
      capacity: productTemplate,
      sourceProductCode: product.productCode,
      sourceProductName: product.displayName ?? product.officialName,
    };
  }
  for (const target of matchedTargets) {
    const sharedTemplate = templateByTargetLabel.get(target);
    if (sharedTemplate) return sharedTemplate;
  }
  return null;
}

function chooseProductCapacityTemplate(product: ProductWithRoomData, tarappeWorkAreaId: string) {
  const internalCapacities = product.capacities.filter(
    (capacity) => capacity.active && capacity.workArea.active && capacity.workArea.areaType === "internal" && !capacity.workArea.externalFlag,
  );
  return (
    internalCapacities.find((capacity) => capacity.workAreaId === tarappeWorkAreaId) ??
    internalCapacities.find((capacity) => capacity.workAreaId === product.defaultWorkAreaId) ??
    [...internalCapacities].sort(compareCapacityPriority)[0] ??
    null
  );
}

function compareCapacityPriority(
  a: ProductionCapacity & { workArea: WorkArea },
  b: ProductionCapacity & { workArea: WorkArea },
) {
  return (
    priorityKey(a.candidatePriority) - priorityKey(b.candidatePriority) ||
    a.workArea.displayOrder - b.workArea.displayOrder ||
    b.unitsPerPersonHour - a.unitsPerPersonHour ||
    a.workArea.name.localeCompare(b.workArea.name, "ja")
  );
}

function priorityKey(value: number | null | undefined) {
  return value == null ? Number.MAX_SAFE_INTEGER : value;
}

function capacitySnapshot(capacity: ProductionCapacity & { workArea: WorkArea }) {
  return {
    workAreaId: capacity.workAreaId,
    workAreaName: capacity.workArea.name,
    unitsPerPersonHour: capacity.unitsPerPersonHour,
    standardPeople: capacity.standardPeople,
    candidatePriority: capacity.candidatePriority,
    reviewStatus: capacity.reviewStatus,
  };
}

function withRoomCorrectionNote(current: string | null, template: CapacityTemplate) {
  const marker = `たらっぺ部屋候補追加: ${template.sourceProductCode} ${template.sourceProductName} / ${template.capacity.workArea.name}の能力値をコピー`;
  if (current?.includes(marker)) return current;
  return [current, marker].filter(Boolean).join(" / ");
}

function hasAll(text: string, terms: string[]) {
  return terms.every((term) => text.includes(compact(term)));
}

function hasAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(compact(term)));
}

function compact(value: string) {
  return normalizeForSearch(value)
    .replace(/無差別/g, "無選別")
    .replace(/焼きかま/g, "焼かま")
    .replace(/d-price|dプライス|デイプライス|でいぷらいす|でぃぷらいす/g, "dprice")
    .replace(/ミスターマックス|みすたーまっくす|mrmax/g, "mm")
    .replace(/個食美学ぷらす|個食ぷらす/g, "個食プラス")
    .replace(/[\s\u3000/()（）×✖︎✖️✕xX・,，.。\-_]/g, "");
}

function parseArgs(args: string[]): Options {
  return {
    apply: args.includes("--apply"),
  };
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
