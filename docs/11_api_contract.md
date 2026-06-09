# 11. API契約案

## 方針

REST APIを想定する。GraphQL等を採用する場合も、ここに記載した操作単位は維持する。

## Master APIs

```http
GET    /api/products
POST   /api/products
GET    /api/products/{id}
PUT    /api/products/{id}
DELETE /api/products/{id}

GET    /api/products/{id}/bom
PUT    /api/products/{id}/bom

GET    /api/materials
POST   /api/materials
PUT    /api/materials/{id}

GET    /api/packaging-materials
POST   /api/packaging-materials
PUT    /api/packaging-materials/{id}

GET    /api/work-areas
POST   /api/work-areas
PUT    /api/work-areas/{id}

GET    /api/employees
POST   /api/employees
PUT    /api/employees/{id}
```

## Production Plan APIs

```http
GET    /api/production-plans?dateFrom=&dateTo=&workAreaId=&status=
POST   /api/production-plans
GET    /api/production-plans/{id}
PUT    /api/production-plans/{id}
POST   /api/production-plans/{id}/confirm
POST   /api/production-plans/{id}/cancel
POST   /api/production-plans/{id}/recalculate
```

## Calculation APIs

```http
POST /api/calculations/production-duration
POST /api/calculations/max-quantity-in-time-window
POST /api/calculations/required-people
POST /api/calculations/material-requirements
POST /api/calculations/cost-estimate
```

### production-duration request

```json
{
  "productId": "uuid",
  "workAreaId": "uuid",
  "quantity": 1000,
  "peopleCount": 4,
  "startTime": "09:00"
}
```

休憩はリクエスト値ではなく、固定の作業不可時間帯 `12:00-13:00 / 15:00-15:15` を使う。

### production-duration response

```json
{
  "requiredMinutes": 240,
  "workingMinutes": 240,
  "blockedMinutes": 0,
  "endTime": "14:00",
  "overtimeMinutes": 0,
  "warnings": []
}
```

## Inventory APIs

```http
GET  /api/inventory/raw-materials?date=
GET  /api/inventory/packaging-materials?date=
GET  /api/inventory/shortages?dateFrom=&dateTo=
POST /api/inventory/adjustments
GET  /api/inventory/movements?itemType=&itemId=&dateFrom=&dateTo=
```

## Purchase APIs

```http
GET  /api/purchase-orders?status=&itemType=
POST /api/purchase-orders/from-shortage
POST /api/purchase-orders
PUT  /api/purchase-orders/{id}
POST /api/purchase-orders/{id}/confirm
POST /api/purchase-orders/{id}/receive
POST /api/purchase-orders/{id}/cancel
```

## Shift APIs

```http
GET  /api/shifts?dateFrom=&dateTo=
POST /api/shifts/import
POST /api/shifts
PUT  /api/shifts/{id}
GET  /api/shifts/available-employees?date=&startTime=&endTime=
```

## Assignment APIs

```http
POST /api/production-plans/{id}/assignments
PUT  /api/production-plan-assignments/{id}
DELETE /api/production-plan-assignments/{id}
POST /api/production-plans/{id}/suggest-move-after-completion
```

## Daily Report APIs

```http
GET  /api/daily-reports?dateFrom=&dateTo=&status=
POST /api/daily-reports/from-production-plan/{productionPlanId}
PUT  /api/daily-reports/{id}
POST /api/daily-reports/{id}/confirm
POST /api/daily-reports/{id}/void
```

## Invoice Export APIs

```http
GET  /api/invoice-candidates?dateFrom=&dateTo=&billingTarget=
POST /api/invoice-exports
GET  /api/invoice-exports/{id}/download
GET  /api/invoice-exports/history
```

## Import/Export APIs

```http
POST /api/import/products
POST /api/import/materials
POST /api/import/packaging-materials
POST /api/import/shifts
POST /api/import/stock-opening-balances
GET  /api/export/master-template?type=products
```
