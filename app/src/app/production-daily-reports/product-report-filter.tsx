"use client";

import { useState } from "react";
import ProductCombobox, { type ProductComboOption } from "@/components/ui/product-combobox";

export default function ProductReportFilter({
  products,
  initialProductId,
}: {
  products: ProductComboOption[];
  initialProductId: string;
}) {
  const [productId, setProductId] = useState(initialProductId);

  return (
    <ProductCombobox
      name="productId"
      products={products}
      value={productId}
      emptyOptionLabel="すべて"
      placeholder="商品コード・名称で検索"
      ariaLabel="商品で絞り込み"
      onChange={setProductId}
    />
  );
}
