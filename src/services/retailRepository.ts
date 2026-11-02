import * as SQLite from "expo-sqlite";
import type { Business, BusinessType, Expense, PaymentMethod, Product, RetailCustomer, Sale, SaleCartLine, StockMovement, OutboxEntry } from "@/types/retail";
import { buildDashboard, lineTotals } from "@/domain/retailCalculations";

const dbPromise = SQLite.openDatabaseAsync("tengesa-retail.db");
const now = () => new Date().toISOString();
const id = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
type RetailTable = "businesses" | "products" | "sales" | "expenses" | "movements" | "customers";

async function dbReady() {
  const db = await dbPromise;
  await db.execAsync(`PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS businesses (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, business_id TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sales (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, business_id TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS expenses (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, business_id TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS movements (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, business_id TEXT NOT NULL, product_id TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, business_id TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS outbox (operation_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, business_id TEXT NOT NULL, operation TEXT NOT NULL, collection_name TEXT NOT NULL, record_id TEXT NOT NULL, payload TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);`);
  return db;
}
const enqueue = async (ownerId: string, businessId: string, collection: string, recordId: string, payload: unknown) => {
  const db = await dbReady();
  await db.runAsync("INSERT OR IGNORE INTO outbox(operation_id,owner_id,business_id,operation,collection_name,record_id,payload,created_at) VALUES(?,?,?,?,?,?,?,?)", id(), ownerId, businessId, "set", collection, recordId, JSON.stringify(payload), now());
};
async function save<T extends {id:string;ownerId:string;businessId?:string;updatedAt?:string}>(table: RetailTable, value:T) {
  const db = await dbReady(); const stamp = now();
  await db.runAsync(`INSERT OR REPLACE INTO ${table}(id,owner_id${table === "businesses" ? "" : ",business_id"},data,updated_at) VALUES(?,?,${table === "businesses" ? "" : "?,"}?,?)`, value.id, value.ownerId, ...(table === "businesses" ? [] : [value.businessId ?? ""]), JSON.stringify({...value, updatedAt: stamp}), stamp);
  if (table !== "businesses") await enqueue(value.ownerId, value.businessId ?? "", table, value.id, {...value, updatedAt: stamp});
}
async function list<T>(table: RetailTable, ownerId: string, businessId?: string): Promise<T[]> {
  const db = await dbReady();
  const rows = table === "businesses"
    ? await db.getAllAsync<{data:string}>("SELECT data FROM businesses WHERE owner_id=? ORDER BY updated_at DESC", ownerId)
    : await db.getAllAsync<{data:string}>(`SELECT data FROM ${table} WHERE owner_id=? AND business_id=? ORDER BY updated_at DESC`, ownerId, businessId ?? "");
  return rows.map(row => JSON.parse(row.data) as T);
}
export const listBusinesses = (ownerId:string) => list<Business>("businesses", ownerId);
export async function saveSharedBusiness(ownerId:string,value:Business&{sourceOwnerId:string;sharedRole:"admin"|"employee"|"investor"|"owner"}){
  const db=await dbReady();const local={...value,ownerId};
  await db.runAsync("INSERT OR REPLACE INTO businesses(id,owner_id,data,updated_at) VALUES(?,?,?,?)",value.id,ownerId,JSON.stringify(local),value.updatedAt??now());
}
export async function createBusiness(ownerId:string, name:string, type:BusinessType, currency="USD"):Promise<Business> {
  const clean=name.trim(); if(!clean || clean.length>80) throw new Error("Enter a business name (up to 80 characters).");
  const value:Business={id:id(),ownerId,name:clean,type,currency, status:"active", allowNegativeStock:false,createdAt:now(),updatedAt:now()};
  await save("businesses",value); await enqueue(ownerId,value.id,"businesses",value.id,value); return value;
}
export const listProducts = (ownerId:string,businessId:string) => list<Product>("products",ownerId,businessId);
export async function saveProduct(ownerId:string,businessId:string,input:Partial<Product>&Pick<Product,"name"|"priceMinor"|"costMinor">):Promise<Product> {
  const name=input.name.trim(); if(!name || name.length>100) throw new Error("Enter a product name.");
  if(!Number.isSafeInteger(input.priceMinor)||input.priceMinor<0||!Number.isSafeInteger(input.costMinor)||input.costMinor<0) throw new Error("Prices must be valid non-negative amounts.");
  const old=(await listProducts(ownerId,businessId)).find(p=>p.id===input.id);
  const value:Product={id:old?.id??id(),ownerId,businessId,name,sku:(input.sku??old?.sku??"").trim(),category:input.category?.trim()??old?.category??"General",unit:input.unit?.trim()??old?.unit??"each",priceMinor:input.priceMinor,costMinor:input.costMinor,quantityOnHand:old?.quantityOnHand??Math.max(0,input.quantityOnHand??0),lowStockThreshold:Math.max(0,input.lowStockThreshold??old?.lowStockThreshold??3),active:input.active??old?.active??true,description:input.description?.trim(),createdAt:old?.createdAt??now(),updatedAt:now()};
  if(!old&&value.quantityOnHand>0){const db=await dbReady();const stamp=value.createdAt;const movement:StockMovement={id:id(),ownerId,businessId,productId:value.id,type:"opening",quantityDelta:value.quantityOnHand,unitCostMinor:value.costMinor,reason:"Opening stock",sourceRecordId:value.id,occurredAt:stamp,createdAt:stamp};await db.withTransactionAsync(async()=>{await db.runAsync("INSERT INTO products(id,owner_id,business_id,data,updated_at) VALUES(?,?,?,?,?)",value.id,ownerId,businessId,JSON.stringify(value),stamp);await db.runAsync("INSERT INTO movements(id,owner_id,business_id,product_id,data,updated_at) VALUES(?,?,?,?,?,?)",movement.id,ownerId,businessId,value.id,JSON.stringify(movement),stamp);await db.runAsync("INSERT OR IGNORE INTO outbox(operation_id,owner_id,business_id,operation,collection_name,record_id,payload,created_at) VALUES(?,?,?,?,?,?,?,?)",`product:${value.id}`,ownerId,businessId,"set","products",value.id,JSON.stringify(value),stamp);await db.runAsync("INSERT OR IGNORE INTO outbox(operation_id,owner_id,business_id,operation,collection_name,record_id,payload,created_at) VALUES(?,?,?,?,?,?,?,?)",`movement:${movement.id}`,ownerId,businessId,"set","movements",movement.id,JSON.stringify(movement),stamp);});}else await save("products",value);return value;
}
export async function deactivateProduct(ownerId:string,businessId:string,productId:string) { const p=(await listProducts(ownerId,businessId)).find(x=>x.id===productId); if(!p)return; await save("products",{...p,active:false,updatedAt:now()}); }
export async function adjustStock(ownerId:string,businessId:string,productId:string,delta:number,reason:string){if(!Number.isInteger(delta)||delta===0)throw new Error("Enter a non-zero whole number.");const db=await dbReady();let movement:StockMovement|undefined;let updatedProduct:Product|undefined;await db.withTransactionAsync(async()=>{const p=(await listProducts(ownerId,businessId)).find(x=>x.id===productId);if(!p)throw new Error("Product not found.");const next=p.quantityOnHand+delta;if(next<0)throw new Error("Stock cannot go below zero.");const stamp=now();updatedProduct={...p,quantityOnHand:next,updatedAt:stamp};await db.runAsync("UPDATE products SET data=?,updated_at=? WHERE id=? AND owner_id=? AND business_id=?",JSON.stringify(updatedProduct),stamp,p.id,ownerId,businessId);movement={id:id(),ownerId,businessId,productId,type:delta>0?"adjustment":"write_off",quantityDelta:delta,unitCostMinor:p.costMinor,reason:reason.trim()||"Stock adjustment",occurredAt:stamp,createdAt:stamp};await db.runAsync("INSERT INTO movements(id,owner_id,business_id,product_id,data,updated_at) VALUES(?,?,?,?,?,?)",movement.id,ownerId,businessId,productId,JSON.stringify(movement),stamp);await db.runAsync("INSERT OR IGNORE INTO outbox(operation_id,owner_id,business_id,operation,collection_name,record_id,payload,created_at) VALUES(?,?,?,?,?,?,?,?)",`movement:${movement.id}`,ownerId,businessId,"set","movements",movement.id,JSON.stringify(movement),stamp);});if(updatedProduct)await enqueue(ownerId,businessId,"products",productId,updatedProduct);return movement;}
export const listSales = (ownerId:string,businessId:string) => list<Sale>("sales",ownerId,businessId);
export const listExpenses = (ownerId:string,businessId:string) => list<Expense>("expenses",ownerId,businessId);
export const listCustomers = (ownerId:string,businessId:string) => list<RetailCustomer>("customers",ownerId,businessId);
export async function saveCustomer(ownerId:string,businessId:string,name:string,phone="",notes=""):Promise<RetailCustomer>{
  const cleanName=name.trim(); if(!cleanName||cleanName.length>120)throw new Error("Enter a customer name (up to 120 characters).");
  const old=(await listCustomers(ownerId,businessId)).find(item=>item.phone&&phone.trim()&&item.phone===phone.trim());
  const stamp=now();const value:RetailCustomer={id:old?.id??id(),ownerId,businessId,name:cleanName,phone:phone.trim()||undefined,notes:notes.trim()||undefined,active:true,createdAt:old?.createdAt??stamp,updatedAt:stamp};
  await save("customers",value);return value;
}
export async function recordSale(ownerId:string,businessId:string,currency:string,cart:SaleCartLine[],paymentMethod:PaymentMethod,customerId?:string):Promise<Sale> {
  if(!cart.length) throw new Error("Add at least one product to the sale.");
  const customer=customerId?(await listCustomers(ownerId,businessId)).find(item=>item.id===customerId&&item.active):undefined;
  if(customerId&&!customer)throw new Error("Choose an active customer from this store.");
  const normalizedCart=[...cart.reduce((combined,line)=>combined.set(line.productId,(combined.get(line.productId)??0)+line.quantity),new Map<string,number>())].map(([productId,quantity])=>({productId,quantity}));
  const db=await dbReady(); let result:Sale|undefined;
  await db.withTransactionAsync(async()=>{
    const products=await listProducts(ownerId,businessId); const lines=normalizedCart.map(item=>{const p=products.find(x=>x.id===item.productId&&x.active); if(!p)throw new Error("A selected product is no longer available."); if(!Number.isInteger(item.quantity)||item.quantity<1)throw new Error("Quantity must be at least one."); if(item.quantity>p.quantityOnHand)throw new Error(`Only ${p.quantityOnHand} ${p.unit} of ${p.name} are in stock.`); return {p,quantity:item.quantity};});
    const stamp=now(); const saleId=id(); const saleLines=lines.map(({p,quantity})=>{const totals=lineTotals(p.priceMinor,p.costMinor,quantity);return {productId:p.id,name:p.name,sku:p.sku,unit:p.unit,quantity,unitPriceMinor:p.priceMinor,unitCostMinor:p.costMinor,lineTotalMinor:totals.revenueMinor,lineCostMinor:totals.costMinor};});
    result={id:saleId,ownerId,businessId,currency,receiptNumber:saleId.slice(-8).toUpperCase(),lines:saleLines,subtotalMinor:saleLines.reduce((a,l)=>a+l.lineTotalMinor,0),discountMinor:0,totalMinor:saleLines.reduce((a,l)=>a+l.lineTotalMinor,0),costOfGoodsMinor:saleLines.reduce((a,l)=>a+l.lineCostMinor,0),paymentMethod,customerId:customer?.id,customerNameSnapshot:customer?.name,amountReceivedMinor:saleLines.reduce((a,l)=>a+l.lineTotalMinor,0),changeMinor:0,status:"completed",soldAt:stamp,createdAt:stamp,updatedAt:stamp};
    await db.runAsync("INSERT INTO sales(id,owner_id,business_id,data,updated_at) VALUES(?,?,?,?,?)",saleId,ownerId,businessId,JSON.stringify(result),stamp);
    for(const {p,quantity} of lines){const updated={...p,quantityOnHand:p.quantityOnHand-quantity,updatedAt:stamp};await db.runAsync("UPDATE products SET data=?,updated_at=? WHERE id=? AND owner_id=? AND business_id=?",JSON.stringify(updated),stamp,p.id,ownerId,businessId);const movement:StockMovement={id:id(),ownerId,businessId,productId:p.id,type:"sale",quantityDelta:-quantity,unitCostMinor:p.costMinor,reason:"Point of sale",sourceRecordId:saleId,occurredAt:stamp,createdAt:stamp}; await db.runAsync("INSERT INTO movements(id,owner_id,business_id,product_id,data,updated_at) VALUES(?,?,?,?,?,?)",movement.id,ownerId,businessId,p.id,JSON.stringify(movement),stamp);}
    await db.runAsync("INSERT OR IGNORE INTO outbox(operation_id,owner_id,business_id,operation,collection_name,record_id,payload,created_at) VALUES(?,?,?,?,?,?,?,?)",`sale:${saleId}`,ownerId,businessId,"sale","sales",saleId,JSON.stringify(result),stamp);
  });
  if(!result)throw new Error("Sale could not be saved."); return result;
}
export async function recordExpense(ownerId:string,businessId:string,currency:string,amountMinor:number,category:string,description:string,paymentMethod:PaymentMethod){
  if(!Number.isSafeInteger(amountMinor)||amountMinor<=0)throw new Error("Enter an expense amount greater than zero."); if(!category.trim())throw new Error("Choose an expense category.");
  const stamp=now();const expense:Expense={id:id(),ownerId,businessId,amountMinor,currency,category:category.trim(),description:description.trim(),paymentMethod,expenseDate:stamp,createdAt:stamp,updatedAt:stamp};await save("expenses",expense);return expense;
}
export async function dashboard(ownerId:string,businessId:string,currency:string){
  const [sales,expenses,products]=await Promise.all([listSales(ownerId,businessId),listExpenses(ownerId,businessId),listProducts(ownerId,businessId)]); return {currency,...buildDashboard(sales,expenses,products)};
}
export async function pendingOutbox(ownerId:string){const db=await dbReady();return db.getAllAsync<OutboxEntry>("SELECT operation_id,owner_id,business_id,operation,collection_name,record_id,payload,attempts FROM outbox WHERE owner_id=? ORDER BY created_at",ownerId);}
export async function markOutboxSynced(operationId:string){const db=await dbReady();await db.runAsync("DELETE FROM outbox WHERE operation_id=?",operationId);}
export async function incrementOutboxAttempt(operationId:string){const db=await dbReady();await db.runAsync("UPDATE outbox SET attempts=attempts+1 WHERE operation_id=?",operationId);}
export async function mergeRemoteRecords(ownerId:string,businessId:string,collectionName:string,records:Record<string,any>[]){
 const db=await dbReady();const table=collectionName as RetailTable;if(!["businesses","products","sales","expenses","movements","customers"].includes(table))return;
 await db.withTransactionAsync(async()=>{for(const record of records){if(record.ownerId!==ownerId||(table!=="businesses"&&record.businessId!==businessId))continue;const localOutbox=await db.getFirstAsync<{record_id:string}>("SELECT record_id FROM outbox WHERE owner_id=? AND collection_name=? AND record_id=? LIMIT 1",ownerId,table,record.id);if(localOutbox)continue;const productId=table==="movements"?record.productId:"";if(table==="movements")await db.runAsync("INSERT OR REPLACE INTO movements(id,owner_id,business_id,product_id,data,updated_at) VALUES(?,?,?,?,?,?)",record.id,ownerId,businessId,productId,JSON.stringify(record),record.updatedAt??record.createdAt??now());else if(table==="businesses")await db.runAsync("INSERT OR REPLACE INTO businesses(id,owner_id,data,updated_at) VALUES(?,?,?,?)",record.id,ownerId,JSON.stringify(record),record.updatedAt??now());else await db.runAsync(`INSERT OR REPLACE INTO ${table}(id,owner_id,business_id,data,updated_at) VALUES(?,?,?,?,?)`,record.id,ownerId,businessId,JSON.stringify(record),record.updatedAt??record.createdAt??now());}});
}
