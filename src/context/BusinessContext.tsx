import React,{createContext,useCallback,useContext,useEffect,useState,type ReactNode} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { AppState } from "react-native";
import { useAuth } from "@/context/AuthContext";
import type { Business } from "@/types/retail";
import { createBusiness,listBusinesses } from "@/services/retailRepository";
import { syncRetailOwner } from "@/services/retailSync";
type Value={businesses:Business[];business:Business|null;loading:boolean;refresh:()=>Promise<void>;addBusiness:(name:string,type:Business["type"],currency:string)=>Promise<Business>;selectBusiness:(id:string)=>Promise<void>};
const Context=createContext<Value|null>(null);
export function BusinessProvider({children}:{children:ReactNode}){
 const {user}=useAuth();const uid=user?.uid;const[ businesses,setBusinesses]=useState<Business[]>([]);const[activeId,setActiveId]=useState("");const[loading,setLoading]=useState(true);
 const refresh=useCallback(async()=>{if(!uid){setBusinesses([]);setLoading(false);return;}setLoading(true);try{const values=await listBusinesses(uid);setBusinesses(values);const saved=await AsyncStorage.getItem(`tengesa_active_business_${uid}`);setActiveId(values.some(x=>x.id===saved)?saved!:values[0]?.id??"");}finally{setLoading(false);}},[uid]);
 // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate local business state after auth changes.
 useEffect(()=>{void refresh();},[refresh]);
 useEffect(()=>{if(!user?.uid)return;const run=()=>{void NetInfo.fetch().then(n=>{if(n.isConnected&&n.isInternetReachable!==false)void syncRetailOwner(user.uid).catch(e=>console.warn("Retail sync deferred",e));});};run();const unsub=NetInfo.addEventListener(s=>{if(s.isConnected&&s.isInternetReachable!==false)run();});const app=AppState.addEventListener("change",s=>{if(s==="active")run();});return()=>{unsub();app.remove();};},[user?.uid]);
 const addBusiness=async(name:string,type:Business["type"],currency:string)=>{if(!user)throw new Error("Sign in again to create a business.");const value=await createBusiness(user.uid,name,type,currency);await refresh();setActiveId(value.id);return value;};
 const selectBusiness=async(id:string)=>{if(!businesses.some(x=>x.id===id))return;setActiveId(id);if(user)await AsyncStorage.setItem(`tengesa_active_business_${user.uid}`,id);};
 return <Context.Provider value={{businesses,business:businesses.find(x=>x.id===activeId)??null,loading,refresh,addBusiness,selectBusiness}}>{children}</Context.Provider>;
}
export function useBusiness(){const value=useContext(Context);if(!value)throw new Error("useBusiness must be inside BusinessProvider");return value;}
