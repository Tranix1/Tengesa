export type PaymentMethod = "cash" | "ecocash" | "innbucks" | "bank" | "card";
export type BusinessType = "shop" | "grocery" | "canteen" | "butchery" | "bar" | "retail";
export type SyncStatus = "synced" | "pending" | "failed";

export type Business = {
  id: string;
  ownerId: string;
  name: string;
  type: BusinessType;
  currency: string;
  phone?: string;
  address?: string;
  taxNumber?: string;
  receiptFooter?: string;
  status: "active" | "archived";
  allowNegativeStock: boolean;
  createdAt: string;
  updatedAt: string;
  sourceOwnerId?: string;
  sharedRole?: "owner" | "admin" | "employee" | "investor";
};

export type Product = {
  id: string;
  ownerId: string;
  businessId: string;
  name: string;
  sku: string;
  barcode?: string;
  category: string;
  description?: string;
  unit: string;
  priceMinor: number;
  costMinor: number;
  quantityOnHand: number;
  lowStockThreshold: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SaleLine = {
  productId: string;
  name: string;
  sku: string;
  unit: string;
  quantity: number;
  unitPriceMinor: number;
  unitCostMinor: number;
  lineTotalMinor: number;
  lineCostMinor: number;
};

export type Sale = {
  id: string;
  ownerId: string;
  businessId: string;
  currency: string;
  receiptNumber: string;
  lines: SaleLine[];
  subtotalMinor: number;
  discountMinor: 0;
  totalMinor: number;
  costOfGoodsMinor: number;
  paymentMethod: PaymentMethod;
  customerId?: string;
  customerNameSnapshot?: string;
  amountReceivedMinor: number;
  changeMinor: number;
  status: "completed";
  soldAt: string;
  createdAt: string;
  updatedAt: string;
};

export type Expense = {
  id: string;
  ownerId: string;
  businessId: string;
  amountMinor: number;
  currency: string;
  category: string;
  description: string;
  paymentMethod: PaymentMethod;
  expenseDate: string;
  createdAt: string;
  updatedAt: string;
};

export type RetailCustomer = {
  id: string;
  ownerId: string;
  businessId: string;
  name: string;
  phone?: string;
  notes?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StockMovement = {
  id: string;
  ownerId: string;
  businessId: string;
  productId: string;
  type: "opening" | "sale" | "purchase" | "adjustment" | "write_off";
  quantityDelta: number;
  unitCostMinor: number;
  reason: string;
  sourceRecordId?: string;
  occurredAt: string;
  createdAt: string;
};

export type SaleCartLine = { productId: string; quantity: number };

export type DashboardSummary = {
  salesMinor: number;
  grossProfitMinor: number;
  salesCount: number;
  expensesMinor: number;
  netOperatingProfitMinor: number;
  cashHeldMinor: number;
  stockValueMinor: number;
  lowStockCount: number;
};

export type OutboxEntry = {
  operation_id: string;
  owner_id: string;
  business_id: string;
  operation: "set" | "sale";
  collection_name: string;
  record_id: string;
  payload: string;
  attempts: number;
};
