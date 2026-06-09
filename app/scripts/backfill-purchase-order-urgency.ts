import { PrismaClient } from "@prisma/client";
import { computeUrgency, type PurchaseOrderUrgency } from "../src/lib/purchase-order-urgency";

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.purchaseOrder.findMany();
  const counts: Record<PurchaseOrderUrgency, number> = {
    CRITICAL: 0,
    WARNING: 0,
    INFO: 0,
    NONE: 0,
  };
  const asOfDate = new Date();

  for (const row of rows) {
    const urgency = computeUrgency({
      requiredOrderDate: row.recommendedOrderDate,
      asOfDate,
    });
    await prisma.purchaseOrder.update({
      where: { id: row.id },
      data: { urgency },
    });
    counts[urgency] += 1;
  }

  console.log(
    `Backfilled ${rows.length} purchase orders: CRITICAL=${counts.CRITICAL}, WARNING=${counts.WARNING}, INFO=${counts.INFO}, NONE=${counts.NONE}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
