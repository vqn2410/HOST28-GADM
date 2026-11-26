import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

let adminApp: App | null = null;
let adminDb: Firestore | null = null;

export function getAdminDb(): Firestore {
  if (adminDb) return adminDb;

  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!rawServiceAccount) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON no está configurada en las variables de entorno del servidor.'
    );
  }

  let parsed: Record<string, string>;
  try {
    const decoded = rawServiceAccount.trim().startsWith('{')
      ? rawServiceAccount
      : Buffer.from(rawServiceAccount, 'base64').toString('utf8');
    parsed = JSON.parse(decoded);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON tiene formato inválido.');
  }

  adminApp =
    getApps().length > 0
      ? getApps()[0]
      : initializeApp({
          credential: cert({
            projectId: parsed.project_id,
            clientEmail: parsed.client_email,
            privateKey: parsed.private_key?.replace(/\\n/g, '\n'),
          }),
        });

  adminDb = getFirestore(adminApp);
  return adminDb;
}
