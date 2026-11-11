import type { Expense, Product, Sale } from "../types/retail.ts";

export function lineTotals(priceMinor:number,costMinor:number,quantity:number){
  if(!Number.isSafeInteger(priceMinor)||priceMinor<0||!Number.isSafeInteger(costMinor)||costMinor<0||!Number.isSafeInteger(quantity)||quantity<1)throw new Error("Invalid product amount or quantity.");
  const revenueMinor=priceMinor*quantity;const totalCostMinor=costMinor*quantity;if(!Number.isSafeInteger(revenueMinor)||!Number.isSafeInteger(totalCostMinor))throw new Error("Product amount is too large.");
  return {revenueMinor,costMinor:totalCostMinor};
}
export function buildDashboard(sales:Sale[],expenses:Expense[],products:Product[],date=new Date()){
 const key=date.toDateString();const todaySales=sales.filter(s=>new Date(s.soldAt).toDateString()===key);const todayExpenses=expenses.filter(e=>new Date(e.expenseDate).toDateString()===key);const salesMinor=todaySales.reduce((n,s)=>n+s.totalMinor,0);const grossProfitMinor=todaySales.reduce((n,s)=>n+s.totalMinor-s.costOfGoodsMinor,0);const expensesMinor=todayExpenses.reduce((n,e)=>n+e.amountMinor,0);
 return {salesMinor,grossProfitMinor,salesCount:todaySales.length,expensesMinor,netOperatingProfitMinor:grossProfitMinor-expensesMinor,cashHeldMinor:todaySales.filter(s=>s.paymentMethod==="cash").reduce((n,s)=>n+s.totalMinor,0)-todayExpenses.filter(e=>e.paymentMethod==="cash").reduce((n,e)=>n+e.amountMinor,0),stockCount:products.filter(p=>p.active).length,stockValueMinor:products.reduce((n,p)=>n+p.quantityOnHand*p.costMinor,0),lowStockCount:products.filter(p=>p.active&&p.quantityOnHand<=p.lowStockThreshold).length,recentSales:[...sales].sort((a,b)=>b.soldAt.localeCompare(a.soldAt)).slice(0,5)};
}
