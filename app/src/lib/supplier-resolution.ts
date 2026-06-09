// 仕入先列(supplier_name / supplier_code)を Supplier.name の完全一致で解決する。
// 空欄なら supplierId は触らない(undefined)。値があるのに見つからなければ警告を返す
// (タイプミスで仕入先を勝手に新規作成しないため。CLAUDE.md: 曖昧な手入力名称をキーにしない)。
//
// 注意: Next.js の API route ファイルはハンドラ以外を export できないため、CSV取込ルート
// から共有できるようにこの純関数をここ(lib)に切り出している。
export function resolveSupplierId(
  raw: string | undefined,
  supplierByName: Map<string, string>,
): { supplierId?: string | null; warning?: string } {
  const name = (raw ?? "").trim();
  if (name === "") return {};
  const id = supplierByName.get(name);
  if (id) return { supplierId: id };
  return { supplierId: null, warning: `supplier not found: ${name}` };
}
