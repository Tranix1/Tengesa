"use strict";

const crypto = require("node:crypto");

function addCalendarMonth(timestampMs) {
  const value = new Date(timestampMs);
  const day = value.getUTCDate();
  value.setUTCDate(1);
  value.setUTCMonth(value.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0)).getUTCDate();
  value.setUTCDate(Math.min(day, lastDay));
  return value.getTime();
}

/**
 * Applies an already provider-verified Paynow result. This function is called
 * only after the callback signature and provider poll response are verified.
 */
async function activateAfterVerifiedPayment({ db, admin, uid, attemptId, payment, nowMs = Date.now() }) {
  const attemptRef = db.doc(`subscriptionPayments/${attemptId}`);
  const subscriptionRef = db.doc(`subscriptions/${uid}`);
  const attributionRef = db.doc(`referralAttributions/${uid}`);
  const creditId = crypto.createHash("sha256").update(`referral:${uid}:${attemptId}`).digest("hex");
  const creditRef = db.doc(`referralCredits/${creditId}`);
  let activated = false;
  await db.runTransaction(async (tx) => {
    const [attempt, subscription, attribution, credit] = await Promise.all([
      tx.get(attemptRef), tx.get(subscriptionRef), tx.get(attributionRef), tx.get(creditRef),
    ]);
    if (!attempt.exists || attempt.get("status") === "paid") return;
    const attemptData = attempt.data();
    if (payment?.status !== "Paid" || Number(payment.amount) !== Number(attemptData.amountMinor) / 100) return;
    const current = subscription.data();
    const currentExpiry = current?.status === "active" && current.expiresAt?.toMillis() > nowMs
      ? current.expiresAt.toMillis()
      : nowMs;
    const expiry = admin.firestore.Timestamp.fromMillis(addCalendarMonth(currentExpiry));
    tx.set(subscriptionRef, {
      ownerId: uid,
      status: "active",
      plan: "monthly",
      priceMinor: attemptData.amountMinor,
      currency: attemptData.currency || "USD",
      expiresAt: expiry,
      lastPaymentId: attemptId,
      sourceApp: attemptData.sourceApp || "tengesa",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.update(attemptRef, {
      status: "paid",
      verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      providerStatus: payment.status,
    });
    const referrerUid = attribution.data()?.referrerUid;
    if (attribution.exists && attribution.data().status === "attributed" && referrerUid && referrerUid !== uid && !credit.exists) {
      tx.create(creditRef, {
        id: creditId,
        ownerId: referrerUid,
        referredUid: uid,
        sourceApp: attemptData.sourceApp || "tengesa",
        sourcePaymentId: attemptId,
        creditMonths: 1,
        status: "available",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      tx.update(attributionRef, {
        status: "rewarded",
        qualifyingPaymentId: attemptId,
        rewardedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    activated = true;
  });
  return { activated, creditId };
}

module.exports = { activateAfterVerifiedPayment, addCalendarMonth };
