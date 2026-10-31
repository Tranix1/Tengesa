# Tengesa implementation notes

## Local-first retail data

The POS stores businesses, products, completed sales, expenses, stock movements, and a retryable outbox in `tengesa-retail.db` (Expo SQLite). Records include Firebase owner and business IDs. Sales write the receipt, stock deductions, and stock movements in one SQLite transaction. The same stable sale ID is used for every retry. Once online, the native Firebase Firestore sync writes owner-scoped records and applies a sale, stock deductions, movements, and financial entries in one Firestore transaction. Downloads merge cloud records only when there is no pending local edit.

The Fynage ledger entries use `/users/{uid}/financial_ledger/{id}` and have `sourceApp: "tengesa"`, a source collection, unique sale-entry source IDs, and the originating sale ID. Revenue and cost of goods sold are separate entries. Fynage currently filters out `sourceApp: "tengesa"`, so the records are created but are not yet included in its UI or totals. Fynage’s schema/allowlist must be updated and its rules must permit Tengesa entries before this is a complete user-visible integration.

## Firebase and Paynow

The Android native Firebase configuration selects project `armament-f5a0b`, which contains `com.armament.tengesa`. The old JavaScript Firebase configuration still points to `transix-470b3` and is used only by legacy code; the POS sync uses native Firebase. The project includes `functions/` with server-owned Paynow initiation, signature checking, status polling, idempotent subscription activation, and subscription-credit redemption. Configure `PAYNOW_ID`, `PAYNOW_KEY`, and `PAYNOW_RESULT_URL` in the Armament Firebase Functions environment before deployment.

`firestore.tengesa.rules` is a merge fragment for the existing shared `/users/{uid}` rules. It must be merged with Armament’s current rules. Do not deploy it as a complete rules file: replacing shared rules would affect Fynage, Murimi, and Transix. The repo does not confirm which rules are deployed.

Paynow initiation and Firebase payment verification were not run because merchant credentials, callback URL, Firebase project access, and the deployed server are not available here. The app reports only the subscription document written by the server as active. The shared referral-code validation/attribution contract has not been confirmed; referral rewards are therefore not enabled, and the subscription-credit server path only applies to a qualifying attribution already recorded by a trusted service.

## Verification

`npm test` covers sale line arithmetic and dashboard revenue, gross profit, expenses, cash, stock value, and low-stock calculations. SQLite/Firebase transactions, OTP auth, cross-device synchronization, Paynow, and deployed security rules need an Android device or configured Firebase/Paynow environment for end-to-end verification.

Run the app with `npx expo start`. Build Android with `npx eas-cli build --profile development --platform android` (or use the production profile for release builds).
