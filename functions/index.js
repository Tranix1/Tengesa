const {onRequest}=require("firebase-functions/v2/https");
const {defineSecret}=require("firebase-functions/params");
const admin=require("firebase-admin");
const crypto=require("node:crypto");
const {activateAfterVerifiedPayment}=require("./subscriptionCore");
if(!admin.apps.length)admin.initializeApp();
const db=admin.firestore();const paynowId=defineSecret("PAYNOW_ID");const paynowKey=defineSecret("PAYNOW_KEY");
const paynowEndpoint="https://www.paynow.co.zw/interface/initiatetransaction";
function configuredMonthlyAmountMinor(){const value=Number(process.env.ARMAMENT_MONTHLY_AMOUNT_MINOR);return Number.isSafeInteger(value)&&value>0?value:null;}
function hash(values,key){return crypto.createHash("sha512").update(values.map(v=>String(v??"")).join("")+key).digest("hex").toUpperCase();}
function responseHashValid(data,key){const submitted=String(data.hash||"").toUpperCase();const values=Object.entries(data).filter(([k])=>k.toLowerCase()!=="hash").map(([,v])=>v);return !!submitted&&hash(values,key)===submitted;}
async function requireUser(req,res){const raw=req.headers.authorization||"";const token=raw.startsWith("Bearer ")?raw.slice(7):"";if(!token){res.status(401).json({error:"Sign in required."});return null;}try{return await admin.auth().verifyIdToken(token);}catch{res.status(401).json({error:"Session expired."});return null;}}
const createArmamentPayment=onRequest({secrets:[paynowId,paynowKey],cors:true},async(req,res)=>{
 if(req.method!=="POST")return res.status(405).json({error:"POST required."});const user=await requireUser(req,res);if(!user)return;
 try{const {businessId,sourceApp="tengesa",returnUrl}=req.body||{};if(!["fynage","murimi","tengesa"].includes(sourceApp))return res.status(400).json({error:"Unknown Armament app."});const amountMinor=configuredMonthlyAmountMinor();if(amountMinor===null)return res.status(503).json({error:"The subscription price is not configured."});const amount=(amountMinor/100).toFixed(2);
  let businessName="Personal account";
  if(sourceApp!=="fynage"){
   if(typeof businessId!=="string"||!businessId)return res.status(400).json({error:"Business or farm account is required."});
   const path=sourceApp==="murimi"?`users/${user.uid}/farmAccounts/${businessId}`:`users/${user.uid}/tengesa/${businessId}`;
   const business=await db.doc(path).get();if(!business.exists||business.data().ownerId!==user.uid)return res.status(403).json({error:"Business access denied."});
   businessName=String(business.data().name||businessName).slice(0,80);
  }
  const paymentId=crypto.randomUUID();const reference=`armament-${paymentId}`;const returnurl=typeof returnUrl==="string"?returnUrl:"fynage://subscription";const resulturl=process.env.PAYNOW_RESULT_URL;if(!resulturl)return res.status(503).json({error:"Subscription payment callback is not configured."});
  const params=[paynowId.value(),reference,amount,`Armament monthly subscription: ${businessName}`,returnurl,resulturl,user.email||"",user.phone_number||"","web"];
  const signature=hash(params,paynowKey.value());const body=new URLSearchParams({id:params[0],reference:params[1],amount:params[2],additionalinfo:params[3],returnurl:params[4],resulturl:params[5],authemail:params[6],phone:params[7],method:params[8],hash:signature});
  const response=await fetch(paynowEndpoint,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body});const text=await response.text();const parsed=Object.fromEntries(new URLSearchParams(text));if(!response.ok||!responseHashValid(parsed,paynowKey.value())||parsed.status!==" ok"&&parsed.status!=="ok")return res.status(502).json({error:"Paynow did not accept this payment request."});
  await db.doc(`subscriptionPayments/${paymentId}`).create({id:paymentId,ownerId:user.uid,businessId:businessId||null,sourceApp,provider:"paynow",reference,status:"pending",amountMinor,currency:"USD",pollUrl:parsed.pollurl||parsed.pollUrl,createdAt:admin.firestore.FieldValue.serverTimestamp(),returnUrl});return res.json({paymentId,redirectUrl:parsed.browserurl||parsed.browserUrl,status:"pending"});
 }catch(error){console.error("Payment initiation failed",error);return res.status(500).json({error:"Could not start payment. Please retry."});}
});
exports.createArmamentPayment=createArmamentPayment;
exports.createTengesaPayment=createArmamentPayment;
async function finalizePaid(uid,attemptId,poll){
 await activateAfterVerifiedPayment({db,admin,uid,attemptId,payment:poll});
}
exports.paynowResult=onRequest({secrets:[paynowKey]},async(req,res)=>{
 try{const values=Object.fromEntries(new URLSearchParams(typeof req.body==="string"?req.body:""));const incoming={...req.query,...req.body,...values};if(!responseHashValid(incoming,paynowKey.value()))return res.status(400).send("Invalid callback signature");const reference=String(incoming.reference||"");const snap=await db.collection("subscriptionPayments").where("reference","==",reference).limit(1).get();if(snap.empty)return res.status(404).send("Unknown payment");const attempt=snap.docs[0];const pollUrl=attempt.data().pollUrl;if(!pollUrl)return res.status(400).send("Missing payment poll reference");const pollResponse=await fetch(pollUrl);const poll=Object.fromEntries(new URLSearchParams(await pollResponse.text()));if(!pollResponse.ok||!responseHashValid(poll,paynowKey.value()))return res.status(400).send("Unverified payment status");if(poll.status==="Paid")await finalizePaid(attempt.data().ownerId,attempt.id,poll);else await attempt.ref.set({status:String(poll.status||"pending").toLowerCase(),providerStatus:poll.status,checkedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});return res.status(200).send("OK");}catch(error){console.error("Paynow callback failed",error);return res.status(500).send("Callback processing failed");}
});
exports.redeemSubscriptionCredit=onRequest({cors:true},async(req,res)=>{
 if(req.method!=="POST")return res.status(405).json({error:"POST required."});const user=await requireUser(req,res);if(!user)return;
 try{const creditsRef=db.collection("referralCredits").where("ownerId","==",user.uid).where("status","==","available").limit(1);const subRef=db.doc(`subscriptions/${user.uid}`);let applied=false;await db.runTransaction(async tx=>{const [credits,sub]=await Promise.all([tx.get(creditsRef),tx.get(subRef)]);if(credits.empty)return;const credit=credits.docs[0];const current=sub.data();const base=current?.status==="active"&&current.expiresAt?.toMillis()>Date.now()?current.expiresAt.toMillis():Date.now();tx.update(credit.ref,{status:"redeemed",redeemedAt:admin.firestore.FieldValue.serverTimestamp(),redeemedBy:user.uid});tx.set(subRef,{ownerId:user.uid,status:"active",plan:"monthly",priceMinor:0,currency:"USD",expiresAt:admin.firestore.Timestamp.fromMillis(base+30*86400000),lastCreditId:credit.id,source:"referral_credit",updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});applied=true;});if(!applied)return res.status(409).json({error:"No available subscription credit."});return res.json({status:"active",creditApplied:true});}catch(error){console.error("Credit redemption failed",error);return res.status(400).json({error:error.message||"Could not apply credit."});}
});
