import React,{useCallback,useState}from"react";
import{Linking,Text}from"react-native";
import{useFocusEffect}from"expo-router";
import{collection,doc,getDoc,getFirestore}from"@react-native-firebase/firestore";
import{getAuth}from"@react-native-firebase/auth";
import{Action,Card}from"@/components/RetailUI";
import{palette}from"@/app/index";

const paymentEndpoint="https://us-central1-armament-f5a0b.cloudfunctions.net/createTengesaPayment";
export default function SubscriptionPanel({businessId}:{businessId:string}){
 const[status,setStatus]=useState<any>(null);const[loading,setLoading]=useState(false);const[error,setError]=useState("");const[checkedAt,setCheckedAt]=useState(0);
 const refresh=useCallback(async()=>{const uid=getAuth().currentUser?.uid;if(!uid)return;try{const snap=await getDoc(doc(collection(getFirestore(),"users",uid,"subscriptions"),"tengesa"));setStatus(snap.exists()?snap.data():null);setCheckedAt(Date.now());}catch{setError("Subscription status is unavailable. Connect to the internet and retry.");}},[]);
 useFocusEffect(useCallback(()=>{void refresh();},[refresh]));
 const pay=async()=>{const user=getAuth().currentUser;if(!user)return;setLoading(true);setError("");try{const token=await user.getIdToken();const response=await fetch(paymentEndpoint,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({businessId,returnUrl:"tengesa://subscription"})});const result=await response.json();if(!response.ok)throw new Error(result.error||"Payment could not be started.");if(!result.redirectUrl)throw new Error("Paynow did not return a payment page.");await Linking.openURL(result.redirectUrl);}catch(e){setError(e instanceof Error?e.message:"Could not start payment. Try again later.");}finally{setLoading(false);}};
 const active=status?.status==="active"&&status?.expiresAt?.toDate?.().getTime()>checkedAt;
 return <Card><Text style={{fontWeight:"800",fontSize:17,color:palette.ink}}>Tengesa · US$1/month</Text><Text style={{color:palette.muted}}>{active?`Active until ${status.expiresAt.toDate().toLocaleDateString()}`:status?.status?`Status: ${status.status}`:"No verified active subscription."}</Text><Text style={{color:palette.muted}}>Only a server-verified Paynow payment activates the plan.</Text>{error?<Text style={{color:"#ae3434"}}>{error}</Text>:null}<Action title={loading?"Opening Paynow…":"Pay US$1 with Paynow"} disabled={loading||active} onPress={()=>void pay()}/><Action title="Refresh status" secondary onPress={()=>void refresh()}/></Card>;
}
