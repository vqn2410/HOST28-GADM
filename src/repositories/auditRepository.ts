import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { COLLECTIONS } from '@/lib/database/collections';
import { getDb } from '@/lib/database/firebase';
import { getArgentinaNowISO } from '@/lib/utils/formatters';
import type { AuditLog, AuditOperation, RoleId } from '@/types/domain';

export interface CreateAuditInput {
  userDni: string;
  userName: string;
  userRole: RoleId;
  operation: AuditOperation;
  entity: string;
  entityId: string;
  changedFields?: string[];
  previousSummary?: Record<string, unknown> | null;
  newSummary?: Record<string, unknown> | null;
  reason?: string;
}

export async function logAudit(input: CreateAuditInput): Promise<void> {
  try {
    const db = getDb();
    const id = `aud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const entry: AuditLog = {
      id,
      userDni: input.userDni,
      userName: input.userName,
      userRole: input.userRole,
      timestamp: getArgentinaNowISO(),
      operation: input.operation,
      entity: input.entity,
      entityId: input.entityId,
      changedFields: input.changedFields ?? [],
      previousSummary: input.previousSummary ?? null,
      newSummary: input.newSummary ?? null,
      reason: input.reason ?? '',
    };
    await setDoc(doc(db, COLLECTIONS.AUDIT_LOGS, id), entry);
  } catch (err) {
    console.warn('[SGAE Audit] No se pudo registrar auditoría:', err);
  }
}

export async function listAuditLogs(options?: {
  operation?: string;
  entity?: string;
  max?: number;
}): Promise<AuditLog[]> {
  const db = getDb();
  const max = options?.max ?? 200;
  const colRef = collection(db, COLLECTIONS.AUDIT_LOGS);
  const constraints = [];
  if (options?.operation) {
    constraints.push(where('operation', '==', options.operation));
  }
  if (options?.entity) {
    constraints.push(where('entity', '==', options.entity));
  }
  constraints.push(orderBy('timestamp', 'desc'), limit(max));

  try {
    const snap = await getDocs(query(colRef, ...constraints));
    return snap.docs.map((d) => d.data() as AuditLog);
  } catch {
    // Fallback si falta índice compuesto en Firestore
    const snap = await getDocs(query(colRef, orderBy('timestamp', 'desc'), limit(max)));
    let rows = snap.docs.map((d) => d.data() as AuditLog);
    if (options?.operation) rows = rows.filter((r) => r.operation === options.operation);
    if (options?.entity) rows = rows.filter((r) => r.entity === options.entity);
    return rows;
  }
}
