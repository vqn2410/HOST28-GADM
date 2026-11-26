import { initializeApp, cert, getApps, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

let adminApp: App | null = null;

export function getAdminFirestore(): Firestore | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;

  if (!adminApp) {
    if (getApps().length > 0) {
      adminApp = getApps()[0];
    } else {
      const jsonStr = raw.trim().startsWith('{')
        ? raw
        : Buffer.from(raw, 'base64').toString('utf8');
      const serviceAccount = JSON.parse(jsonStr);
      adminApp = initializeApp({
        credential: cert(serviceAccount),
      });
    }
  }
  return getFirestore(adminApp);
}
