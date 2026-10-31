import { getFirestore, collection, doc, getDocs, runTransaction, setDoc } from "@react-native-firebase/firestore";
import type { OutboxEntry, Sale } from "@/types/retail";
import { incrementOutboxAttempt, listBusinesses, markOutboxSynced, mergeRemoteRecords, pendingOutbox } from "@/services/retailRepository";

// Tenant path matches the user's own business data. Each source transaction ID is stable.
const recordRef = (uid:string, entry:OutboxEntry) => doc(collection(getFirestore(),"users",uid,"tengesa",entry.collection_name),entry.record_id);
export async function syncRetailOwner(uid:string){
  const queue=await pendingOutbox(uid); let synced=0; let failed=0;
  for(const entry of queue){
    try{
      const db=getFirestore();
      if(entry.operation==="sale"){
        const sale=JSON.parse(entry.payload) as Sale;
        await runTransaction(db,async tx=>{
          const saleDoc=recordRef(uid,entry); const prior=await tx.get(saleDoc); if(prior.exists())return;
          const products=sale.lines.map(line=>({line,ref:doc(collection(db,"users",uid,"tengesa","products"),line.productId)}));
          const snapshots=[];for(const item of products)snapshots.push(await tx.get(item.ref));
          for(let i=0;i<products.length;i++){
            const {line,ref}=products[i];const snapshot=snapshots[i];if(!snapshot.exists())throw new Error("Product is missing from cloud inventory.");
            const product=snapshot.data();if(!product||product.businessId!==entry.business_id||product.ownerId!==uid)throw new Error("Product ownership check failed.");
            if(Number(product.quantityOnHand)<line.quantity)throw new Error(`Not enough cloud stock for ${line.name}; sale remains pending.`);
            tx.update(ref,{quantityOnHand:Number(product.quantityOnHand)-line.quantity,updatedAt:sale.soldAt});
          }
          tx.set(saleDoc,{...sale,syncStatus:"synced"});
          for(const line of sale.lines){const movementId=`${sale.id}:${line.productId}:sale`;tx.set(doc(collection(db,"users",uid,"tengesa","movements"),movementId),{id:movementId,ownerId:uid,businessId:entry.business_id,productId:line.productId,type:"sale",quantityDelta:-line.quantity,sourceRecordId:sale.id,occurredAt:sale.soldAt});}
          const base={ownerId:uid,businessId:entry.business_id,currency:sale.currency,category:"retail_sale",occurredAt:sale.soldAt,createdAt:sale.createdAt,updatedAt:sale.updatedAt,sourceApp:"tengesa",sourceCollection:"sales",revision:1};
          tx.set(doc(collection(db,"users",uid,"financial_ledger"),`${sale.id}:revenue`),{...base,id:`${sale.id}:revenue`,sourceRecordId:`${sale.id}:revenue`,sourceTransactionId:sale.id,type:"income",direction:"in",amountMinor:sale.totalMinor,description:`Tengesa sale ${sale.receiptNumber}`});
          if(sale.costOfGoodsMinor>0)tx.set(doc(collection(db,"users",uid,"financial_ledger"),`${sale.id}:cogs`),{...base,id:`${sale.id}:cogs`,sourceRecordId:`${sale.id}:cogs`,sourceTransactionId:sale.id,type:"expense",direction:"out",amountMinor:sale.costOfGoodsMinor,category:"cost_of_goods_sold",description:`Cost of goods for ${sale.receiptNumber}`});
        });
      }else{
        const data=JSON.parse(entry.payload); await setDoc(recordRef(uid,entry),data,{merge:true});
        if(entry.collection_name==="expenses")await setDoc(doc(collection(getFirestore(),"users",uid,"financial_ledger"),`${entry.record_id}:expense`),{id:`${entry.record_id}:expense`,ownerId:uid,businessId:entry.business_id,sourceApp:"tengesa",sourceRecordId:`${entry.record_id}:expense`,sourceTransactionId:entry.record_id,sourceCollection:"expenses",type:"expense",direction:"out",amountMinor:data.amountMinor,currency:data.currency,category:data.category,description:data.description,occurredAt:data.expenseDate,createdAt:data.createdAt,updatedAt:data.updatedAt,revision:1},{merge:true});
      }
      await markOutboxSynced(entry.operation_id);synced++;
    }catch(error){await incrementOutboxAttempt(entry.operation_id);failed++;console.warn("Tengesa sync pending",entry.record_id,error);}
  }
  try{
    const db=getFirestore();const businessSnapshot=await getDocs(collection(db,"users",uid,"tengesa","businesses"));
    const remoteBusinesses=businessSnapshot.docs.map(item=>({...item.data(),id:item.id}));
    await mergeRemoteRecords(uid,"","businesses",remoteBusinesses);
    const localBusinesses=await listBusinesses(uid);
    for(const business of localBusinesses){
      for(const collectionName of ["products","sales","expenses","movements"]){
        const snapshot=await getDocs(collection(db,"users",uid,"tengesa",collectionName));
        await mergeRemoteRecords(uid,business.id,collectionName,snapshot.docs.map(item=>({...item.data(),id:item.id})));
      }
    }
  }catch(error){console.warn("Tengesa cloud download will retry when connected.",error);}
  return {synced,failed,pending:queue.length-synced};
}
