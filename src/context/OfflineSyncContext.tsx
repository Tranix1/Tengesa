/* eslint react-hooks/set-state-in-effect: "off" -- connectivity, auth, and queue effects synchronize external state. */
import React, { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { useAuth } from "@/context/AuthContext";
import { getSyncQueueCount, subscribeOfflineQueueChanges, synchronizeOfflineWrites } from "@/services/offlineStore";

type OfflineSyncValue = { online: boolean; syncing: boolean; pendingCount: number; retry: () => Promise<void> };
const OfflineSyncContext = createContext<OfflineSyncValue | null>(null);

export function OfflineSyncProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const refreshCount = useCallback(async (uid?: string) => {
    if (!uid) { setPendingCount(0); return; }
    try { setPendingCount(await getSyncQueueCount(uid)); } catch { /* SQLite initializes on first use. */ }
  }, []);
  const retry = useCallback(async () => {
    if (!online || !user?.uid) return;
    setSyncing(true);
    try { await synchronizeOfflineWrites(user.uid); } catch (error) { console.warn("Tengesa offline changes will retry when a connection is available.", error); }
    finally { setSyncing(false); await refreshCount(user.uid); }
  }, [online, user?.uid, refreshCount]);

  useEffect(() => NetInfo.addEventListener((network) => setOnline(network.isConnected === true && network.isInternetReachable !== false)), []);
  useEffect(() => { void refreshCount(user?.uid); }, [refreshCount, user?.uid]);
  useEffect(() => subscribeOfflineQueueChanges(() => { void refreshCount(user?.uid); }), [refreshCount, user?.uid]);
  useEffect(() => { if (online && user?.uid) void retry(); }, [online, user?.uid, retry]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active" && online && user?.uid) void retry(); });
    return () => subscription.remove();
  }, [online, user?.uid, retry]);
  return <OfflineSyncContext.Provider value={{ online, syncing, pendingCount, retry }}>{children}</OfflineSyncContext.Provider>;
}

export function useOfflineSync() {
  const value = useContext(OfflineSyncContext);
  if (!value) throw new Error("useOfflineSync must be used within OfflineSyncProvider.");
  return value;
}
