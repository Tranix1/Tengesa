import FinancialReport from "@/components/FinancialReport";
import SubscriptionPanel from "@/components/SubscriptionPanel";
import React, { useCallback, useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { useFocusEffect, router } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { useBusiness } from "@/context/BusinessContext";
import { dashboard, listExpenses, recordExpense } from "@/services/retailRepository";
import type { Expense, PaymentMethod } from "@/types/retail";
import { Action, Card, Empty, Field, money, SectionTitle } from "@/components/RetailUI";
import { palette } from "../index";

const categories = ["Rent", "Wages", "Utilities", "Transport", "Supplies", "Other"];

export default function BusinessTab() {
  const { user, Logout } = useAuth();
  const { businesses, business, selectBusiness } = useBusiness();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Other");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [error, setError] = useState("");
  const role = business?.sharedRole ?? "owner";
  const canViewFinances = role === "owner" || role === "admin";
  const canManage = role === "owner" || role === "admin";
  const load = useCallback(async () => {
    if (!user || !business || !canViewFinances) { setExpenses([]); setSummary(null); return; }
    const [entries, totals] = await Promise.all([
      listExpenses(user.uid, business.id),
      dashboard(user.uid, business.id, business.currency),
    ]);
    setExpenses(entries); setSummary(totals);
  }, [user?.uid, business?.id, business?.currency, canViewFinances]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const add = async () => {
    if (!user || !business || !canManage) return;
    setError("");
    try {
      await recordExpense(user.uid, business.id, business.currency, Math.round(Number(amount) * 100), category, description, method, { id: user.uid, name: user.displayName || user.phoneNumber || "Team member", role });
      setAmount(""); setDescription(""); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Expense could not be saved."); }
  };
  const logout = () => Alert.alert("Sign out?", "You can sign in again with your phone number.", [
    { text: "Cancel", style: "cancel" },
    { text: "Sign out", style: "destructive", onPress: () => void Logout() },
  ]);
  return <ScrollView style={{ backgroundColor: palette.paper }} contentContainerStyle={{ padding: 16, gap: 11 }}>
    <SectionTitle title={canViewFinances ? "Business finances" : "Business access"} />
    {!canViewFinances ? <Card><Text style={{ color: palette.ink, fontWeight: "800" }}>Role: {role}</Text><Text style={{ color: palette.muted }}>{role === "employee" ? "Record sales from the POS. Owner financial summaries, expenses and profitability are restricted." : "This account has no Tengesa operations permission."}</Text></Card> : null}
    {canViewFinances ? <>
      <View style={{ flexDirection: "row", gap: 8 }}>{[["Revenue", summary?.salesMinor], ["Gross profit", summary?.grossProfitMinor], ["Expenses", summary?.expensesMinor], ["Net operating profit", summary?.netOperatingProfitMinor]].map(([label, value]: any) =>
        <Card key={label} style={{ width: "48%" }}><Text style={{ color: palette.muted }}>{label}</Text><Text style={{ fontSize: 17, fontWeight: "800", color: palette.ink }}>{money(value ?? 0, business?.currency)}</Text></Card>)}</View>
      {canManage ? <Card><Text style={{ fontWeight: "800", fontSize: 17, color: palette.ink }}>Record an expense</Text><Field placeholder={"Amount (" + business?.currency + ")"} keyboardType="decimal-pad" value={amount} onChangeText={setAmount} /><Field placeholder="Description (optional)" value={description} onChangeText={setDescription} /><Text style={{ color: palette.muted, fontWeight: "700" }}>Category</Text><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>{categories.map((item) => <Action key={item} title={(category === item ? "✓ " : "") + item} secondary onPress={() => setCategory(item)} />)}</View><Text style={{ color: palette.muted, fontWeight: "700" }}>Paid using</Text><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>{(["cash", "ecocash", "innbucks", "bank", "card"] as const).map((item) => <Action key={item} title={(method === item ? "✓ " : "") + item} secondary onPress={() => setMethod(item)} />)}</View>{error ? <Text style={{ color: "#ae3434" }}>{error}</Text> : null}<Action title="Save expense" onPress={() => void add()} /></Card> : null}
      <SectionTitle title="Expense history" />
      {expenses.length ? expenses.slice(0, 30).map((expense) => <Card key={expense.id}><View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={{ fontWeight: "800", color: palette.ink }}>{expense.category}</Text><Text style={{ fontWeight: "800", color: palette.ink }}>{money(expense.amountMinor, business?.currency)}</Text></View><Text style={{ color: palette.muted }}>{expense.description || "No description"} · {new Date(expense.expenseDate).toLocaleDateString()}</Text></Card>) : <Empty text="Your business expenses will appear here." />}
      <FinancialReport />
    </> : null}
    <SectionTitle title="Businesses" />
    <SectionTitle title="Customers" />
    <Action title="View and manage customers" secondary onPress={() => router.push("/(tabs)/customers")} />
    {businesses.map((item) => <Action key={item.id} title={(business?.id === item.id ? "✓ " : "") + item.name + " · " + item.currency + (item.sharedRole ? " · " + item.sharedRole : "")} secondary onPress={() => void selectBusiness(item.id)} />)}
    {business && role === "owner" ? <SubscriptionPanel businessId={business.id} /> : null}
    {business && role !== "owner" ? <Card><Text style={{ color: palette.muted }}>This business uses the owner&apos;s shared subscription; no separate payment is required.</Text></Card> : null}
    <Action title="Sign out" secondary onPress={logout} />
  </ScrollView>;
}
