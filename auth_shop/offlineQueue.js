import { db } from '../firebase.js';
import { collection, addDoc, updateDoc, doc, increment, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

const DB_NAME = 'ShopMappOfflineDB';
const STORE_NAME = 'offlineSales';
const DB_VERSION = 1;
const LS_KEY = 'shopmapp-offline-sales';

function generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `offline-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}

function isIndexedDBSupported() {
    return typeof indexedDB !== 'undefined';
}

function serializeSale(saleData) {
    return {
        ...saleData,
        id: saleData.id || saleData.invoiceId || generateId(),
        queuedAt: saleData.queuedAt || new Date().toISOString(),
        status: saleData.status || 'pending'
    };
}

function getLocalStorageQueue() {
    try {
        return JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    } catch (err) {
        console.warn('Offline queue localStorage parse failed:', err);
        return [];
    }
}

function setLocalStorageQueue(queue) {
    localStorage.setItem(LS_KEY, JSON.stringify(queue));
}

function openDB() {
    return new Promise((resolve, reject) => {
        if (!isIndexedDBSupported()) {
            return reject(new Error('IndexedDB not supported'));
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

async function withIDBStore(mode, callback) {
    if (!isIndexedDBSupported()) {
        throw new Error('IndexedDB unsupported');
    }
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, mode);
        const store = transaction.objectStore(STORE_NAME);
        const result = callback(store);
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error || new Error('IDB transaction failed'));
        transaction.onabort = () => reject(transaction.error || new Error('IDB transaction aborted'));
    });
}

export async function addOfflineSale(saleData) {
    const item = serializeSale(saleData);
    if (!isIndexedDBSupported()) {
        const queue = getLocalStorageQueue();
        queue.push(item);
        setLocalStorageQueue(queue);
        return item;
    }

    const dbInstance = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(item);
        request.onsuccess = () => resolve(item);
        request.onerror = () => reject(request.error);
    });
}

export async function getAllOfflineSales() {
    if (!isIndexedDBSupported()) {
        return getLocalStorageQueue();
    }

    const dbInstance = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

export async function getOfflineQueueCount() {
    if (!isIndexedDBSupported()) {
        return getLocalStorageQueue().length;
    }

    const dbInstance = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.count();
        request.onsuccess = () => resolve(request.result || 0);
        request.onerror = () => reject(request.error);
    });
}

export async function removeOfflineSale(id) {
    if (!isIndexedDBSupported()) {
        const queue = getLocalStorageQueue().filter(sale => sale.id !== id);
        setLocalStorageQueue(queue);
        return;
    }

    const dbInstance = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

export async function clearOfflineQueue() {
    if (!isIndexedDBSupported()) {
        setLocalStorageQueue([]);
        return;
    }

    const dbInstance = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

export async function syncOfflineSales(adminUid, agentUid, agentName) {
    if (!navigator.onLine) {
        return { synced: 0, remaining: await getAllOfflineSales(), success: false, reason: 'offline' };
    }

    const queue = await getAllOfflineSales();
    if (!queue.length) {
        return { synced: 0, remaining: [], success: true };
    }

    let syncedCount = 0;
    const remaining = [];

    for (const offlineSale of queue) {
        try {
            const { id, queuedAt, status, ...saleData } = offlineSale;
            await addDoc(collection(db, 'sales'), {
                ...saleData,
                timestamp: serverTimestamp(),
                localSavedAt: queuedAt,
                syncedAt: new Date().toISOString(),
                adminUid,
                agentUid,
                agentName
            });

            for (const item of saleData.items || []) {
                if (item.productId) {
                    try {
                        await updateDoc(doc(db, 'products', item.productId), { qty: increment(-item.qty) });
                    } catch (err) {
                        console.warn('Offline sync product qty update failed for', item.productId, err);
                    }
                }
            }

            await removeOfflineSale(id);
            syncedCount++;
        } catch (err) {
            console.warn('Offline sale sync failed for', offlineSale.id || offlineSale.invoiceId, err);
            remaining.push(offlineSale);
        }
    }

    return { synced: syncedCount, remaining, success: remaining.length === 0 };
}
