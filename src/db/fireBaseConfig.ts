import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Keep the modular Firebase SDK on this app's native Armament registration.
export const firebaseConfig = {
  apiKey: "AIzaSyDW6CHv887ClF4nVTzGa28vzI9Jd1hqa0Y",
  authDomain: "armament-f5a0b.firebaseapp.com",
  projectId: "armament-f5a0b",
  storageBucket: "armament-f5a0b.firebasestorage.app",
  messagingSenderId: "853368688021",
  appId: "1:853368688021:android:ea743e90ba910267b53a9c",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);

// AI is optional and must not initialize while the application bundle is loading.
let modelPromise: Promise<any> | undefined;
export async function getVertexModel(): Promise<any> {
  if (!modelPromise) modelPromise = Promise.reject(new Error("AI analysis is not configured for Tengesa."));
  return modelPromise;
}
