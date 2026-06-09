import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { planStatusClass, planStatusLabel } from "@/lib/labels";
import { kitagoyaPath } from "@/lib/paths";
import { computeUrgency } from "@/lib/purchase-order-urgency";
import { formatCases } from "@/lib/units";
import { MenuCard } from "@/components/ui/menu-card";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const shortageCount = await prisma.productionPlanRequirement.count({
    where: { shortageType: { in: ["hard_shortage", "unconfirmed_dependency", "below_safety"] } },
  });

  // 「いつまでに発注しなければならないか」をダッシュボードに出す。
  // 未発注(候補/仮発注)で推奨発注日を持つものを取り、緊急度を「今日」基準で再計算し、
  // 期限間近(CRITICAL=発注期限が明日以内/超過)のものだけを並べる。
  const now = new Date();
  const pendingOrders = await prisma.purchaseOrder.findMany({
    where: {
      status: { in: ["candidate", "draft", "ordered_unconfirmed"] },
      recommendedOrderDate: { not: null },
    },
    orderBy: [{ recommendedOrderDate: "asc" }],
  });
  const [materialList, packagingList] = await Promise.all([
    prisma.material.findMany(),
    prisma.packagingMaterial.findMany(),
  ]);
  const orderItemMap = new Map<
    string,
    { code: string; name: string; unit: string; casePackQty: number | null }
  >();
  for (const m of materialList) {
    orderItemMap.set(`raw_material:${m.id}`, {
      code: m.materialCode,
      name: m.name,
      unit: m.unit,
      casePackQty: null, // 原料(kg)はケース換算しない
    });
  }
  for (const m of packagingList) {
    orderItemMap.set(`packaging:${m.id}`, {
      code: m.materialCode,
      name: m.name,
      unit: m.unit,
      casePackQty: m.casePackQty ?? null,
    });
  }
  const orderByAlerts = pendingOrders
    .map((po) => {
      const item = orderItemMap.get(`${po.itemType}:${po.itemId}`);
      return {
        id: po.id,
        itemType: po.itemType,
        itemName: item?.name ?? po.itemId,
        unit: item?.unit ?? "",
        casePackQty: item?.casePackQty ?? null,
        orderedQuantity: po.orderedQuantity,
        recommendedOrderDate: po.recommendedOrderDate?.toISOString().slice(0, 10) ?? "",
        urgency: computeUrgency({ requiredOrderDate: po.recommendedOrderDate, asOfDate: now }),
      };
    })
    .filter((alert) => alert.urgency === "CRITICAL");

  const upcoming = await prisma.productionPlan.findMany({
    where: { status: { in: ["draft", "confirmed"] } },
    orderBy: [{ date: "asc" }, { plannedStartTime: "asc" }],
    take: 8,
    include: { product: true, workArea: true },
  });

  return (
    <>
      <h1>ホーム</h1>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MenuCard
          title="生産予定"
          buttonText="生産予定へ"
          href={kitagoyaPath("/production-plans")}
          helpText="日別の生産予定を検索・登録します"
        />
        <MenuCard
          title="製品計画"
          buttonText="製品計画へ"
          href={kitagoyaPath("/product-planning")}
          helpText="製品在庫と需要から生産候補を確認します"
        />
        <MenuCard
          title="当日割り当て"
          buttonText="当日割り当てへ"
          href={kitagoyaPath("/production-plans/allocate")}
          helpText="出勤シフトから部屋・人員を割り当てます"
        />
        <MenuCard
          title="日報"
          buttonText="日報へ"
          href={kitagoyaPath("/production-daily-reports")}
          helpText="現場の実績を入力・確定し在庫へ反映します"
        />
        <MenuCard
          title="商品マスター"
          buttonText="商品マスターへ"
          href={kitagoyaPath("/masters/products")}
          helpText="商品・ケース入数・BOM・生産能力を管理します"
        />
        <MenuCard
          title="在庫確認"
          buttonText="在庫確認へ"
          href={kitagoyaPath("/inventory")}
          helpText="原料・資材・製品の在庫見込みを確認します"
        />
        <MenuCard
          title="発注候補"
          buttonText="発注候補へ"
          href={kitagoyaPath("/purchases")}
          helpText="不足見込みから発注候補を作成します"
        />
        <MenuCard
          title="請求出力"
          buttonText="請求出力へ"
          href={kitagoyaPath("/invoices")}
          helpText="生産実績から売上・請求CSVを出力します"
        />
      </div>

      {shortageCount > 0 ? (
        <div className="alert warn">
          現在 {shortageCount} 件の不足アラートがあります。{" "}
          <Link href={kitagoyaPath("/production-plans")}>生産予定</Link> から内容を確認してください。
        </div>
      ) : (
        <div className="alert success">現時点で不足アラートはありません。</div>
      )}

      <h2>発注期限アラート</h2>
      {orderByAlerts.length === 0 ? (
        <div className="alert success">発注期限が迫っている品目はありません。</div>
      ) : (
        <>
          <div className="alert danger">
            発注期限が迫っている(または超過した)品目が {orderByAlerts.length} 件あります。{" "}
            <Link href={kitagoyaPath("/purchases")}>発注候補</Link> から発注してください。
          </div>
          <table>
            <thead>
              <tr>
                <th>区分</th>
                <th>品目</th>
                <th>発注数量</th>
                <th>発注期限</th>
              </tr>
            </thead>
            <tbody>
              {orderByAlerts.map((alert) => (
                <tr key={alert.id}>
                  <td>{alert.itemType === "raw_material" ? "原料" : "資材"}</td>
                  <td>{alert.itemName}</td>
                  <td className="right">
                    {formatCases(alert.orderedQuantity, {
                      casePackQty: alert.casePackQty,
                      baseUnit: alert.unit,
                    })}
                  </td>
                  <td>
                    {alert.recommendedOrderDate || "—"}{" "}
                    <span className="badge danger">緊急</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h2>直近の生産予定</h2>
      {upcoming.length === 0 ? (
        <div className="empty-state">
          まだ生産予定が登録されていません。<Link href={kitagoyaPath("/production-plans/new")}>新規登録</Link>
          から開始してください。
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>日付</th>
              <th>商品</th>
              <th>作業場所</th>
              <th>数量</th>
              <th>開始</th>
              <th>終了</th>
              <th>状態</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {upcoming.map((p) => (
              <tr key={p.id}>
                <td>{p.date.toISOString().slice(0, 10)}</td>
                <td>{p.product.officialName}</td>
                <td>{p.workArea.name}</td>
                <td className="right">
                  {formatCases(p.plannedQuantity, { casePackQty: p.product.casePackQty, baseUnit: p.unit })}
                </td>
                <td>{p.plannedStartTime}</td>
                <td>
                  {p.plannedEndTime ?? "—"}
                  {p.overtimeMinutes > 0 && <span className="badge warn"> 残{p.overtimeMinutes}分</span>}
                </td>
                <td>
                  <span className={`badge ${planStatusClass(p.status)}`}>
                    {planStatusLabel(p.status)}
                  </span>
                </td>
                <td>
                  <Link href={kitagoyaPath(`/production-plans/${p.id}`)}>開く</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
