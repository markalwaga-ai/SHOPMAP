import { auth, db } from '../firebase.js';
import { successNotification, errorNotification, warningNotification, infoNotification, showLoading, hideLoading } from '../notifications.js';
import { collection, query, where, onSnapshot, addDoc, doc, updateDoc, increment, getDocs, getDoc, orderBy, limit, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { addOfflineSale, getOfflineQueueCount, syncOfflineSales } from './offlineQueue.js';

let adminUid = "";
let currentUserUid = "";
let agentName = "";
let products = [];
let invoiceCount = 0;
let currentPersistentCounter = 1000;
const VAT_RATE = 0.16;
let activeSale = null;
let businessInfo = {};
let productsUnsubscribe = null;
const SESSION_INVOICES_KEY = 'shopmapp-session-invoices';

// Caching and debounce helpers
const PRODUCT_CACHE_KEY = 'shopmapp-products-cache';
const PRODUCT_CACHE_TTL = 1000 * 60 * 5; // 5 minutes
function debounce(fn, wait = 200) {
    let t = null;
    return function(...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), wait);
    };
}

function updateNetworkStatus() {
    const online = navigator.onLine;
    const onlineStatusEl = document.getElementById('salesOnlineStatus');

    if (onlineStatusEl) {
        onlineStatusEl.textContent = online ? 'Online' : 'Offline';
        onlineStatusEl.classList.toggle('offline', !online);
    }
}

function setupNetworkStatus() {
    updateNetworkStatus();
    void updateOfflineQueueIndicator();
    if (navigator.onLine) {
        void syncOfflineSales(adminUid, currentUserUid, agentName).then(() => updateOfflineQueueIndicator());
    }
    window.addEventListener('online', () => {
        updateNetworkStatus();
        void syncOfflineSales(adminUid, currentUserUid, agentName).then(() => updateOfflineQueueIndicator());
    });
    window.addEventListener('offline', updateNetworkStatus);
}

async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            await navigator.serviceWorker.register('sw.js');
            console.log('Service worker registered for sales page.');
        } catch (err) {
            console.warn('Service worker registration failed:', err);
        }
    }
}

async function updateOfflineQueueIndicator() {
    try {
        const count = await getOfflineQueueCount();
        const countEl = document.getElementById('offlineQueueCount');
        if (!countEl) return;
        if (count === 0) {
            countEl.textContent = 'All synced';
            countEl.classList.add('success');
            countEl.classList.remove('offline');
        // Resolve staff record robustly: prefer direct doc by UID, fall back to email query
        try {
            let staffDoc = null;
            try {
                staffDoc = await getDoc(doc(db, "staff", user.uid));
            } catch (innerErr) {
                console.warn('Direct staff doc read failed in sales.js:', innerErr.message || innerErr);
                staffDoc = null;
            }

            if (staffDoc && staffDoc.exists()) {
                const staffData = staffDoc.data();
                agentName = staffData.name || 'Agent';
                userRole = staffData.role || 'sales_agent';
                adminUid = staffData.adminUid || user.uid;
            } else {
                // try lookup by email
                try {
                    const staffQuery = query(collection(db, "staff"), where("email", "==", user.email));
                    const staffSnap = await getDocs(staffQuery);
                    if (!staffSnap.empty) {
                        const staffData = staffSnap.docs[0].data();
                        agentName = staffData.name || 'Agent';
                        userRole = staffData.role || 'sales_agent';
                        adminUid = staffData.adminUid || user.uid;
                    } else {
                        agentName = "Owner";
                        userRole = 'owner';
                        adminUid = user.uid;
                    }
                } catch (qErr) {
                    console.warn('Staff email query failed in sales.js:', qErr.message || qErr);
                    agentName = 'Owner';
                    userRole = 'owner';
                    adminUid = user.uid;
                }
            }
        } catch (err) {
            console.warn('Unable to read staff document in sales.js; falling back to owner. Error:', err.code || err.name, err.message || err);
            agentName = 'Owner';
            userRole = 'owner';
            adminUid = user.uid;
        }
        if (staffDoc.exists()) {
            const data = staffDoc.data();
            adminUid = data.adminUid;
            agentName = data.name;
        } else {
            adminUid = user.uid;
            agentName = "Owner";
        }
    } catch (err) {
        console.warn('Unable to read staff document; falling back to owner. Error:', err.code || err.name, err.message || err);
        adminUid = user.uid;
        agentName = 'Owner';
    }

    const agentEl = document.getElementById('agent-name-display');
    if (agentEl) agentEl.textContent = `Agent: ${agentName}`;
    const dateEl = document.getElementById('current-date');
    if (dateEl) dateEl.textContent = new Date().toDateString();

    try {
        const businessSnap = await getDoc(doc(db, "businesses", adminUid));
        businessInfo = businessSnap.exists() ? businessSnap.data() : {};
        const businessName = businessInfo.businessName || 'ShopMapp Retail';
        const businessNameEl = document.getElementById('business-name');
        if (businessNameEl) businessNameEl.textContent = businessName;
    } catch (error) {
        console.error('Failed to load business name', error);
    }

    loadProducts();
    initCounter();
    setupGlobalEvents();
});

function loadProducts() {
    if (!adminUid) {
        console.warn('loadProducts: adminUid is not set yet. Skipping product subscription.');
        return;
    }

    // hydrate from cache if available to speed UI
    try {
        const cached = JSON.parse(localStorage.getItem(PRODUCT_CACHE_KEY) || 'null');
        if (cached && (Date.now() - (cached.ts || 0) < PRODUCT_CACHE_TTL) && Array.isArray(cached.items)) {
            products = cached.items;
        }
    } catch (e) {
        // ignore
    }

    if (productsUnsubscribe) productsUnsubscribe();

    productsUnsubscribe = onSnapshot(query(collection(db, "products"), where("adminUid", "==", adminUid)), (snap) => {
        products = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        try { localStorage.setItem(PRODUCT_CACHE_KEY, JSON.stringify({ ts: Date.now(), items: products })); } catch (err) {}
    }, (err) => {
        console.error('products onSnapshot error in sales.js adminUid=', adminUid, err);
    });
}

async function initCounter() {
    try {
        if (!adminUid) {
            console.warn('initCounter: adminUid not set yet. Using default counter.');
            loadPersistedInvoices();
            return;
        }
        const q = query(collection(db, "sales"), where("adminUid", "==", adminUid), orderBy("timestamp", "desc"), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) {
            const lastId = snap.docs[0].data().invoiceId;
            const num = parseInt(lastId.split('-').pop());
            if (!isNaN(num)) currentPersistentCounter = num + 1;
        }
    } catch (err) {
        console.error('initCounter failed:', err.code || err.name || '', err.message || err);
    } finally {
        loadPersistedInvoices();
    }
}

function loadPersistedInvoices() {
    try {
        const persisted = sessionStorage.getItem(SESSION_INVOICES_KEY);
        if (persisted) {
            const invoices = JSON.parse(persisted);
            invoices.forEach(invoiceData => createInvoiceFromData(invoiceData));
            if (invoices.length > 0) {
                infoNotification(`${invoices.length} invoice(s) restored from your session.`);
            }
        } else {
            createNewInvoice();
        }
    } catch (err) {
        console.error('Error loading persisted invoices:', err);
        createNewInvoice();
    }
}

function saveSessionInvoices() {
    try {
        const invoiceCards = document.querySelectorAll('.invoice-card');
        const invoices = Array.from(invoiceCards).map(card => generateInvoiceData(card));
        sessionStorage.setItem(SESSION_INVOICES_KEY, JSON.stringify(invoices));
    } catch (err) {
        console.error('Error saving session invoices:', err);
    }
}

function createInvoiceFromData(data) {
    invoiceCount++;
    const card = document.createElement('div');
    card.className = 'invoice-card';
    card.innerHTML = `
        <div class="card-header">
            <span class="inv-badge">${data.invoiceId}</span>
            <button class="close-card" title="Remove invoice">×</button>
        </div>
        <div class="customer-section">
            <input type="text" class="cust-name" placeholder="Customer Name (Optional)" value="${data.customer || ''}">
        </div>
        <div class="items-section">
            <table class="items-table">
                <thead>
                    <tr>
                        <th>No</th>
                        <th>Item</th>
                        <th>Qty</th>
                        <th>Unit Price</th>
                        <th>Total</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody class="items-list"></tbody>
            </table>
            <button class="add-item">+ Add Product</button>
        </div>
        <div class="card-footer">
            <div class="footer-row"><span>Subtotal</span><span class="sub-val">${formatCurrency(data.subtotal)}</span></div>
            <div class="footer-row"><span>Discount</span><input type="number" class="discount-input" value="${data.discount}" min="0"></div>
            <div class="total-row"><span>Grand Total</span><span class="grand-val">${formatCurrency(data.total)}</span></div>
            <select class="pay-method"><option ${data.paymentMethod === 'Cash' ? 'selected' : ''}>Cash</option><option ${data.paymentMethod === 'M-Pesa' ? 'selected' : ''}>M-Pesa</option><option ${data.paymentMethod === 'Card' ? 'selected' : ''}>Card</option></select>
            <button class="process-btn">Preview Invoice</button>
        </div>
    `;
    document.getElementById('invoices-holder').appendChild(card);
    
    const tbody = card.querySelector('.items-list');
    data.items.forEach((item, idx) => {
        const row = document.createElement('tr');
        row.className = 'item-row';
        row.dataset.productId = item.productId || '';
        row.innerHTML = `
            <td class="no-col">${idx + 1}</td>
            <td>
                <div class="search-box">
                    <input type="text" class="product-search" placeholder="Search product..." value="${item.name}">
                    <div class="search-results hidden"></div>
                </div>
            </td>
            <td><input type="number" class="qty-input" value="${item.qty}" min="1"></td>
            <td><input type="number" class="price-input" value="${item.price}"></td>
            <td><span class="row-total">${formatCurrency(item.total)}</span></td>
            <td><button class="remove-row" title="Remove item">×</button></td>
        `;
        tbody.appendChild(row);
    });
    
    updateGlobalCount();
}

function setupGlobalEvents() {
    document.getElementById('new-invoice-btn').onclick = createNewInvoice;
    document.getElementById('confirm-sale-btn').onclick = finalizeSale;
    document.getElementById('download-invoice-btn').onclick = downloadReceipt;
    document.getElementById('save-invoice-btn').onclick = saveInvoiceLocally;
    document.getElementById('print-invoice-btn').onclick = printReceipt;
    document.getElementById('close-modal-btn').onclick = closeReceiptModal;

    const syncBtn = document.getElementById('sync-offline-btn');
    if (syncBtn) {
        syncBtn.addEventListener('click', async () => {
            syncBtn.disabled = true;
            const result = await syncOfflineSales(adminUid, currentUserUid, agentName);
            await updateOfflineQueueIndicator();
            if (result?.synced) {
                successNotification(`${result.synced} sale${result.synced === 1 ? '' : 's'} synced.`);
            }
            syncBtn.disabled = false;
        });
    }

    const openAdvisorBtn = document.getElementById('open-advisor-btn');
    if (openAdvisorBtn) openAdvisorBtn.addEventListener('click', openAdvisorModal);
    const closeAdvisorBtn = document.getElementById('close-advisor-btn');
    if (closeAdvisorBtn) closeAdvisorBtn.addEventListener('click', closeAdvisorModal);
    const advisorSendBtn = document.getElementById('advisor-send-btn');
    if (advisorSendBtn) advisorSendBtn.addEventListener('click', sendAdvisorQuestion);

    const holder = document.getElementById('invoices-holder');
    const debouncedLiveSearch = debounce((input) => handleLiveSearch(input), 220);

    holder.addEventListener('input', (e) => {
        const card = e.target.closest('.invoice-card');
        if (e.target.classList.contains('product-search')) debouncedLiveSearch(e.target);
        if (e.target.matches('.qty-input, .price-input, .discount-input')) calculateCard(card);
        saveSessionInvoices();
    });

    holder.addEventListener('click', (e) => {
        const card = e.target.closest('.invoice-card');
        if (!card) return;
        if (e.target.classList.contains('add-item')) addRow(card);
        if (e.target.classList.contains('remove-row')) {
            e.target.closest('.item-row').remove();
            calculateCard(card);
        }
        if (e.target.classList.contains('process-btn')) prepSale(card);
        if (e.target.classList.contains('close-card')) {
            card.remove();
            updateGlobalCount();
        }
        saveSessionInvoices();
    });
}

function createNewInvoice() {
    invoiceCount++;
    const invId = `INV-${new Date().getFullYear()}-${currentPersistentCounter++}`;
    const card = document.createElement('div');
    card.className = 'invoice-card';
    card.innerHTML = `
        <div class="card-header">
            <span class="inv-badge">${invId}</span>
            <button class="close-card" title="Remove invoice">×</button>
        </div>
        <div class="customer-section">
            <input type="text" class="cust-name" placeholder="Customer Name (Optional)">
        </div>
        <div class="items-section">
            <table class="items-table">
                <thead>
                    <tr>
                        <th>No</th>
                        <th>Item</th>
                        <th>Qty</th>
                        <th>Unit Price</th>
                        <th>Total</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody class="items-list"></tbody>
            </table>
            <button class="add-item">+ Add Product</button>
        </div>
        <div class="card-footer">
            <div class="footer-row"><span>Subtotal</span><span class="sub-val">0.00</span></div>
            <div class="footer-row"><span>Discount</span><input type="number" class="discount-input" value="0" min="0"></div>
            <div class="total-row"><span>Grand Total</span><span class="grand-val">0.00</span></div>
            <select class="pay-method"><option>Cash</option><option>M-Pesa</option><option>Card</option></select>
            <button class="process-btn">Preview Invoice</button>
        </div>
    `;
    document.getElementById('invoices-holder').appendChild(card);
    addRow(card);
    updateGlobalCount();
}

function addRow(card) {
    const tbody = card.querySelector('.items-list');
    const rowCount = tbody.children.length + 1;
    const row = document.createElement('tr');
    row.className = 'item-row';
    row.innerHTML = `
        <td class="no-col">${rowCount}</td>
        <td>
            <div class="search-box">
                <input type="text" class="product-search" placeholder="Search product...">
                <div class="search-results hidden"></div>
            </div>
        </td>
        <td><input type="number" class="qty-input" value="1" min="1"></td>
        <td><input type="number" class="price-input" value="0"></td>
        <td><span class="row-total">0.00</span></td>
        <td><button class="remove-row" title="Remove item">×</button></td>
    `;
    tbody.appendChild(row);
}

function handleLiveSearch(input) {
    const results = input.nextElementSibling;
    const term = input.value.trim().toLowerCase();
    if (term.length < 2) {
        results.classList.add('hidden');
        return;
    }

    const matches = products.filter(p => p.name?.toLowerCase().includes(term));
    results.innerHTML = matches.length ? matches.map(p => `
        <div class="res-item" data-id="${p.id}" data-price="${p.sellPrice ?? p.price ?? 0}" data-name="${p.name}">
            <strong>${p.name}</strong> <small>Stock: ${p.qty ?? 0}</small>
        </div>
    `).join('') : `<div class="res-empty">No matches found</div>`;
    results.classList.remove('hidden');

    results.onclick = (e) => {
        const item = e.target.closest('.res-item');
        if (!item) return;
        const row = input.closest('.item-row');
        row.dataset.productId = item.dataset.id;
        input.value = item.dataset.name;
        row.querySelector('.price-input').value = item.dataset.price;
        results.classList.add('hidden');
        calculateCard(input.closest('.invoice-card'));
    };
}

function calculateCard(card) {
    if (!card) return;
    let subtotal = 0;

    card.querySelectorAll('.item-row').forEach(row => {
        const qty = parseFloat(row.querySelector('.qty-input').value) || 0;
        const price = parseFloat(row.querySelector('.price-input').value) || 0;
        const rowTotal = qty * price;
        row.querySelector('.row-total').textContent = formatCurrency(rowTotal);
        subtotal += rowTotal;
    });

    const discount = Math.max(0, parseFloat(card.querySelector('.discount-input').value) || 0);
    const grand = Math.max(0, subtotal - discount);

    card.querySelector('.sub-val').textContent = formatCurrency(subtotal);
    card.querySelector('.grand-val').textContent = formatCurrency(grand);
}

function updateGlobalCount() {
    document.getElementById('invoice-count').textContent = document.querySelectorAll('.invoice-card').length;
}

function formatCurrency(value) {
    return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function generateInvoiceData(card) {
    const items = [];
    card.querySelectorAll('.item-row').forEach(row => {
        const name = row.querySelector('.product-search').value.trim();
        const qty = parseFloat(row.querySelector('.qty-input').value) || 0;
        const price = parseFloat(row.querySelector('.price-input').value) || 0;
        if (name && qty > 0 && price >= 0) {
            items.push({
                productId: row.dataset.productId || null,
                name,
                qty,
                price,
                total: Number((qty * price).toFixed(2))
            });
        }
    });

    const subtotal = parseFloat(card.querySelector('.sub-val').textContent.replace(/,/g, '')) || 0;
    const discount = Math.max(0, parseFloat(card.querySelector('.discount-input').value) || 0);
    const grand = parseFloat(card.querySelector('.grand-val').textContent.replace(/,/g, '')) || 0;

    return {
        adminUid,
        agentUid: currentUserUid,
        agentName,
        invoiceId: card.querySelector('.inv-badge').textContent,
        customer: card.querySelector('.cust-name').value.trim() || 'Walk-in Customer',
        paymentMethod: card.querySelector('.pay-method').value,
        items,
        subtotal,
        discount,
        total: grand,
        createdAt: new Date().toISOString()
    };
}

function prepSale(card) {
    const sale = generateInvoiceData(card);
    if (!sale.items.length) return showToast('Add at least one product before previewing.', 'warning');

    activeSale = { ...sale, timestamp: serverTimestamp(), cardElement: card };
    document.getElementById('receipt-content').innerHTML = buildReceiptHtml(activeSale);
    document.getElementById('receipt-status').textContent = 'Preview ready — print, download, or complete the sale.';
    document.getElementById('receipt-modal').classList.remove('hidden');
}

function buildReceiptHtml(sale) {
    const taxRate = (businessInfo.taxRate != null) ? Number(businessInfo.taxRate) : VAT_RATE;
    const taxAmount = Number((sale.subtotal * taxRate).toFixed(2));
    const totalWithTax = Number((sale.total + taxAmount).toFixed(2));
    const businessAddress = businessInfo.businessAddress || '';
    const businessEmail = businessInfo.businessEmail || '';

    return `
        <div class="receipt-preview">
            <div class="receipt-header">
                <div class="receipt-brand">
                    <img src="/favicon.svg" alt="ShopMapp" class="receipt-logo">
                    <div class="receipt-title">
                        <h2>${businessInfo.businessName || 'ShopMapp Retail'}</h2>
                        <p>${businessInfo.businessTagline || 'Your trusted retail partner for quality products and exceptional service.'}</p>
                    </div>
                </div>
                <div class="receipt-meta">
                    <div><span>Invoice</span><strong>${sale.invoiceId}</strong></div>
                    <div><span>Date</span><strong>${new Date().toLocaleString()}</strong></div>
                    <div><span>Cashier</span><strong>${sale.agentName}</strong></div>
                    <div><span>Customer</span><strong>${sale.customer}</strong></div>
                    <div><span>Payment</span><strong>${sale.paymentMethod}</strong></div>
                </div>
            </div>
            <div style="border-top: 1px solid rgba(255,255,255,0.12); margin: 1.5rem 0; padding: 1rem 0;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; font-size: 0.9rem;">
                    <div>
                        <div style="color: var(--text-muted); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem;">Items Sold</div>
                        <div style="color: var(--text-main); font-weight: 700; font-size: 1.2rem;">${sale.items.length} item(s)</div>
                    </div>
                    <div>
                        <div style="color: var(--text-muted); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem;">Total Quantity</div>
                        <div style="color: var(--text-main); font-weight: 700; font-size: 1.2rem;">${sale.items.reduce((sum, item) => sum + item.qty, 0)} unit(s)</div>
                    </div>
                </div>
            </div>
            <div class="receipt-body">
                <table class="receipt-table">
                    <thead>
                        <tr><th>No</th><th>Item</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr>
                    </thead>
                    <tbody>
                        ${sale.items.map((item, index) => `
                            <tr>
                                <td>${index + 1}</td>
                                <td>${item.name}</td>
                                <td>${item.qty}</td>
                                <td>${formatCurrency(item.price)}</td>
                                <td>${formatCurrency(item.total)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <div class="receipt-summary">
                <div class="summary-row"><span>Subtotal</span><strong>KES ${formatCurrency(sale.subtotal)}</strong></div>
                <div class="summary-row"><span>Discount</span><strong>KES ${formatCurrency(sale.discount)}</strong></div>
                <div class="summary-row"><span>Tax (${(taxRate*100).toFixed(0)}%)</span><strong>KES ${formatCurrency(taxAmount)}</strong></div>
                <div class="summary-row total"><span>Grand Total</span><strong>KES ${formatCurrency(totalWithTax)}</strong></div>
            </div>
            <div class="receipt-footer">
                <p style="background: rgba(16,185,129,0.12); padding: 1rem; border-radius: 12px; margin: 0; color: var(--accent-secondary); font-weight: 600;">✓ Payment Status: Ready for Processing</p>
                <p style="margin: 1rem 0 0;">Thank you for your purchase. Please retain this invoice for your records and warranty.</p>
                <p>${businessAddress}</p>
                <p>Contact: ${businessEmail}</p>
                <p class="shopmapp-note">Powered by ShopMapp - Simplifying retail management.</p>
            </div>
        </div>
    `;
}

function closeReceiptModal() {
    document.getElementById('receipt-modal').classList.add('hidden');
}

function saveInvoiceLocally() {
    if (!activeSale) return showToast('Preview an invoice before saving.', 'warning');
    const { cardElement, ...serializableSale } = activeSale;
    const saved = JSON.parse(localStorage.getItem('shopmapp-saved-invoices') || '[]');
    saved.push({ ...serializableSale, savedAt: new Date().toISOString() });
    localStorage.setItem('shopmapp-saved-invoices', JSON.stringify(saved));
    showToast('Invoice saved locally in your browser.', 'success');
}

function downloadReceipt() {
    if (!activeSale) return showToast('Preview an invoice before downloading.', 'warning');
    const taxRate = (businessInfo.taxRate != null) ? Number(businessInfo.taxRate) : VAT_RATE;
    const taxAmount = Number((activeSale.subtotal * taxRate).toFixed(2));
    const totalWithTax = Number((activeSale.total + taxAmount).toFixed(2));
    const businessAddress = businessInfo.businessAddress || '';
    const businessEmail = businessInfo.businessEmail || '';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${activeSale.invoiceId} - ShopMapp Invoice</title>
<style>
 * { margin: 0; padding: 0; box-sizing: border-box; }
 body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f5f5f5; color: #333; }
 .container { max-width: 800px; margin: 20px auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
 .header { display: grid; grid-template-columns: 1fr auto; gap: 30px; margin-bottom: 40px; border-bottom: 3px solid #3b82f6; padding-bottom: 30px; }
 .company-info h1 { color: #3b82f6; font-size: 28px; margin-bottom: 5px; }
 .company-info p { color: #666; font-size: 14px; margin: 3px 0; }
 .invoice-meta { text-align: right; }
 .invoice-meta .label { color: #999; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; }
 .invoice-meta .value { font-size: 16px; font-weight: 600; color: #333; margin-top: 3px; }
 .content { margin-bottom: 30px; }
 .content-row { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 20px; }
 .content-row .box { background: #f9f9f9; padding: 15px; border-radius: 6px; }
 .content-row .label { color: #999; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
 .content-row .value { font-size: 14px; color: #333; }
 table { width: 100%; border-collapse: collapse; margin: 30px 0; }
 thead { background: #f0f0f0; }
 th { padding: 12px; text-align: left; font-weight: 600; color: #333; border-bottom: 2px solid #ddd; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; }
 td { padding: 12px; border-bottom: 1px solid #eee; font-size: 14px; }
 tbody tr:hover { background: #fafafa; }
 .summary { margin: 30px 0; }
 .summary-row { display: grid; grid-template-columns: 1fr auto; gap: 20px; padding: 12px 0; }
 .summary-row .label { font-size: 14px; color: #666; }
 .summary-row .value { font-weight: 600; color: #333; text-align: right; }
 .summary-row.total { border-top: 2px solid #3b82f6; padding-top: 15px; margin-top: 15px; font-size: 16px; color: #3b82f6; }
 .footer { margin-top: 40px; border-top: 1px solid #eee; padding-top: 20px; text-align: center; color: #999; font-size: 12px; }
 .footer p { margin: 5px 0; }
 .payment-status { display: inline-block; background: #10b981; color: white; padding: 6px 12px; border-radius: 4px; font-weight: 600; margin-top: 10px; font-size: 12px; }
 .print-btn { display: none; }
 @media print {
  body { background: white; }
  .container { box-shadow: none; margin: 0; padding: 0; }
  .print-btn { display: block; text-align: right; margin-bottom: 20px; }
 }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <div class="company-info">
      <h1>${businessInfo.businessName || 'ShopMapp Retail'}</h1>
      <p>${businessInfo.businessTagline || 'Your trusted retail partner'}</p>
      <p style="margin-top: 10px; color: #999; font-size: 13px;">${businessAddress}</p>
      <p style="color: #999; font-size: 13px;">Contact: ${businessEmail}</p>
    </div>
    <div class="invoice-meta">
      <div><span class="label">Invoice</span><div class="value">${activeSale.invoiceId}</div></div>
      <div style="margin-top: 15px;"><span class="label">Date</span><div class="value">${new Date().toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric' })}</div></div>
      <div style="margin-top: 15px;"><span class="label">Time</span><div class="value">${new Date().toLocaleTimeString('en-KE')}</div></div>
    </div>
  </div>

  <div class="content">
    <div class="content-row">
      <div class="box">
        <div class="label">Bill To</div>
        <div class="value">${activeSale.customer}</div>
      </div>
      <div class="box">
        <div class="label">Payment Method</div>
        <div class="value">${activeSale.paymentMethod}</div>
      </div>
    </div>
  </div>

  <table>
    <thead>
      <tr><th>Item</th><th style="text-align: center;">Qty</th><th style="text-align: right;">Unit Price</th><th style="text-align: right;">Total</th></tr>
    </thead>
    <tbody>
      ${activeSale.items.map(item => ` <tr><td>${item.name}</td><td style="text-align: center;">${item.qty}</td><td style="text-align: right;">KES ${formatCurrency(item.price)}</td><td style="text-align: right;">KES ${formatCurrency(item.total)}</td></tr>`).join('')}
    </tbody>
  </table>

  <div class="summary">
    <div class="summary-row">
      <span class="label">Subtotal</span>
      <span class="value">KES ${formatCurrency(activeSale.subtotal)}</span>
    </div>
    <div class="summary-row">
      <span class="label">Discount</span>
      <span class="value">KES ${formatCurrency(activeSale.discount)}</span>
    </div>
    <div class="summary-row">
      <span class="label">Tax (${(taxRate*100).toFixed(0)}%)</span>
      <span class="value">KES ${formatCurrency(taxAmount)}</span>
    </div>
    <div class="summary-row total">
      <span class="label">TOTAL AMOUNT</span>
      <span class="value">KES ${formatCurrency(totalWithTax)}</span>
    </div>
  </div>

  <div style="margin: 30px 0; padding: 15px; background: #f0f7ff; border-left: 4px solid #3b82f6; border-radius: 4px;">
    <p style="font-size: 13px; color: #333; margin: 0;"><strong>✓ Thank you for your purchase!</strong> Please retain this invoice for your records, warranty verification, and returns. For support, contact us at ${businessEmail}</p>
  </div>

  <div class="footer">
    <p>Powered by <strong>ShopMapp</strong> - Simplifying retail management</p>
    <p>Invoice ID: ${activeSale.invoiceId} | Cashier: ${activeSale.agentName} | Generated: ${new Date().toLocaleString()}</p>
    <p style="margin-top: 15px; font-style: italic;">This is a computerized receipt. No signature required.</p>
  </div>
</div>
</body>
</html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeSale.invoiceId}-${new Date().getTime()}.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast('Invoice downloaded successfully.', 'success');
}

function printReceipt() {
    if (!activeSale) return showToast('Preview an invoice before printing.', 'warning');
    window.print();
}

async function finalizeSale() {
    if (!activeSale) return showToast('Preview an invoice before completing sale.', 'warning');
    const btn = document.getElementById('confirm-sale-btn');
    btn.disabled = true;
    showLoading('Processing sale...');

    try {
        const { cardElement, ...saleData } = activeSale;
        const taxRate = (businessInfo.taxRate != null) ? Number(businessInfo.taxRate) : VAT_RATE;
        const taxAmount = Number(((saleData.subtotal || 0) * taxRate).toFixed(2));
        const totalAmount = Number(((saleData.total || 0) + taxAmount).toFixed(2));

        const offlineSalePayload = {
            ...saleData,
            totalAmount,
            adminUid,
            agentUid: currentUserUid,
            agentName,
            localSavedAt: new Date().toISOString()
        };

        if (!navigator.onLine) {
            await addOfflineSale(offlineSalePayload);
            await updateOfflineQueueIndicator();
            cardElement.remove();
            closeReceiptModal();
            activeSale = null;
            updateGlobalCount();
            hideLoading();
            successNotification('Offline: sale saved locally and will sync when online.');
            createNewInvoice();
            return;
        }

        try {
            await addDoc(collection(db, 'sales'), { ...offlineSalePayload, timestamp: serverTimestamp() });
        } catch (err) {
            console.error('Failed to write sale document:', err.code || err.name, err.message || err);
            if (!navigator.onLine || ['unavailable', 'network-request-failed', 'timeout'].includes(err.code) || /network/i.test(err.message || '')) {
                await addOfflineSale(offlineSalePayload);
                await updateOfflineQueueIndicator();
                cardElement.remove();
                closeReceiptModal();
                activeSale = null;
                updateGlobalCount();
                hideLoading();
                warningNotification('Network issue: sale saved locally and will sync when online.');
                createNewInvoice();
                return;
            }
            throw err;
        }

        // Update product quantities — best-effort per-item logging
        for (const item of saleData.items) {
            if (item.productId) {
                try {
                    await updateDoc(doc(db, 'products', item.productId), { qty: increment(-item.qty) });
                } catch (err) {
                    console.error('Failed to update product qty for', item.productId, err.code, err.message);
                    // continue to next item instead of aborting whole sale
                }
            }
        }

        cardElement.remove();
        closeReceiptModal();
        activeSale = null;
        updateGlobalCount();
        hideLoading();
        successNotification('Sale completed and invoice stored successfully!');
        saveSessionInvoices();
        createNewInvoice();
    } catch (error) {
        console.error('finalizeSale error:', error.code || error.name || '', error.message || error);
        hideLoading();
        errorNotification('Unable to complete the sale. Please try again.');
    } finally {
        btn.disabled = false;
    }
}

function showToast(message, type = 'success') {
    switch(type) {
        case 'success':
            successNotification(message);
            break;
        case 'error':
            errorNotification(message);
            break;
        case 'warning':
            warningNotification(message);
            break;
        case 'info':
            infoNotification(message);
            break;
        default:
            infoNotification(message);
    }
}

function clearSessionAndNavigate(event) {
    event.preventDefault();
    // Session invoices are kept so user can return and continue
    // Just navigate back to dashboard
    window.location.href = 'overview.html';
}

// AI Advisor client integration
function openAdvisorModal() {
    const m = document.getElementById('advisor-modal');
    if (m) m.classList.remove('hidden');
}
function closeAdvisorModal() {
    const m = document.getElementById('advisor-modal');
    if (m) m.classList.add('hidden');
}

async function sendAdvisorQuestion() {
    const input = document.getElementById('advisor-question-input');
    const respEl = document.getElementById('advisor-response');
    const statusEl = document.getElementById('advisor-status');
    if (!input || !respEl) return;
    const q = input.value.trim();
    if (!q) return;
    if (statusEl) statusEl.textContent = 'Asking advisor...';
    respEl.textContent = '';

    const recentSaved = JSON.parse(localStorage.getItem('shopmapp-saved-invoices') || '[]');
    const recentSales = recentSaved.slice(-10).map(s => ({ invoiceId: s.invoiceId, items: s.items, total: s.total }));
    const ctx = {
        businessName: businessInfo.businessName,
        businessType: businessInfo.businessType,
        location: businessInfo.businessLocation || businessInfo.location || '',
        description: businessInfo.businessTagline || businessInfo.description || '',
        currency: businessInfo.currency || 'KES',
        metrics: {
            totalRevenue: businessInfo.totalRevenue || 0,
            totalProducts: products.length,
            outOfStockCount: products.filter(p => (p.qty || 0) <= 0).length,
            lowStockCount: products.filter(p => (p.qty || 0) > 0 && (p.qty || 0) < 5).length,
            totalSalesCount: recentSaved.length
        },
        products: products.slice(0, 30).map(p => ({ id: p.id, name: p.name, price: p.sellPrice ?? p.price, qty: p.qty })),
        recentSales
    };

    try {
        const endpoints = [window.AI_GATEWAY_ENDPOINT || '/api/ai-advisor','/.netlify/functions/ai-advisor','/functions/ai-advisor'];
        let res = null; let lastErr = null;
        for (const ep of endpoints) {
            try {
                res = await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: q, chatHistory: [], context: ctx }) });
                if (res.ok) break;
                lastErr = `HTTP ${res.status} @ ${ep}`;
                if (res.status === 404) continue;
                break;
            } catch (err) {
                lastErr = err;
                continue;
            }
        }
        if (!res) throw new Error('No advisor endpoint responded: ' + (lastErr || 'unknown'));
        if (!res.ok) {
            const txt = await res.text().catch(() => '');
            respEl.textContent = `Advisor error: ${res.status} ${txt} (${lastErr || ''})`;
            if (statusEl) statusEl.textContent = 'Error';
            return;
        }
        const data = await res.json();
        respEl.textContent = data.response || data.reply || JSON.stringify(data);
        if (statusEl) statusEl.textContent = 'Advisor answered';
    } catch (err) {
        // Graceful fallback: show offline mode message with basic stats
        const lowStockCount = products.filter(p => (p.qty || 0) > 0 && (p.qty || 0) < 5).length;
        const outOfStockCount = products.filter(p => (p.qty || 0) === 0).length;
        const totalRev = (JSON.parse(localStorage.getItem('shopmapp-saved-invoices') || '[]')).reduce((sum, s) => sum + (s.total || 0), 0);
        const fallback = `**Advisor Offline** ⚠️\n\nBackend unavailable: ${err.message}\n\n**Local Stats:**\n- Products: ${products.length} total, ${outOfStockCount} out of stock, ${lowStockCount} low stock\n- Revenue (this session): KES ${totalRev.toLocaleString()}\n\nTo enable full AI, deploy to Netlify with GEMINI_API_KEY set.`;
        respEl.textContent = fallback;
        if (statusEl) statusEl.textContent = 'Offline Mode';
    }
}

// Make function globally accessible for onclick handlers
window.clearSessionAndNavigate = clearSessionAndNavigate;
window.openAdvisorModal = openAdvisorModal;
window.closeAdvisorModal = closeAdvisorModal;