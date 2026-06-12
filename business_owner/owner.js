import { auth, db } from '../firebase.js';
import { successNotification, errorNotification, warningNotification, showLoading, hideLoading } from '../notifications.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { collection, query, where, onSnapshot, getDocs, setDoc, doc, updateDoc, deleteDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { updateGlobalData, clearGlobalData } from '../auth_shop/globalData.js';
import { getAllOfflineSales, syncOfflineSales } from '../auth_shop/offlineQueue.js';

// Secondary Auth for Agent Creation
const secondaryApp = initializeApp(auth.app.options, "Secondary");
const secondaryAuth = getAuth(secondaryApp);
let adminUid = '';

let salesChart = null;
let ownerProductsUnsubscribe = null;
let ownerSalesUnsubscribe = null;

function setupOwnerProfile(user, businessData = {}) {
    const nameEl = document.getElementById('userDisplayName');
    const roleEl = document.getElementById('userRoleDisplay');
    const profileImg = document.querySelector('#userProfileBadge .profile-avatar img');
    const displayName = user?.displayName || businessData?.ownerName || 'Owner';
    const photoURL = user?.photoURL || businessData?.ownerPhotoURL || '/favicon.svg';

    if (nameEl) nameEl.textContent = displayName;
    if (roleEl) roleEl.textContent = 'Owner';
    if (profileImg) {
        profileImg.src = photoURL;
        profileImg.onerror = () => { profileImg.src = '/favicon.svg'; };
    }
}

// --- AUTH OBSERVER ---
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        clearGlobalData();
        window.location.href = '../auth_shop/login.html';
        return;
    }
    adminUid = user.uid;
    updateGlobalData({ adminUid: user.uid, isAuthenticated: true });
    setupOwnerProfile(user);
    
    await loadBusinessData();
    setupForms();
    setupNavigation();
    loadStats();
    loadAgentsList();
    loadProductsCount(); // Ensure products count is loaded initially
    await loadOfflineQueuePanel();
    setupOfflineQueueControls();
    await loadOfflineQueuePanel();
});

// --- BUSINESS SETTINGS ---
async function loadBusinessData() {
    try {
        const d = await getDoc(doc(db, "businesses", adminUid));
        if (!d.exists()) {
            console.warn("Unauthorized owner page access attempt. Redirecting.");
            clearGlobalData();
            window.location.href = '../auth_shop/login.html';
            return;
        }

        const data = d.data();
        updateGlobalData({ businessName: data.businessName });
        setupOwnerProfile(auth.currentUser, data);
        const businessNameText = data.businessName || 'ShopMapp Retail';
        const ownerBusinessNameEl = document.getElementById('ownerBusinessName');
        if (ownerBusinessNameEl) ownerBusinessNameEl.textContent = businessNameText;
        document.getElementById('biz-name').value = data.businessName || '';
        document.getElementById('biz-type').value = data.businessType || '';
        document.getElementById('biz-desc').value = data.description || '';
        document.getElementById('biz-email').value = data.email || '';
    } catch (err) {
        console.error('loadBusinessData failed:', err.code || err.name || '', err.message || err);
        clearGlobalData();
        window.location.href = '../auth_shop/login.html';
        return;
    }
}

function setupForms() {
    document.getElementById('business-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        showLoading('Saving business settings...');
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        
        try {
            const bizData = {
                businessName: document.getElementById('biz-name').value.trim(),
                businessType: document.getElementById('biz-type').value,
                description: document.getElementById('biz-desc').value.trim(),
                email: document.getElementById('biz-email').value.trim(),
                updatedAt: new Date()
            };
            await updateDoc(doc(db, "businesses", adminUid), bizData);
            updateGlobalData({ businessName: bizData.businessName });
            hideLoading();
            successNotification('Business settings saved successfully!');
        } catch (error) {
            hideLoading();
            errorNotification('Failed to save settings: ' + error.message);
        } finally {
            submitBtn.disabled = false;
        }
    });

    document.getElementById('add-agent-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('agent-email').value.trim();
        const password = document.getElementById('agent-password').value;
        const name = document.getElementById('agent-name').value.trim();
        const role = document.getElementById('agent-role').value;

        if (!email || !password || !name || !role) {
            warningNotification('Please fill in all agent details');
            return;
        }

        showLoading('Creating agent account...');
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;

        try {
            const res = await createUserWithEmailAndPassword(secondaryAuth, email, password);
            await setDoc(doc(db, "staff", res.user.uid), {
                name,
                email,
                uid: res.user.uid,
                adminUid,
                role,
                active: true,
                createdAt: new Date()
            });
            hideLoading();
            successNotification('Agent registered successfully!');
            e.target.reset();
            await secondaryAuth.signOut();
        } catch (err) {
            hideLoading();
            errorNotification('Failed to register agent: ' + err.message);
        } finally {
            submitBtn.disabled = false;
        }
    });
}

// --- ANALYTICS & STATS ---
function loadStats() {
    if (!adminUid) {
        console.warn('loadStats: adminUid not set. Skipping owner realtime listeners.');
        return;
    }

    // Sales listener
    const salesQuery = query(collection(db, "sales"), where("adminUid", "==", adminUid));
    if (ownerSalesUnsubscribe) ownerSalesUnsubscribe();
    ownerSalesUnsubscribe = onSnapshot(salesQuery, (snap) => {
        let todayRev = 0; let monthRev = 0; const sales = [];
        const today = new Date().toDateString();
        
        snap.forEach(d => {
            const data = d.data();
            sales.push(data);
            if (new Date(data.timestamp.toDate()).toDateString() === today) todayRev += data.totalAmount;
            if (new Date(data.timestamp.toDate()).getMonth() === new Date().getMonth()) monthRev += data.totalAmount;
        });

        document.getElementById('todayRevenue').innerText = `KES ${todayRev.toLocaleString()}`;
        document.getElementById('monthRevenue').innerText = `KES ${monthRev.toLocaleString()}`;
        document.getElementById('totalTransactions').innerText = snap.size;
        updateChart(sales);
    });

    // Products listener for total count
    const productsQuery = query(collection(db, "products"), where("adminUid", "==", adminUid));
    if (ownerProductsUnsubscribe) ownerProductsUnsubscribe();
    ownerProductsUnsubscribe = onSnapshot(productsQuery, (snap) => {
        document.getElementById('totalProducts').innerText = snap.size;
    }, (err) => {
        console.error('owner products onSnapshot error. adminUid=', adminUid, err);
    });
}

function updateChart(sales) {
    const canvas = document.getElementById('salesChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const last7Days = [...Array(7)].map((_, i) => {
        const d = new Date(); d.setDate(d.getDate() - i);
        return { str: d.toDateString(), label: d.toLocaleDateString(undefined, {month:'short', day:'numeric'}) };
    }).reverse();

    const totals = last7Days.map(day => {
        return sales.filter(s => new Date(s.timestamp.toDate()).toDateString() === day.str)
                    .reduce((sum, s) => sum + s.totalAmount, 0);
    });

    if (salesChart) salesChart.destroy();
    salesChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: last7Days.map(d => d.label),
            datasets: [{ label: 'Revenue', data: totals, borderColor: '#10b981', fill: true, tension: 0.3 }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    // Ensure chart resizes nicely on viewport changes
    window.addEventListener('resize', () => {
        try { if (salesChart) salesChart.resize(); } catch (e) { /* ignore */ }
    });
}

// --- AGENT LIST ---
function loadAgentsList() {
    const q = query(collection(db, "staff"), where("adminUid", "==", adminUid));
    onSnapshot(q, (snap) => {
        const list = document.getElementById('agents-list');
        document.getElementById('totalAgents').innerText = snap.size;
        list.innerHTML = snap.docs.map(d => `
            <div class="agent-item card p-12 flex-between mb-8">
                <div><strong>${d.data().name}</strong><br><small>${d.data().role}</small></div>
                <button onclick="window.deleteAgent('${d.id}')" class="color-danger border-none bg-none pointer">🗑️</button>
            </div>
        `).join('') || '<p>No agents.</p>';
    });
}

function loadProductsCount() {
    const q = query(collection(db, "products"), where("adminUid", "==", adminUid));
    getDocs(q).then(snap => {
        document.getElementById('totalProducts').innerText = snap.size;
    });
}

async function loadOfflineQueuePanel() {
    const summaryEl = document.getElementById('offlineQueueSummary');
    const listEl = document.getElementById('offlineQueueList');
    if (!summaryEl || !listEl) return;

    try {
        const queue = await getAllOfflineSales();
        summaryEl.textContent = queue.length
            ? `${queue.length} offline sale${queue.length === 1 ? '' : 's'} pending`
            : 'No offline sales queued.';

        listEl.innerHTML = queue.length ? queue.map(sale => `
            <div class="offline-queue-item card p-12 mb-10">
                <div class="offline-queue-meta">
                    <strong>${sale.invoiceId || sale.id}</strong>
                    <span>${sale.customer || 'No customer'}</span>
                </div>
                <div class="offline-queue-detail">
                    <span>${sale.items?.length || 0} item${sale.items?.length === 1 ? '' : 's'}</span>
                    <span>Total: KES ${Number(sale.totalAmount || sale.total || 0).toLocaleString()}</span>
                    <span>Queued: ${new Date(sale.queuedAt).toLocaleString()}</span>
                </div>
            </div>
        `).join('') : '<p class="color-muted">There are no offline sales stored in this browser.</p>';
    } catch (err) {
        console.error('Failed to load offline queue panel:', err);
        if (summaryEl) summaryEl.textContent = 'Unable to load offline queue.';
    }
}

async function setupOfflineQueueControls() {
    const refreshBtn = document.getElementById('refreshOfflineQueueBtn');
    const syncBtn = document.getElementById('syncOfflineQueueBtn');

    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            refreshBtn.disabled = true;
            await loadOfflineQueuePanel();
            refreshBtn.disabled = false;
        });
    }

    if (syncBtn) {
        syncBtn.addEventListener('click', async () => {
            syncBtn.disabled = true;
            const result = await syncOfflineSales(adminUid, auth.currentUser.uid, 'Owner');
            await loadOfflineQueuePanel();
            if (result?.synced) {
                successNotification(`${result.synced} offline sale${result.synced === 1 ? '' : 's'} synced.`);
            }
            syncBtn.disabled = false;
        });
    }
}

window.deleteAgent = async (id) => { if(confirm('Remove Agent?')) await deleteDoc(doc(db, "staff", id)); };

function setupNavigation() {
    document.querySelectorAll('.side-link').forEach(link => {
        link.addEventListener('click', (e) => {
            const section = link.dataset.section;
            if (section) {
                e.preventDefault();
                showSection(section);
            }
            closeSidebar();
        });
    });

    const menuToggle = document.querySelector('.menu-toggle');
    if (menuToggle) {
        menuToggle.addEventListener('click', toggleMenu);
    }
}

function toggleMenu() {
    document.getElementById('sidebar').classList.toggle('active');
}

function showSection(eventOrId, sectionId) {
    let target = typeof eventOrId === 'string' ? eventOrId : sectionId;
    if (eventOrId && eventOrId.preventDefault) {
        eventOrId.preventDefault();
    }
    if (!target) return;

    document.querySelectorAll('.content-section').forEach(section => section.classList.remove('active'));
    document.querySelectorAll('.side-link').forEach(link => link.classList.remove('active'));

    const targetSection = document.getElementById(`${target}-section`);
    if (targetSection) targetSection.classList.add('active');

    const activeLink = document.querySelector(`.side-link[data-section="${target}"]`);
    if (activeLink) activeLink.classList.add('active');
}

function closeSidebar() {
    document.getElementById('sidebar').classList.remove('active');
}

window.toggleMenu = toggleMenu;
window.showSection = showSection;
window.closeSidebar = closeSidebar;

window.handleLogout = () => auth.signOut().then(() => window.location.href = '../index.html');