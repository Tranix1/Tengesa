import React, { useCallback, useState } from "react";
import { ScrollView, Text } from "react-native";
import { useFocusEffect } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { useBusiness } from "@/context/BusinessContext";
import { listCustomers, saveCustomer } from "@/services/retailRepository";
import type { RetailCustomer } from "@/types/retail";
import { Action, Card, Empty, Field, SectionTitle } from "@/components/RetailUI";
import { palette } from "../index";

export default function CustomersTab() {
  const { user } = useAuth(); const { business } = useBusiness();
  const uid = user?.uid; const businessId = business?.id;
  const [customers, setCustomers] = useState<RetailCustomer[]>([]);
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (uid && businessId) setCustomers(await listCustomers(uid, businessId));
  }, [uid, businessId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const add = async () => {
    if (!user || !business) return;
    setError("");
    try { await saveCustomer(user.uid, business.id, name, phone); setName(""); setPhone(""); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Customer could not be saved."); }
  };
  return <ScrollView style={{ backgroundColor: palette.paper }} contentContainerStyle={{ padding: 16, gap: 11 }}>
    <SectionTitle title={`${business?.name ?? "Store"} customers`} />
    <Card><Text style={{ fontWeight: "800", fontSize: 17, color: palette.ink }}>Add a customer</Text><Field placeholder="Name" value={name} onChangeText={setName} /><Field placeholder="Phone (optional)" keyboardType="phone-pad" value={phone} onChangeText={setPhone} /><Text style={{ color: palette.muted }}>Customers belong to this store and sync with their Tengesa source ID.</Text>{error ? <Text style={{ color: "#ae3434" }}>{error}</Text> : null}<Action title="Save customer" onPress={() => void add()} /></Card>
    <SectionTitle title="Customer list" />
    {customers.length ? customers.map((customer) => <Card key={customer.id}><Text style={{ fontWeight: "800", color: palette.ink }}>{customer.name}</Text><Text style={{ color: palette.muted }}>{customer.phone || "No phone number"} · Store {business?.id}</Text></Card>) : <Empty text="No customers have been added to this store." />}
  </ScrollView>;
}
