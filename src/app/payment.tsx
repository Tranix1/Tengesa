import React, { useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Redirect } from "expo-router";
import SubscriptionPanel from "@/components/SubscriptionPanel";
import { palette } from "@/app/index";
import { useBusiness } from "@/context/BusinessContext";
import { Card } from "@/components/RetailUI";

export default function PaymentPage() {
  const { business } = useBusiness();
  const [active, setActive] = useState(false);
  if (active) return <Redirect href={"/(tabs)" as never} />;
  return <View style={{ flex: 1, backgroundColor: palette.paper, padding: 18, justifyContent: "center" }}>
    <Card>
      <Text style={{ fontSize: 24, fontWeight: "800", color: palette.ink }}>Subscribe to use Tengesa</Text>
      <Text style={{ color: palette.muted }}>Activate a subscription for {business?.name ?? "your business"} to continue.</Text>
      {business ? <SubscriptionPanel businessId={business.id} onAccessChange={setActive} /> : <ActivityIndicator color={palette.green} />}
    </Card>
  </View>;
}
