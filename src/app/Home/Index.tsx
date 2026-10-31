import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import {ThemedText } from "@/components/ThemedText";
import CustomHeader from "@/components/CustomHeader";
import { router } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import ScreenWrapper from "@/components/ScreenWrapper";

export default function Home() {
  const { activeAccountName, currentRole } = useAuth();
  return (
    <ScreenWrapper fh={false}>
      <View style={{ flex: 1 }}>
        <CustomHeader pageTitle="Murimi" />
        <ThemedText style={{ paddingHorizontal: 16 }}>Selected account: {activeAccountName ?? "acc 1"} · {currentRole.accType}</ThemedText>
        <ThemedText type="title">Welcome to the Home Page</ThemedText>
        <Text>This is the main content of the home page.</Text>
        <TouchableOpacity onPress={() => router.push("/Account/Accounts")} style={{ padding: 16 }}>
          <ThemedText>Manage acc 1 / acc 2</ThemedText>
        </TouchableOpacity>
      </View>
    </ScreenWrapper>
  );
}
