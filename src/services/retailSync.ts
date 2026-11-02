import { getFirestore, collection, doc, getDoc, getDocs, setDoc } from "@react-native-firebase/firestore";
import type { OutboxEntry, Sale } from "@/types/retail";
import { sharedCustomerId } from "@/contracts/armament";
import { incrementOutboxAttempt, listBusinesses, markOutboxSynced, mergeRemoteRecords, pendingOutbox, saveSharedBusiness } from "@/services/retailRepository";
import { callArmament } from "@/services/armamentApi";

// Tenant path matches the user's own business data. Each source transaction ID is stable.
const recordRef = (uid:string, entry:OutboxEntry) => entry.collection_name === "businesses"
  ? doc(getFirestore(),"users",uid,"tengesa",entry.business_id)
  : doc(collection(getFirestore(),"users",uid,"tengesa",entry.business_id,entry.collection_name),entry.record_id);
export async function syncRetailOwner(uid:string){
  const db=getFirestore();
  let sharedBusinesses:{id:string;ownerId:string;name:string;sourceApp:string;sourceId:string;role:string}[]=[];
  try {
    sharedBusinesses=(await callArmament<{businesses:typeof sharedBusinesses}>("listArmamentBusinesses")).businesses;
    let localBusinesses=await listBusinesses(uid);
    for(const business of localBusinesses){
      const shared=sharedBusinesses.find(item=>item.sourceApp==="tengesa"&&item.sourceId===business.id);
      if(!shared){
        await setDoc(doc(db,"users",uid,"tengesa",business.id),{...business,ownerId:uid,id:business.id},{merge:true});
        const registered=await callArmament<{businessId:string}>("registerArmamentBusiness",{sourceApp:"tengesa",sourceId:business.id});
        sharedBusinesses.push({id:registered.businessId,ownerId:uid,name:business.name,sourceApp:"tengesa",sourceId:business.id,role:"owner"});
      }
    }
    for(const shared of sharedBusinesses.filter(item=>item.sourceApp==="tengesa"&&["owner","admin","employee"].includes(item.role))){
      if(!(await listBusinesses(uid)).some(item=>item.id===shared.sourceId)){
        const remote=await getDoc(doc(db,"users",shared.ownerId,"tengesa",shared.sourceId));
        if(remote.exists()){
          const data=remote.data();
          await saveSharedBusiness(uid,{...data,id:shared.sourceId,ownerId:uid,name:String(data.name??shared.name),currency:String(data.currency??"USD"),type:data.type??"retail",status:data.status??"active",allowNegativeStock:Boolean(data.allowNegativeStock),createdAt:String(data.createdAt??new Date().toISOString()),updatedAt:String(data.updatedAt??new Date().toISOString()),sourceOwnerId:shared.ownerId,sharedRole:shared.role as "owner"|"admin"|"employee"|"investor"});
        }
      }
      const allowedCollections = shared.role === "employee" ? ["products", "movements"] : ["products", "sales", "expenses", "movements", "customers"];
      for(const collectionName of allowedCollections){
        const snapshot=await getDocs(collection(db,"users",shared.ownerId,"tengesa",shared.sourceId,collectionName));
        await mergeRemoteRecords(uid,shared.sourceId,collectionName,snapshot.docs.map(item=>({...item.data(),id:item.id,ownerId:uid,businessId:shared.sourceId})));
      }
    }
  } catch(error) { console.warn("Armament business membership sync will retry when connected.",error); }
  const queue=await pendingOutbox(uid); let synced=0; let failed=0;
  for(const entry of queue){
    try{
      if(entry.operation==="sale"){
        const sale=JSON.parse(entry.payload) as Sale;
        let shared=sharedBusinesses.find(item=>item.sourceApp==="tengesa"&&item.sourceId===entry.business_id);
        if(!shared){
          await setDoc(doc(db,"users",uid,"tengesa",entry.business_id),{id:entry.business_id,ownerId:uid,name:"Store",currency:sale.currency},{merge:true});
          const registered=await callArmament<{businessId:string}>("registerArmamentBusiness",{sourceApp:"tengesa",sourceId:entry.business_id});
          shared={id:registered.businessId,ownerId:uid,name:"Store",sourceApp:"tengesa",sourceId:entry.business_id,role:"owner"};sharedBusinesses.push(shared);
        }
        await callArmament("recordArmamentTengesaSale",{businessId:shared.id,sale:{id:sale.id,receiptNumber:sale.receiptNumber,paymentMethod:sale.paymentMethod,customerId:sale.customerId??null,lines:sale.lines.map(line=>({productId:line.productId,quantity:line.quantity}))}});
      }else{
        const data=JSON.parse(entry.payload);
        if(entry.collection_name==="expenses"){
          let shared=sharedBusinesses.find(item=>item.sourceApp==="tengesa"&&item.sourceId===entry.business_id);
          if(!shared){
            await setDoc(doc(db,"users",uid,"tengesa",entry.business_id),{id:entry.business_id,ownerId:uid,name:"Store",currency:data.currency??"USD"},{merge:true});
            const registered=await callArmament<{businessId:string}>("registerArmamentBusiness",{sourceApp:"tengesa",sourceId:entry.business_id});
            shared={id:registered.businessId,ownerId:uid,name:"Store",sourceApp:"tengesa",sourceId:entry.business_id,role:"owner"};sharedBusinesses.push(shared);
          }
          await callArmament("recordArmamentTengesaExpense",{businessId:shared.id,expense:{...data,id:entry.record_id}});
        }else{
          await setDoc(recordRef(uid,entry),data,{merge:true});
        }
        if(entry.collection_name==="customers"){
          const id=sharedCustomerId({sourceApp:"tengesa",ownerId:uid,businessId:entry.business_id,sourceCollection:"customers",sourceDocumentId:entry.record_id});
          await setDoc(doc(getFirestore(),"customerLedger",id),{id,ownerId:uid,businessId:entry.business_id,accountId:entry.business_id,sourceApp:"tengesa",sourceCollection:"customers",sourceDocumentId:entry.record_id,name:data.name,phone:data.phone??null,active:data.active!==false,createdAt:data.createdAt,updatedAt:data.updatedAt},{merge:true});
        }
      }
      await markOutboxSynced(entry.operation_id);synced++;
    }catch(error){await incrementOutboxAttempt(entry.operation_id);failed++;console.warn("Tengesa sync pending",entry.record_id,error);}
  }
  try{
    const db=getFirestore();
    const localBusinesses=await listBusinesses(uid);
    for(const business of localBusinesses){
      const sourceOwnerId=String((business as typeof business&{sourceOwnerId?:string}).sourceOwnerId??uid);
      if(sourceOwnerId===uid){
        const businessSnapshot=await getDocs(collection(db,"users",uid,"tengesa"));
        await mergeRemoteRecords(uid,"","businesses",businessSnapshot.docs.map(item=>({...item.data(),id:item.id})));
      }
      const sharedRole=String((business as typeof business&{sharedRole?:string}).sharedRole??"owner");
      const allowedCollections = sharedRole === "employee" ? ["products", "movements"] : ["products", "sales", "expenses", "movements", "customers"];
      for(const collectionName of allowedCollections){
        const snapshot=await getDocs(collection(db,"users",sourceOwnerId,"tengesa",business.id,collectionName));
        await mergeRemoteRecords(uid,business.id,collectionName,snapshot.docs.map(item=>({...item.data(),id:item.id,ownerId:uid,businessId:business.id})));
      }
    }
  }catch(error){console.warn("Tengesa cloud download will retry when connected.",error);}
  return {synced,failed,pending:queue.length-synced};
}
