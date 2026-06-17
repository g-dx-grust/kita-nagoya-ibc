import { prisma } from "@/lib/prisma";
import InvoiceExportForm from "./invoice-export-form";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const history = await prisma.invoiceExport.findMany({
    orderBy: { exportedAt: "desc" },
    take: 50,
  });

  return (
    <>
      <h1>請求 / 売上伝票CSV出力</h1>
      <InvoiceExportForm />

      <h2>出力履歴</h2>
      {history.length === 0 ? (
        <div className="empty-state">まだ出力履歴はありません。</div>
      ) : (
        <div className="table-frame">
          <table>
            <thead>
              <tr>
                <th>出力日時</th>
                <th>対象期間</th>
                <th>ファイル名</th>
                <th>件数</th>
                <th>金額合計</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td>{h.exportedAt.toISOString().slice(0, 19).replace("T", " ")}</td>
                  <td>
                    {h.periodStart.toISOString().slice(0, 10)} 〜{" "}
                    {h.periodEnd.toISOString().slice(0, 10)}
                  </td>
                  <td>{h.fileName}</td>
                  <td className="right">{h.rowCount}</td>
                  <td className="right">¥{h.totalAmount.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
