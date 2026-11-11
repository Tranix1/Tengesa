import React, { useCallback, useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { useBusiness } from "@/context/BusinessContext";
import { listCustomers, listProducts, listSales, recordSale } from "@/services/retailRepository";
import type { PaymentMethod, Product, RetailCustomer, Sale, SaleCartLine } from "@/types/retail";
import { Action, Card, Empty, Field, money, SectionTitle } from "@/components/RetailUI";
import { palette } from "../index";

const methods: PaymentMethod[] = ["cash", "ecocash", "innbucks", "bank", "card"];

export default function SalesTab() {
  const { user } = useAuth(); const { business } = useBusiness();
  const [products, setProducts] = useState<Product[]>([]); const [customers, setCustomers] = useState<RetailCustomer[]>([]); const [sales, setSales] = useState<Sale[]>([]);
  const [cart, setCart] = useState<SaleCartLine[]>([]); const [search, setSearch] = useState(""); const [method, setMethod] = useState<PaymentMethod>("cash");
  const [customerId, setCustomerId] = useState(""); const [error, setError] = useState(""); const [receipt, setReceipt] = useState<Sale | null>(null); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!user || !business) return;
    const [productsRows, customerRows, saleRows] = await Promise.all([listProducts(user.uid, business.id), listCustomers(user.uid, business.id), listSales(user.uid, business.id)]);
    setProducts(productsRows.filter((product) => product.active)); setCustomers(customerRows.filter((customer) => customer.active)); setSales(saleRows);
  }, [user, business]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const add = (product: Product) => setCart((current) => {
    const row = current.find((item) => item.productId === product.id);
    return row ? current.map((item) => item.productId === product.id ? { ...item, quantity: Math.min(product.quantityOnHand, item.quantity + 1) } : item) : [...current, { productId: product.id, quantity: 1 }];
  });
  const update = (productId: string, delta: number) => setCart((current) => current.flatMap((item) => {
    if (item.productId !== productId) return [item];
    const quantity = item.quantity + delta; return quantity < 1 ? [] : [{ ...item, quantity }];
  }));
  const total = cart.reduce((sum, item) => sum + (products.find((product) => product.id === item.productId)?.priceMinor ?? 0) * item.quantity, 0);
  const complete = async () => {
    if (!user || !business || busy) return;
    setBusy(true); setError("");
    try { const sold = await recordSale(user.uid, business.id, business.currency, cart, method, customerId || undefined, { id: user.uid, name: user.displayName || user.phoneNumber || "Team member", role: business.sharedRole || "owner" }); setReceipt(sold); setCart([]); setCustomerId(""); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Sale could not be completed."); }
    finally { setBusy(false); }
  };
  const checkout = () => {
    if (!cart.length) return;
    const customer = customers.find((item) => item.id === customerId);
    Alert.alert("Complete sale?", `Total ${money(total, business?.currency)} · ${method}${customer ? ` · ${customer.name}` : ""}`, [{ text: "Cancel", style: "cancel" }, { text: "Complete sale", onPress: () => void complete() }]);
  };
  const visibleProducts = products.filter((product) => product.name.toLowerCase().includes(search.toLowerCase()) || product.sku.toLowerCase().includes(search.toLowerCase()));

  return <ScrollView style={{ backgroundColor: palette.paper }} contentContainerStyle={{ padding: 16, gap: 10 }}>
    {receipt ? <Card><Text style={{ fontSize: 20, fontWeight: "800", color: palette.green }}>Sale saved</Text><Text style={{ fontSize: 17, fontWeight: "800", color: palette.ink }}>{business?.name}</Text><Text style={{ color: palette.muted }}>Receipt {receipt.receiptNumber} · {new Date(receipt.soldAt).toLocaleString()}</Text>{receipt.customerNameSnapshot ? <Text style={{ color: palette.muted }}>Customer: {receipt.customerNameSnapshot}</Text> : null}{receipt.lines.map((line, index) => <View key={`${line.productId}-${index}`} style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={{ color: palette.ink }}>{line.quantity} × {line.name}</Text><Text style={{ color: palette.ink }}>{money(line.lineTotalMinor, business?.currency)}</Text></View>)}<View style={{ height: 1, backgroundColor: palette.line }} /><Text style={{ fontSize: 19, fontWeight: "800", color: palette.ink }}>Total {money(receipt.totalMinor, business?.currency)}</Text><Text style={{ color: palette.muted }}>Paid by {receipt.paymentMethod.toUpperCase()} · Transaction {receipt.id}</Text><Text style={{ color: palette.muted }}>Saved on this device; cloud sync will retry when connected.</Text><Action title="New sale" onPress={() => setReceipt(null)} /></Card> : null}
    <SectionTitle title="Point of sale" /><Field placeholder="Find a product" value={search} onChangeText={setSearch} />
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{visibleProducts.map((product) => <View key={product.id} style={{ width: "48%" }}><Action disabled={product.quantityOnHand < 1} secondary title={`${product.name} · ${money(product.priceMinor, business?.currency)}\n${product.quantityOnHand} in stock`} onPress={() => add(product)} /></View>)}</View>
    <SectionTitle title="Customer (optional)" /><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}><Action secondary title={customerId ? "Walk-in customer" : "✓ Walk-in customer"} onPress={() => setCustomerId("")} />{customers.map((customer) => <Action key={customer.id} secondary title={`${customerId === customer.id ? "✓ " : ""}${customer.name}`} onPress={() => setCustomerId(customer.id)} />)}</View>
    <SectionTitle title={`Cart · ${cart.reduce((sum, item) => sum + item.quantity, 0)} items`} />
    {cart.length ? cart.map((item) => { const product = products.find((row) => row.id === item.productId); if (!product) return null; return <Card key={product.id}><View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}><View><Text style={{ fontWeight: "800", color: palette.ink }}>{product.name}</Text><Text style={{ color: palette.muted }}>{money(product.priceMinor * item.quantity, business?.currency)}</Text></View><View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}><Action title="−" secondary onPress={() => update(product.id, -1)} /><Text style={{ fontWeight: "800", color: palette.ink }}>{item.quantity}</Text><Action title="+" secondary disabled={item.quantity >= product.quantityOnHand} onPress={() => add(product)} /></View></View></Card>; }) : <Empty text="Choose a product above to add it to the sale." />}
    <Text style={{ fontWeight: "800", fontSize: 22, color: palette.ink }}>Total · {money(total, business?.currency)}</Text><Text style={{ fontWeight: "700", color: palette.ink }}>Payment method</Text>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{methods.map((item) => <Action key={item} title={`${method === item ? "✓ " : ""}${item}`} secondary onPress={() => setMethod(item)} />)}</View>
    {method === "ecocash" || method === "innbucks" ? <Text style={{ color: palette.muted, fontSize: 12 }}>Mobile money is recorded as the selected method; this app does not verify the payment.</Text> : null}
    {error ? <Text style={{ color: "#ae3434" }}>{error}</Text> : null}<Action title={busy ? "Saving sale…" : "Complete sale"} disabled={!cart.length || busy} onPress={checkout} />
    <SectionTitle title="Sales history" />{sales.length ? sales.slice(0, 30).map((sale) => <Card key={sale.id}><View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={{ fontWeight: "800", color: palette.ink }}>Receipt {sale.receiptNumber}</Text><Text style={{ fontWeight: "800", color: palette.ink }}>{money(sale.totalMinor, business?.currency)}</Text></View><Text style={{ color: palette.muted }}>{sale.customerNameSnapshot ? `${sale.customerNameSnapshot} · ` : ""}{new Date(sale.soldAt).toLocaleString()} · {sale.paymentMethod} · {sale.lines.length} items</Text></Card>) : <Empty text="No sales recorded yet." />}
  </ScrollView>;
}
