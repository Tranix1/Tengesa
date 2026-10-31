import test from "node:test";
import assert from "node:assert/strict";
import {buildDashboard,lineTotals} from "../src/domain/retailCalculations.ts";

test("sale line revenue and cost preserve cost basis",()=>{
 assert.deepEqual(lineTotals(225,140,3),{revenueMinor:675,costMinor:420});
 assert.throws(()=>lineTotals(100,40,0),/Invalid/);
});
test("dashboard separates gross profit from operating expenses and cash",()=>{
 const today=new Date();const iso=today.toISOString();
 const sale={id:"s1",soldAt:iso,totalMinor:1000,costOfGoodsMinor:600,paymentMethod:"cash"};
 const expense={id:"e1",expenseDate:iso,amountMinor:150,paymentMethod:"cash"};
 const product={id:"p1",quantityOnHand:2,costMinor:300,active:true,lowStockThreshold:2};
 const summary=buildDashboard([sale],[expense],[product],today);
 assert.equal(summary.salesMinor,1000);assert.equal(summary.grossProfitMinor,400);assert.equal(summary.expensesMinor,150);assert.equal(summary.netOperatingProfitMinor,250);assert.equal(summary.cashHeldMinor,850);assert.equal(summary.stockValueMinor,600);assert.equal(summary.lowStockCount,1);
});
