import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// The integrated workspace installs Firebase Admin with Murimi's shared
// backend test dependencies; Tengesa Functions also declares it for deployment.
const adminModule = process.env.ARMAMENT_ADMIN_MODULE || "../../Murimi/functions/node_modules/firebase-admin";
const admin = require(adminModule);
const { activateAfterVerifiedPayment, addCalendarMonth } = require("../functions/subscriptionCore");
const app = admin.apps.length ? admin.app() : admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-armament-payments" });
const db = admin.firestore(app);

test("verified payment activates a shared subscription and awards one referral credit idempotently", async () => {
  const uid = "referred-user";
  const attemptId = "payment-first";
  const nowMs = Date.now();
  const attempt = db.doc(`subscriptionPayments/${attemptId}`);
  await attempt.set({ id: attemptId, ownerId: uid, sourceApp: "tengesa", amountMinor: 100, currency: "USD", status: "pending" });
  await db.doc(`referralAttributions/${uid}`).set({ referredUid: uid, referrerUid: "referrer-user", status: "attributed" });

  const result = await activateAfterVerifiedPayment({ db, admin, uid, attemptId, payment: { status: "Paid", amount: "1.00" }, nowMs });
  assert.equal(result.activated, true);
  const subscription = await db.doc(`subscriptions/${uid}`).get();
  assert.equal(subscription.get("status"), "active");
  assert.equal(subscription.get("expiresAt").toMillis(), addCalendarMonth(nowMs));
  assert.equal((await db.doc(`referralCredits/${result.creditId}`).get()).get("status"), "available");

  const repeated = await activateAfterVerifiedPayment({ db, admin, uid, attemptId, payment: { status: "Paid", amount: "1.00" }, nowMs });
  assert.equal(repeated.activated, false);
  const credits = await db.collection("referralCredits").where("ownerId", "==", "referrer-user").get();
  assert.equal(credits.size, 1);
  assert.equal((await db.doc(`subscriptions/${uid}`).get()).get("expiresAt").toMillis(), addCalendarMonth(nowMs));
  const renewalId = "payment-renewal";
  await db.doc(`subscriptionPayments/${renewalId}`).set({ id: renewalId, ownerId: uid, sourceApp: "murimi", amountMinor: 100, status: "pending" });
  const renewed = await activateAfterVerifiedPayment({ db, admin, uid, attemptId: renewalId, payment: { status: "Paid", amount: "1.00" }, nowMs: nowMs + 86400000 });
  assert.equal(renewed.activated, true);
  const renewedExpiry = await db.doc(`subscriptions/${uid}`).get();
  assert.equal(renewedExpiry.get("expiresAt").toMillis(), addCalendarMonth(addCalendarMonth(nowMs)));
  assert.equal((await db.collection("referralCredits").where("ownerId", "==", "referrer-user").get()).size, 1);
});

test("unverified, wrong-amount and self-referral payments cannot grant access or credits", async () => {
  const uid = "self-referred";
  const attemptId = "payment-invalid";
  const attempt = db.doc(`subscriptionPayments/${attemptId}`);
  await attempt.set({ id: attemptId, ownerId: uid, sourceApp: "murimi", amountMinor: 100, status: "pending" });
  await db.doc(`referralAttributions/${uid}`).set({ referredUid: uid, referrerUid: uid, status: "attributed" });
  const wrongAmount = await activateAfterVerifiedPayment({ db, admin, uid, attemptId, payment: { status: "Paid", amount: "9.00" } });
  assert.equal(wrongAmount.activated, false);
  const unverified = await activateAfterVerifiedPayment({ db, admin, uid, attemptId, payment: { status: "Pending", amount: "1.00" } });
  assert.equal(unverified.activated, false);
  assert.equal((await db.doc(`subscriptions/${uid}`).get()).exists, false);
  const selfPaid = await activateAfterVerifiedPayment({ db, admin, uid, attemptId, payment: { status: "Paid", amount: "1.00" } });
  assert.equal(selfPaid.activated, true);
  assert.equal((await db.collection("referralCredits").where("ownerId", "==", uid).get()).size, 0);
});
