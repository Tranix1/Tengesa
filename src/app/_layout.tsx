import { Stack } from "expo-router";
import { AuthProvider } from "@/context/AuthContext";
import { OfflineSyncProvider } from "@/context/OfflineSyncContext";
import OfflineSyncStatus from "@/components/OfflineSyncStatus";
import { View } from "react-native";
import { BusinessProvider } from "@/context/BusinessContext";

export default function RootLayout() {
  return (
    <AuthProvider>
      <OfflineSyncProvider>
       <BusinessProvider>
        <View style={{ flex: 1 }}>
          <OfflineSyncStatus />
          <Stack screenOptions={{ headerShown: false }} />
        </View>
       </BusinessProvider>
      </OfflineSyncProvider>
    </AuthProvider>
  );
}
