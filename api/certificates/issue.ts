import crypto from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdminDb } from '../_lib/firebaseAdmin';

/**
 * Endpoint privilegiado para generar tokens criptográficamente seguros y numeración
 * correlativa atómica desde el servidor (Vercel Serverless + Firebase Admin SDK).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const { issueYear } = req.body ?? {};
    const year = /^\d{4}$/.test(String(issueYear))
      ? String(issueYear)
      : String(new Date().getFullYear());

    const db = getAdminDb();
    const counterRef = db.collection('sgae_certificate_counters').doc(year);

    const seq = await db.runTransaction(async (tx) => {
      const snap = await tx.get(counterRef);
      const current = snap.exists ? Number(snap.data()?.lastSequence || 0) : 0;
      const next = current + 1;
      tx.set(
        counterRef,
        {
          year,
          lastSequence: next,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      return next;
    });

    const token = crypto.randomBytes(24).toString('base64url');
    const certificateNumber = `${year}-${String(seq).padStart(6, '0')}`;

    return res.status(200).json({ certificateNumber, token });
  } catch (err) {
    console.error('[API /certificates/issue]', err);
    return res.status(500).json({ error: 'No se pudo generar el identificador documental.' });
  }
}
