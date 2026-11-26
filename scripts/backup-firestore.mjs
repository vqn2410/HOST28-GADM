import { initializeApp } from 'firebase/app';
import { collection, getDocs, getFirestore } from 'firebase/firestore';
import fs from 'node:fs';
import path from 'node:path';

// Script de respaldo previo no destructivo de las colecciones compartidas de HOST28_EF
const config = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

if (!config.apiKey || !config.projectId) {
  console.error('Faltan variables VITE_FIREBASE_* en el entorno. Ejecutá con: node --env-file=.env.local scripts/backup-firestore.mjs');
  process.exit(1);
}

const app = initializeApp(config);
const db = getFirestore(app);

async function backup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.resolve(process.cwd(), 'backups');
  fs.mkdirSync(outDir, { recursive: true });

  const collections = ['alumnos', 'usuarios'];
  const payload = { exportedAt: new Date().toISOString(), projectId: config.projectId, data: {} };

  for (const col of collections) {
    const snap = await getDocs(collection(db, col));
    payload.data[col] = snap.docs.map((d) => ({ _id: d.id, ...d.data() }));
    console.log(`[Backup] ${col}: ${snap.size} documentos respaldados.`);
  }

  const outFile = path.join(outDir, `backup_${config.projectId}_${timestamp}.json`);
  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`Respaldo guardado en: ${outFile}`);
  process.exit(0);
}

backup().catch((err) => {
  console.error('Error al generar respaldo:', err);
  process.exit(1);
});
