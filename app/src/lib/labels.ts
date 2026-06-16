export function productionTypeLabel(value: string | null | undefined) {
  switch (value) {
    case "stock":
      return "在庫生産";
    case "make_to_order":
      return "受注生産";
    case "both":
      return "在庫・受注";
    case "external":
      return "外注";
    case "trial":
      return "試作";
    case "other":
      return "その他";
    default:
      return value || "未設定";
  }
}

export function planStatusLabel(value: string | null | undefined) {
  switch (value) {
    case "draft":
      return "仮";
    case "confirmed":
      return "確定";
    case "completed":
      return "完了";
    case "cancelled":
      return "取消";
    default:
      return value || "未設定";
  }
}

export function planStatusClass(value: string | null | undefined) {
  switch (value) {
    case "confirmed":
      return "success";
    case "completed":
      return "muted";
    case "cancelled":
      return "danger";
    case "draft":
      return "info";
    default:
      return "muted";
  }
}

export function areaTypeLabel(value: string | null | undefined) {
  switch (value) {
    case "internal":
      return "自社";
    case "external":
      return "外注";
    case "warehouse":
      return "倉庫";
    default:
      return value || "未設定";
  }
}

export function employmentTypeLabel(value: string | null | undefined) {
  switch (value) {
    case "own":
      return "自社";
    case "temp":
      return "派遣";
    case "other":
      return "その他";
    default:
      return value || "未設定";
  }
}

export function forecastMethodLabel(value: string | null | undefined) {
  switch (value) {
    case "MANUAL":
      return "手動入力";
    case "YEAR_RATIO":
      return "前年比予測";
    case "SALES_INPUT":
      return "営業予測";
    case "NONE":
      return "予測なし";
    default:
      return value || "未設定";
  }
}

export function equipmentKindLabel(value: string | null | undefined) {
  switch (value) {
    case "ROOM":
      return "部屋";
    case "LINE":
      return "ライン";
    case "MACHINE":
      return "機械";
    case "OTHER":
      return "その他";
    default:
      return value || "未設定";
  }
}

export function autoScheduleRoleLabel(value: string | null | undefined) {
  switch (value) {
    case "ORDER_PRIMARY":
      return "受注生産を優先";
    case "STOCK_PRIMARY":
      return "在庫生産を優先";
    case "SHARED":
      return "共用";
    case "EXCLUDED":
      return "自動予定から除外";
    default:
      return value || "未設定";
  }
}

export function capacitySourceTypeLabel(value: string | null | undefined) {
  switch (value) {
    case "MANUAL":
      return "手動";
    case "DAILY_REPORT_MEDIAN":
      return "日報中央値";
    default:
      return value || "未設定";
  }
}

// 自動作成スケジューラのノート(「自動作成 N: ... / 注意: ...」)は現場帳票では出さない。
// 手入力された備考のみ残す。
export function manualNote(note: string | null | undefined): string {
  if (!note) return "";
  if (/^自動作成\s*\d+\s*[:：]/.test(note)) return "";
  return note;
}

export function packagingKindLabel(value: string | null | undefined) {
  switch (value) {
    case "bag":
      return "袋";
    case "desiccant":
      return "乾燥剤";
    case "carton":
      return "ケース";
    case "other":
      return "その他";
    default:
      return value || "未設定";
  }
}

export function purchaseOrderUrgencyLabel(value: string | null | undefined) {
  switch (value) {
    case "CRITICAL":
      return "緊急";
    case "WARNING":
      return "注意";
    case "INFO":
      return "余裕あり";
    case "NONE":
      return "—";
    default:
      return value || "—";
  }
}

export function purchaseOrderUrgencyClass(value: string | null | undefined): string {
  switch (value) {
    case "CRITICAL":
      return "danger";
    case "WARNING":
      return "warn";
    case "INFO":
      return "info";
    default:
      return "muted";
  }
}

export function purchaseOrderStatusLabel(value: string | null | undefined) {
  switch (value) {
    case "candidate":
      return "候補";
    case "draft":
      return "仮発注";
    case "ordered_unconfirmed":
      return "未確定発注";
    case "confirmed":
      return "確定発注";
    case "received":
      return "入荷済み";
    case "cancelled":
      return "取消";
    default:
      return value || "未設定";
  }
}
