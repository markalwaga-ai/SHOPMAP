import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { 
    getAuth, 
    GoogleAuthProvider, 
    signOut as firebaseSignOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    query, 
    where, 
    getDocs, 
    getDoc,
    addDoc, 
    doc, 
    setDoc, 
    updateDoc, 
    deleteDoc, 
    onSnapshot,
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { 
    getStorage, 
    ref, 
    uploadBytes, 
    getDownloadURL 
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-storage.js";

// 1. CONFIGURATION
const firebaseConfig = {
  apiKey: "AIzaSyC4ChtlPtU7C8B6LiJAmBovUDkxZpUF5Y4",
  authDomain: "shopmapp-50cca.firebaseapp.com",
  projectId: "shopmapp-50cca",
  storageBucket: "shopmapp-50cca.firebasestorage.app",
  messagingSenderId: "878932618405",
  appId: "1:878932618405:web:b8c3dde48e0fad6f67714c",
  measurementId: "G-WLH7QMY551"
};

// 2. INITIALIZATION
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

// Global error hooks to surface uncaught errors and unhandled promise rejections
if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => {
    console.error('GlobalError:', e.message, e.filename, e.lineno, e.error);
  });

  window.addEventListener('unhandledrejection', (e) => {
    console.error('UnhandledRejection:', e.reason);
  });
}

// 3. ROLE CONSTANTS
export const ROLES = {
  ADMIN: 'admin',
  SALES_AGENT: 'sales_agent',
  MANAGER: 'manager'
};

// 4. BUSINESS & AUTH HELPERS
export async function getBusinessData(uid) {
  const businessRef = doc(db, "businesses", uid);
  const businessSnap = await getDoc(businessRef);
  if (businessSnap.exists()) {
    return businessSnap.data();
  }
  return null;
}

export async function updateBusinessData(uid, data) {
  const businessRef = doc(db, "businesses", uid);
  await updateDoc(businessRef, data);
}

export async function signOut() {
  await firebaseSignOut(auth);
}

// 5. PRODUCT MANAGEMENT
export async function getProducts(uid) {
  const products = [];
  const q = query(collection(db, "products"), where("adminUid", "==", uid));
  const snapshot = await getDocs(q);
  snapshot.forEach(doc => {
    products.push({ id: doc.id, ...doc.data() });
  });
  return products;
}

export async function createProduct(productData) {
  const productsRef = collection(db, "products");
  const docRef = await addDoc(productsRef, {
    ...productData,
    createdAt: serverTimestamp() 
  });
  return docRef.id;
}

export async function updateProduct(productId, data) {
  const productRef = doc(db, "products", productId);
  await updateDoc(productRef, {
    ...data,
    updatedAt: serverTimestamp()
  });
}

export async function deleteProduct(productId) {
  const productRef = doc(db, "products", productId);
  await deleteDoc(productRef);
}

// ============= NOTIFICATION HELPERS =============

/**
 * Show alert notification (compatible with existing code)
 * @param {string} message - Notification message
 * @param {string} type - Type: 'success', 'error', 'warning', 'info'
 */
export function showAlert(message, type = 'info') {
  // Check if new notification system is available
  if (typeof window !== 'undefined' && window.showNotification) {
    return window.showNotification(message, type, 4000, { animated: true });
  }
  // Fallback to alert
  console.log(`[${type.toUpperCase()}] ${message}`);
  alert(message);
}

/**
 * Show loading indicator
 * @param {string} message - Loading message
 */
export function showLoadingIndicator(message = 'Loading...') {
  if (typeof window !== 'undefined' && window.showLoading) {
    return window.showLoading(message, true);
  }
}

/**
 * Hide loading indicator
 */
export function hideLoadingIndicator() {
  if (typeof window !== 'undefined' && window.hideLoading) {
    return window.hideLoading();
  }
}

/**
 * Execute operation with loading state
 * @param {function} asyncFn - Async function to execute
 * @param {string} message - Loading message
 */
export async function executeWithLoading(asyncFn, message = 'Processing...') {
  if (typeof window !== 'undefined' && window.withLoading) {
    return window.withLoading(asyncFn, message);
  }
  try {
    return await asyncFn();
  } catch (error) {
    console.error(error);
    throw error;
  }
}

// 6. SALES & STAFF
export async function getSales(uid, limitCount = 50) {
  const sales = [];
  const q = query(collection(db, "sales"), where("adminUid", "==", uid));
  const snapshot = await getDocs(q);
  snapshot.forEach(doc => {
    sales.push({ id: doc.id, ...doc.data() });
  });
  return sales.slice(0, limitCount);
}

export async function createSale(saleData) {
  const salesRef = collection(db, "sales");
  const docRef = await addDoc(salesRef, {
    ...saleData,
    timestamp: serverTimestamp()
  });
  return docRef.id;
}

export async function getStaff(uid) {
  const staff = [];
  const q = query(collection(db, "staff"), where("adminUid", "==", uid));
  const snapshot = await getDocs(q);
  snapshot.forEach(doc => {
    staff.push({ id: doc.id, ...doc.data() });
  });
  return staff;
}

// 7. REAL-TIME SUBSCRIPTIONS
export function subscribeToProducts(uid, callback) {
  const q = query(collection(db, "products"), where("adminUid", "==", uid));
  return onSnapshot(q, (snapshot) => {
    const products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(products);
  }, (err) => {
    console.error('subscribeToProducts listener error for adminUid=', uid, err);
  });
}

export function subscribeToSales(uid, callback) {
  const q = query(collection(db, "sales"), where("adminUid", "==", uid));
  return onSnapshot(q, (snapshot) => {
    const sales = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(sales);
  }, (err) => {
    console.error('subscribeToSales listener error for adminUid=', uid, err);
  });
}