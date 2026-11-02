import React from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import ScreenWrapper from "@/components/ScreenWrapper";
import { ThemedText } from "@/components/ThemedText";
import { palette } from "@/app/index";

export default function AboutScreen() {
  return <ScreenWrapper fh={false}><View style={{ flex: 1, padding: 24, gap: 14 }}>
    <ThemedText type="title">About Tengesa</ThemedText>
    <ThemedText>Tengesa keeps inventory, sales, customers and expenses separated by store. Authorised business finances can be viewed in Fynage.</ThemedText>
    <Pressable onPress={() => router.push("/(tabs)/business" as never)}><ThemedText style={{ color: palette.green }}>Business subscription and referral credits</ThemedText></Pressable>
  </View></ScreenWrapper>;
}
