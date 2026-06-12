import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer, collection, getDocs, runTransaction, Transaction } from 'firebase/firestore';
import firebaseConfig from '@/firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Explicitly set persistence to local
setPersistence(auth, browserLocalPersistence).catch(err => {
  console.error("Auth persistence error:", err);
});

// Cache storage for static/lookup tables
let cachedBranches: any[] | null = null;
let cachedFamilies: any[] | null = null;
let cachedSkus: any[] | null = null;

export const clearCache = (collectionName?: 'branches' | 'lensFamilies' | 'lensSkus') => {
  if (!collectionName) {
    cachedBranches = null;
    cachedFamilies = null;
    cachedSkus = null;
  } else if (collectionName === 'branches') {
    cachedBranches = null;
  } else if (collectionName === 'lensFamilies') {
    cachedFamilies = null;
  } else if (collectionName === 'lensSkus') {
    cachedSkus = null;
  }
};

export async function getCachedBranches(forceRefresh = false): Promise<any[]> {
  if (!cachedBranches || forceRefresh) {
    const snap = await getDocs(collection(db, 'branches'));
    cachedBranches = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  return cachedBranches;
}

export async function getCachedFamilies(forceRefresh = false): Promise<any[]> {
  if (!cachedFamilies || forceRefresh) {
    const snap = await getDocs(collection(db, 'lensFamilies'));
    cachedFamilies = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  return cachedFamilies;
}

export async function getCachedSkus(forceRefresh = false): Promise<any[]> {
  if (!cachedSkus || forceRefresh) {
    const snap = await getDocs(collection(db, 'lensSkus'));
    cachedSkus = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  return cachedSkus;
}

// Error Handling according to integration guidelines
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Global utility to force atomic transactions on Firestore operations.
 * Prevents race conditions and ensures consistency, especially during stock updates.
 */
export async function executeTransaction<T>(
  action: (transaction: Transaction) => Promise<T>,
  pathContextForError = 'transaction'
): Promise<T> {
  try {
    return await runTransaction(db, action);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, pathContextForError);
    throw error;
  }
}

// Test connection
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();
