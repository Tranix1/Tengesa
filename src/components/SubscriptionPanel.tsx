import React, { useCallback, useEffect, useState } from "react";
import { Linking, Text } from "react-native";
import { useFocusEffect } from "expo-router";
import { collection, doc, getDoc, getDocs, getFirestore, query, where } from "@react-native-firebase/firestore";
import { getAuth } from "@react-native-firebase/auth";
import { Action, Card } from "@/components/RetailUI";
import { palette } from "@/app/index";
import { callArmament } from "@/services/armamentApi";

const paymentEndpoint = "https://us-central1-armament-f5a0b.cloudfunctions.net/createArmamentSubscriptionPayment";

export default function SubscriptionPanel({ businessId, onAccessChange }: { businessId: string; onAccessChange?: (active: boolean) => void }) {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [checkedAt, setCheckedAt] = useState(0);
  const [referralCode, setReferralCode] = useState("");
  const [creditCount, setCreditCount] = useState(0);
  const [businessAccess, setBusinessAccess] = useState(false);
  const [canPay, setCanPay] = useState(true);
  const [monthlyAmountMinor, setMonthlyAmountMinor] = useState<number | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState("");
  const refresh = useCallback(async () => {
    const uid = getAuth().currentUser?.uid;
    if (!uid) return;
    try {
      const [subscription, credits, shared, plan] = await Promise.all([
        getDoc(doc(getFirestore(), "subscriptions", uid)),
        getDocs(query(collection(getFirestore(), "referralCredits"), where("ownerId", "==", uid), where("status", "==", "available"))),
        callArmament<{ businesses: { id: string; sourceApp: string; sourceId: string; role: string }[] }>("listArmamentBusinesses"),
        callArmament<{ amountMinor: number; currency: string; intervalMonths: number }>("getArmamentSubscriptionPlan"),
      ]);
      setStatus(subscription.exists() ? subscription.data() : null);
      setCreditCount(credits.size);
      const business = shared.businesses.find((item) => item.sourceApp === "tengesa" && item.sourceId === businessId);
      const entitlement = business ? await callArmament<{ active: boolean }>("getArmamentEntitlement", { businessId: business.id }) : null;
      setBusinessAccess(entitlement?.active === true);
      setCanPay(!business || business.role === "owner");
      setMonthlyAmountMinor(plan.amountMinor);
      setCheckedAt(Date.now());
      setError("");
    } catch {
      setError("Subscription status is unavailable. Connect to the internet and retry.");
    }
  }, [businessId]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const pay = async () => {
    const user = getAuth().currentUser;
    if (!user) return;
    setLoading(true); setError("");
    try {
      const response = await fetch(paymentEndpoint, {
        method: "POST",
        headers: { Authorization: "Bearer " + await user.getIdToken(), "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, sourceApp: "tengesa", returnUrl: "tengesa://subscription" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Payment could not be started.");
      if (!result.redirectUrl) throw new Error("Paynow did not return a payment page.");
      setPaymentId(String(result.paymentId)); setPaymentStatus("pending");
      await Linking.openURL(result.redirectUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start payment. Try again later.");
    } finally { setLoading(false); }
  };
  const checkPayment = async () => {
    if (!paymentId || loading) return;
    setLoading(true); setError("");
    try {
      const result = await callArmament<{ status: string }>("checkArmamentSubscriptionPayment", { paymentId });
      setPaymentStatus(result.status);
      if (result.status === "paid") await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Payment status could not be checked. Retry shortly."); }
    finally { setLoading(false); }
  };
  const assignCode = async () => {
    setLoading(true); setError("");
    try {
      const result = await callArmament<{ code: string }>("assignArmamentReferralCode");
      setReferralCode(result.code);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load referral code."); }
    finally { setLoading(false); }
  };
  const redeem = async () => {
    const user = getAuth().currentUser;
    if (!user) return;
    setLoading(true); setError("");
    try {
      const credits = await getDocs(query(collection(getFirestore(), "referralCredits"), where("ownerId", "==", user.uid), where("status", "==", "available")));
      const creditId = credits.docs[0]?.id;
      if (!creditId) throw new Error("No available referral credit.");
      await callArmament("redeemArmamentReferralCredit", { creditId });
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not redeem credit."); }
    finally { setLoading(false); }
  };
  const expiresAt = status?.expiresAt?.toDate?.();
  const active = businessAccess || (status?.status === "active" && expiresAt instanceof Date && expiresAt.getTime() > checkedAt);
  useEffect(() => { onAccessChange?.(active); }, [active, onAccessChange]);
  return <Card>
    <Text style={{ fontWeight: "800", fontSize: 17, color: palette.ink }}>Armament subscription{monthlyAmountMinor === null ? "" : ` · US$${(monthlyAmountMinor / 100).toFixed(2)}/month`}</Text>
    <Text style={{ color: palette.muted }}>{businessAccess ? "Covered by the store owner’s subscription" : active ? "Active until " + expiresAt.toLocaleDateString() : status?.status ? "Status: " + status.status : "No verified active subscription."}</Text>
    <Text style={{ color: palette.muted }}>A verified subscription is shared across authorised Armament apps and business members.</Text>
    <Text style={{ color: palette.muted }}>Paynow offers payment methods enabled for this merchant. Card details are entered only on Paynow. Visa, Mastercard and EcoCash availability depends on merchant configuration.</Text>
    {monthlyAmountMinor === null ? <Text style={{ color: palette.muted }}>Subscription price unavailable.</Text> : null}
    {paymentStatus ? <Text style={{ color: palette.muted }}>Latest payment: {paymentStatus}</Text> : null}
    {paymentId && paymentStatus !== "paid" ? <Action title={loading ? "Checking payment…" : "Check Paynow payment status"} secondary disabled={loading} onPress={() => void checkPayment()} /> : null}
    {error ? <Text style={{ color: "#ae3434" }}>{error}</Text> : null}
    {canPay ? <Action title={loading ? "Opening Paynow…" : paymentStatus === "pending" ? "Payment pending" : ["failed", "cancelled", "error", "rejected", "expired"].includes(paymentStatus) ? "Retry payment" : active ? "Renew subscription with Paynow" : "Subscribe with Paynow"} disabled={loading || monthlyAmountMinor === null || paymentStatus === "pending"} onPress={() => void pay()} /> : <Text style={{ color: palette.muted }}>The store owner manages the subscription for your access.</Text>}
    <Action title="Get referral code" secondary disabled={loading} onPress={() => void assignCode()} />
    {referralCode ? <Text selectable style={{ color: palette.ink }}>Your code: {referralCode}</Text> : null}
    <Text style={{ color: palette.muted }}>Available referral credits: {creditCount}</Text>
    <Action title="Redeem one month credit" secondary disabled={loading || creditCount === 0} onPress={() => void redeem()} />
    <Action title="Refresh status" secondary onPress={() => void refresh()} />
  </Card>;
}
