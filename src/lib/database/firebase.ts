import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { initializeFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId
);

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;

if (isFirebaseConfigured) {
  app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
  db = initializeFirestore(app, { ignoreUndefinedProperties: true });
  storage = getStorage(app);
}

export function getDb(): Firestore {
  if (!db) {
    throw new Error(
      'Firebase no está configurado. Verificá las variables VITE_FIREBASE_* en .env.local.'
    );
  }
  return db;
}

export function getFirebaseStorage(): FirebaseStorage | null {
  return storage;
}

export { app, db, storage };
