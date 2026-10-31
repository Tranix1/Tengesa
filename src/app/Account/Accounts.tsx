import React, { useState } from "react";
import { Alert, StyleSheet, TextInput, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import ScreenWrapper from "@/components/ScreenWrapper";
import { ThemedText } from "@/components/ThemedText";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useAuth } from "@/context/AuthContext";

export default function AccountsScreen() {
  const { user, accounts, currentRole, createAccount, switchAccount } = useAuth();
  const accent = useThemeColor("accent");
  const background = useThemeColor("backgroundLight");
  const textColor = useThemeColor("text");
  const [accountName, setAccountName] = useState("");

  const handleCreate = async () => {
    const name = accountName.trim();
    if (!name) {
      Alert.alert("Account name", "Enter a name for this account.");
      return;
    }
    const account = await createAccount(name);
    if (!account) {
      Alert.alert("Accounts", user ? "Use a unique name up to 40 characters. You can save up to 2 accounts." : "Sign in before creating an account.");
      return;
    }
    setAccountName("");
    router.replace("/");
  };

  const handleSwitch = async (accountId: string) => {
    if (await switchAccount(accountId)) router.replace("/");
  };

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <ThemedText>Back</ThemedText>
        </TouchableOpacity>
        <ThemedText type="title">Accounts</ThemedText>
        <ThemedText>Current role: {currentRole.accType}</ThemedText>
        {accounts.map((account) => (
          <TouchableOpacity
            key={account.id}
            onPress={() => void handleSwitch(account.id)}
            style={[styles.account, { backgroundColor: background, borderColor: accent }]}
          >
            <ThemedText type="subtitle">{account.name}{account.currentRole === currentRole ? " (current)" : ""}</ThemedText>
            <ThemedText>{account.currentRole.accType}</ThemedText>
          </TouchableOpacity>
        ))}
        {accounts.length < 2 && (
          <>
          <TextInput
            value={accountName}
            onChangeText={setAccountName}
            placeholder={`Name for account ${accounts.length + 1}`}
            placeholderTextColor={textColor}
            maxLength={40}
            returnKeyType="done"
            onSubmitEditing={() => void handleCreate()}
            accessibilityLabel="New account name"
            style={[styles.input, { color: textColor, backgroundColor: background, borderColor: accent }]}
          />
          <TouchableOpacity onPress={() => void handleCreate()} style={[styles.create, { backgroundColor: accent }]}>
            <ThemedText style={styles.createLabel}>Save account</ThemedText>
          </TouchableOpacity>
          </>
        )}
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, gap: 14 },
  back: { alignSelf: "flex-start", paddingVertical: 8 },
  account: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 4 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  create: { borderRadius: 12, padding: 16, alignItems: "center" },
  createLabel: { color: "white", fontWeight: "700" },
});
