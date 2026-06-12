import { db, auth, getBusinessData, createProduct, updateProduct, createSale, updateBusinessData, showAlert } from '../firebase.js';
import { collection, query, where, onSnapshot, orderBy, doc, getDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { updateFinancialMetrics, updateTargetInsights, updateTopItemsList, updateGrowthAllocationAdvice, refreshTargetInsights } from './dashboard-metrics.js';

let userRole = null;
let adminUid = null;
let productsUnsubscribe = null;
let salesUnsubscribe = null;
let currentProducts = [];
let currentSales = [];
let cart = [];
let currentBusiness = null;
let advisorChatHistory = [];
let currentCurrency = 'KES';
let dailyExpenseAmount = 0;
let businessTargets = { salesTarget: 50000, profitTarget: 0 };
let salesTargetNotified = false;
let profitTargetNotified = false;
let sectionId = 'dashboard';
const agentRestricted = ['settings', 'dashboard'];

const currencySymbols = {
  KES: 'KES',
  USD: '$',
  EUR: '€'
};

function formatCurrency(amount) {
  const value = Number(amount) || 0;
  const symbol = currencySymbols[currentCurrency] || currentCurrency;
  return `${symbol} ${value.toFixed(2)}`;
}

function parseFirestoreDate(timestamp) {
  if (!timestamp) return new Date();
  if (timestamp.toDate) return timestamp.toDate();
  return new Date((timestamp.seconds || 0) * 1000);
}

function showDashboardLoader() {
  const loader = document.getElementById('dashboardLoader');
  if (loader) loader.classList.remove('hidden');
}

function hideDashboardLoader() {
  const loader = document.getElementById('dashboardLoader');
  if (loader) loader.classList.add('hidden');
}

async function loadBusinessNameAndSettings(user) {
  const loader = document.getElementById('dashboardLoader');
  if (loader) loader.classList.remove('hidden');
  try {
    let business = await getBusinessData(adminUid);
    if (!business && user?.uid && user.uid !== adminUid) {
      business = await getBusinessData(user.uid);
    }
     currentBusiness = business;

    const businessName = business?.businessName || business?.name || business?.companyName;
    const displayBusinessName = businessName || 'Business Loading...';
    const businessTagline = business?.businessTagline || business?.tagline || 'Business Intelligence Dashboard';
    const title = document.getElementById('dashboardBusinessName');
    const subtitle = document.getElementById('dashboardBusinessSubtitle');
    const topHeaderBusinessNameEl = document.getElementById('topHeaderBusinessName');

    if (title) title.textContent = displayBusinessName;
    if (subtitle) subtitle.textContent = businessTagline;
    if (topHeaderBusinessNameEl) topHeaderBusinessNameEl.textContent = displayBusinessName;
    document.title = displayBusinessName;

    currentCurrency = business?.currency || 'KES';

    const businessNameInput = document.getElementById('settingsBusinessName');
    const businessEmailInput = document.getElementById('settingsBusinessEmail');
    const currencyInput = document.getElementById('settingsCurrency');
    const taxRateInput = document.getElementById('settingsTaxRate');
    const salesTargetInput = document.getElementById('settingsSalesTarget');
    const profitTargetInput = document.getElementById('settingsProfitTarget');

    businessTargets.salesTarget = Number(business?.dailySalesTarget || 50000);
    businessTargets.profitTarget = Number(business?.dailyProfitTarget || 0);

    if (businessNameInput) businessNameInput.value = businessName;
    if (businessEmailInput) businessEmailInput.value = business?.businessEmail || '';
    if (currencyInput) currencyInput.value = business?.currency || 'KES';
    if (taxRateInput) taxRateInput.value = business?.taxRate || 0;
    if (salesTargetInput) salesTargetInput.value = businessTargets.salesTarget;
    if (profitTargetInput) profitTargetInput.value = businessTargets.profitTarget;
  } catch (error) {
    console.error('Unable to load business name and settings', error);
  } finally {
    if (loader) loader.classList.add('hidden');
  }
}

function getDisplayName(user, staffData) {
  if (staffData?.name) return staffData.name;
  if (user?.displayName) return user.displayName;
  if (user?.email) return user.email.split('@')[0].replace(/[._-]/g, ' ');
  return 'Guest';
}

function updateNetworkStatus() {
  const onlineStatus = document.getElementById('onlineStatus');
  const internetStatusLabel = document.getElementById('internetStatusLabel');
  const online = navigator.onLine;

  if (onlineStatus) {
    onlineStatus.classList.toggle('online', online);
    onlineStatus.classList.toggle('offline', !online);
    onlineStatus.setAttribute('aria-label', online ? 'Online' : 'Offline');
  }

  if (internetStatusLabel) {
    internetStatusLabel.textContent = online ? 'Online' : 'Offline';
  }

  const topHeaderOnlineStatus = document.getElementById('topHeaderOnlineStatus');
  if (topHeaderOnlineStatus) {
    topHeaderOnlineStatus.textContent = online ? 'Online' : 'Offline';
    topHeaderOnlineStatus.classList.toggle('offline', !online);
  }
}

function setupNetworkStatus() {
  updateNetworkStatus();
  window.addEventListener('online', updateNetworkStatus);
  window.addEventListener('offline', updateNetworkStatus);
}

const ownerRoles = ['owner', 'admin'];
const staffRoles = ['manager', 'agent', 'sales_agent'];

function setupProfile(user, staffData) {
  const displayName = getDisplayName(user, staffData);
  const roleLabel = ownerRoles.includes(userRole) ? 'Owner' : userRole === 'manager' ? 'Manager' : 'Sales Agent';

  const nameEl = document.getElementById('userDisplayName');
  const roleEl = document.getElementById('userRoleDisplay');
  const profileImg = document.querySelector('#userProfileBadge .profile-avatar img');
  const topHeaderAgentNameEl = document.getElementById('topHeaderAgentName');

  const profilePhoto = staffData?.photoURL || user?.photoURL || '/favicon.svg';
  if (nameEl) nameEl.textContent = `${displayName} (${roleLabel})`;
  if (roleEl) roleEl.textContent = roleLabel;
  if (profileImg) {
    profileImg.src = profilePhoto;
    profileImg.onerror = () => { profileImg.src = '/favicon.svg'; };
  }
  if (topHeaderAgentNameEl) topHeaderAgentNameEl.textContent = `Agent: ${displayName}`;
}

function setupUIByRole() {
  const ownerBtn = document.getElementById('ownerPanelBtn');
  const settingsLink = document.querySelector('[data-section="settings"]');
  const homeLink = document.querySelector('[data-section="dashboard"]');

  if (ownerBtn) ownerBtn.style.display = 'none';

  if (ownerRoles.includes(userRole)) {
    if (ownerBtn) {
      ownerBtn.style.display = 'block';
      ownerBtn.onclick = () => window.location.href = '../business_owner/owner.html';
    }
  } else if (userRole === 'manager') {
    if (ownerBtn) ownerBtn.remove();
  } else {
    if (ownerBtn) ownerBtn.remove();
    if (settingsLink) settingsLink.remove();
    if (homeLink) homeLink.remove();
    showSection('stock');
  }
}

function resolveSectionIdFromHash() {
  const rawHash = window.location.hash.replace('#', '').trim();
  if (rawHash) return rawHash;
  return 'dashboard';
}

function showSection(section) {
  sectionId = section || resolveSectionIdFromHash() || 'dashboard';
  document.querySelectorAll('.content-section').forEach((sectionEl) => {
    sectionEl.classList.toggle('active', sectionEl.id === `${sectionId}-section`);
  });
  document.querySelectorAll('.side-link').forEach((link) => {
    const linkSection = link.getAttribute('data-section');
    link.classList.toggle('active', linkSection === sectionId);
  });
  if (sectionId === 'advisor') {
    updateAdvisorPanel();
  }
}

window.showSection = showSection;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  try {
    // Try direct staff doc by UID first (most common). If missing or inaccessible,
    // fall back to a safer email-based staff lookup so older records still work.
    let staffDoc = null;
    try {
      staffDoc = await getDoc(doc(db, 'staff', user.uid));
    } catch (e) {
      console.warn('Direct staff doc read failed:', e.message || e);
      staffDoc = null;
    }

    if (staffDoc && staffDoc.exists()) {
      const staffData = staffDoc.data();
      userRole = staffData.role || 'sales_agent';
      adminUid = staffData.adminUid || user.uid;
      setupProfile(user, staffData);
    } else {
      // Try query by email as a fallback (used in other pages and more robust)
      try {
        const staffQuery = query(collection(db, 'staff'), where('email', '==', user.email));
        const staffSnap = await getDocs(staffQuery);
        if (!staffSnap.empty) {
          const staffData = staffSnap.docs[0].data();
          userRole = staffData.role || 'sales_agent';
          adminUid = staffData.adminUid || user.uid;
          setupProfile(user, staffData);
        } else {
          // No staff record found; treat as owner (business account)
          userRole = 'owner';
          adminUid = user.uid;
          setupProfile(user, null);
        }
      } catch (e) {
        console.warn('Staff email query failed, defaulting to owner:', e.message || e);
        userRole = 'owner';
        adminUid = user.uid;
        setupProfile(user, null);
      }
    }
  } catch (error) {
    if (error?.code === 'permission-denied') {
      console.warn('Unable to read staff role due to permissions; defaulting to sales agent.', error);
      userRole = 'sales_agent';
      adminUid = user.uid;
      setupProfile(user, null);
    } else {
      console.warn('Unable to read staff role; defaulting to owner.', error);
      userRole = 'owner';
      adminUid = user.uid;
      setupProfile(user, null);
    }
  }

  setupNetworkStatus();
  setupUIByRole();
  initListeners();
  await loadBusinessNameAndSettings(user);
  loadDailyExpenses();

  if (typeof sectionId === 'undefined' || !sectionId) {
    sectionId = resolveSectionIdFromHash();
  }

  if (staffRoles.includes(userRole) && agentRestricted.includes(sectionId)) {
    sectionId = 'stock';
  }

  showSection(sectionId);

  if (sectionId === 'advisor') {
    updateAdvisorPanel();
  }
});

function initListeners() {
  if (!adminUid) {
    console.warn('initListeners: adminUid not set. Skipping realtime subscriptions.');
    return;
  }

  if (productsUnsubscribe) productsUnsubscribe();
  if (salesUnsubscribe) salesUnsubscribe();

  const productQuery = query(collection(db, 'products'), where('adminUid', '==', adminUid));

  productsUnsubscribe = onSnapshot(productQuery, (snapshot) => {
    const products = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    currentProducts = products;
    renderStockTable(products);
    renderCatalogueTable(products);
    renderRecentItems(products);
    updateStockProductSelect(products);
    renderProductGrid(products);
    updateDashboardStats(products, currentSales);
  }, (err) => {
    console.error('products onSnapshot error. adminUid=', adminUid, 'query=', productQuery, err);
  });

  const salesQuery = query(collection(db, 'sales'), where('adminUid', '==', adminUid), orderBy('timestamp', 'desc'));

  salesUnsubscribe = onSnapshot(salesQuery, (snapshot) => {
    const sales = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    currentSales = sales;
    renderSalesHistory(sales);
    updateDashboardStats(currentProducts, sales);
  }, (err) => {
    console.error('sales onSnapshot error. adminUid=', adminUid, 'query=', salesQuery, err);
  });
}

function initializePageHandlers() {
  const newItemForm = document.getElementById('newItemForm');
  if (newItemForm) newItemForm.addEventListener('submit', handleNewItemSubmit);

  const updateStockForm = document.getElementById('updateStockForm');
  if (updateStockForm) updateStockForm.addEventListener('submit', (event) => {
    event.preventDefault();
    addStockQuantity();
  });

  const productSearch = document.getElementById('productSearch');
  if (productSearch) productSearch.addEventListener('input', () => renderProductGrid(currentProducts));

  const checkoutBtn = document.getElementById('checkoutBtn');
  if (checkoutBtn) checkoutBtn.addEventListener('click', completeSale);

  const settingsForm = document.getElementById('businessSettingsForm');
  if (settingsForm) settingsForm.addEventListener('submit', handleBusinessSettingsSave);

  const stockProductSelect = document.getElementById('stockProductSelect');
  if (stockProductSelect) {
    stockProductSelect.addEventListener('change', () => {
      const selectedProduct = currentProducts.find((product) => product.id === stockProductSelect.value);
      const stockQtyInput = document.getElementById('currentStockQty');
      if (stockQtyInput) stockQtyInput.value = selectedProduct ? selectedProduct.qty || 0 : 0;
    });
  }

  const catalogueSearch = document.getElementById('catalogueSearch');
  if (catalogueSearch) catalogueSearch.addEventListener('input', filterCatalogueTable);

  const stockSearchInput = document.getElementById('stockSearchInput');
  if (stockSearchInput) stockSearchInput.addEventListener('input', filterStockTable);

  const stockFilterType = document.getElementById('stockFilterType');
  if (stockFilterType) stockFilterType.addEventListener('change', filterStockTable);

  const startDate = document.getElementById('startDate');
  const endDate = document.getElementById('endDate');
  if (startDate) startDate.addEventListener('change', () => renderSalesHistory(currentSales));
  if (endDate) endDate.addEventListener('change', () => renderSalesHistory(currentSales));

  const exportHistoryBtn = document.getElementById('exportHistoryBtn');
  if (exportHistoryBtn) exportHistoryBtn.addEventListener('click', exportSalesHistoryCSV);

  const downloadClosingsBtn = document.getElementById('downloadClosingsBtn');
  if (downloadClosingsBtn) downloadClosingsBtn.addEventListener('click', downloadDailyClosingReportCSV);

  const generateRestockBtn = document.getElementById('generateRestockBtn');
  if (generateRestockBtn) generateRestockBtn.addEventListener('click', () => renderRestockOrder(currentProducts));

  const exportRestockBtn = document.getElementById('exportRestockBtn');
  if (exportRestockBtn) exportRestockBtn.addEventListener('click', generateRestockOrderCSV);

  const shareRestockBtn = document.getElementById('shareRestockBtn');
  if (shareRestockBtn) shareRestockBtn.addEventListener('click', shareRestockOrderList);

  const saveDailyExpensesBtn = document.getElementById('saveDailyExpensesBtn');
  if (saveDailyExpensesBtn) saveDailyExpensesBtn.addEventListener('click', (event) => {
    event.preventDefault();
    saveDailyExpenses();
  });
}

window.refreshTargetInsights = function() {
  const todaysSales = getTodaysSales(currentSales);
  const totalToday = todaysSales.reduce((sum, sale) => sum + Number(sale.totalAmount || 0), 0);
  const currentProfit = totalToday - dailyExpenseAmount;
  refreshTargetInsights(currentSales, businessTargets.salesTarget, businessTargets.profitTarget, currentProfit);
  checkTargetNotifications(totalToday, currentProfit, businessTargets.salesTarget, businessTargets.profitTarget);
  updateAnnouncementMessage(currentProfit, businessTargets.salesTarget, businessTargets.profitTarget);
};

async function handleNewItemSubmit(event) {
  event.preventDefault();
  event.stopPropagation();

  const submitButton = event?.submitter || document.querySelector('#newItemForm button[type="submit"]');
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.dataset.originalText = submitButton.textContent;
    submitButton.textContent = 'Saving...';
  }

  const name = document.getElementById('prodName')?.value.trim();
  const qty = Number(document.getElementById('prodQty')?.value || 0);
  const partNo = document.getElementById('prodPartNo')?.value.trim();
  const buyPrice = Number(document.getElementById('prodBuyPrice')?.value || 0);
  const sellPrice = Number(document.getElementById('prodSellPrice')?.value || 0);
  const description = document.getElementById('prodDesc')?.value.trim();

  if (!name || qty < 0 || buyPrice < 0 || sellPrice < 0) {
    showAlert('Please complete all product fields with valid values.', 'warning');
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = submitButton.dataset.originalText || 'Add Product';
    }
    return;
  }

  try {
    const productAdminUid = adminUid || auth.currentUser?.uid;
    if (!productAdminUid) {
      showAlert('Unable to verify the business account. Please refresh and try again.', 'error');
      return;
    }

    const productId = await createProduct({ adminUid: productAdminUid, name, qty, partNo, buyPrice, sellPrice, description });
    const newProduct = {
      id: productId,
      adminUid: productAdminUid,
      name,
      qty,
      partNo,
      buyPrice,
      sellPrice,
      description,
      createdAt: new Date()
    };

    currentProducts = currentProducts.filter((product) => product.id !== productId);
    currentProducts.unshift(newProduct);
    document.getElementById('newItemForm')?.reset();
    showSection('inventory');
    renderStockTable(currentProducts);
    renderCatalogueTable(currentProducts);
    renderRecentItems(currentProducts);
    updateStockProductSelect(currentProducts);
    renderProductGrid(currentProducts);
    showAlert('Product added successfully.', 'success');
  } catch (error) {
    console.error('Failed to add product', error);
    showAlert('Unable to add product. Please try again.', 'error');
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = submitButton.dataset.originalText || 'Add Product';
    }
  }
}

async function handleBusinessSettingsSave(event) {
  event.preventDefault();

  const businessName = document.getElementById('settingsBusinessName')?.value.trim();
  const businessEmail = document.getElementById('settingsBusinessEmail')?.value.trim();
  const currency = document.getElementById('settingsCurrency')?.value || 'KES';
  const taxRate = Number(document.getElementById('settingsTaxRate')?.value || 0);
  const salesTarget = Number(document.getElementById('settingsSalesTarget')?.value || 0);
  const profitTarget = Number(document.getElementById('settingsProfitTarget')?.value || 0);

  if (!businessName || !businessEmail) {
    showAlert('Please fill in the business name and email.', 'warning');
    return;
  }

  if (salesTarget < 0 || profitTarget < 0) {
    showAlert('Targets must be zero or positive values.', 'warning');
    return;
  }

  try {
    const targetValuesChanged = businessTargets.salesTarget !== salesTarget || businessTargets.profitTarget !== profitTarget;
    await updateBusinessData(adminUid, { businessName, businessEmail, currency, taxRate, dailySalesTarget: salesTarget, dailyProfitTarget: profitTarget });
    currentCurrency = currency;
    businessTargets.salesTarget = salesTarget;
    businessTargets.profitTarget = profitTarget;
    if (targetValuesChanged) {
      salesTargetNotified = false;
      profitTargetNotified = false;
    }
    showAlert('Business settings updated successfully.', 'success');
  } catch (error) {
    console.error('Failed to save business settings', error);
    showAlert('Unable to save settings. Please try again.', 'error');
  }
}

function renderStockTable(products) {
  const tbody = document.getElementById('stockTableBody');
  if (!tbody) return;

  if (!products.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="overview-empty-state">No stock records yet. Add inventory items to start managing stock.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = products.map((p) => `
      <tr>
        <td>${p.name}</td>
        <td class="${Number(p.qty) < 10 ? 'low-stock' : ''}">${p.qty ?? 0}</td>
        <td>${p.partNo || '-'}</td>
        <td>${userRole !== 'agent' ? formatCurrency(p.buyPrice) : '***'}</td>
        <td>${formatCurrency(p.sellPrice)}</td>
        <td>${p.description || '-'}</td>
        <td>${parseFirestoreDate(p.createdAt).toLocaleDateString()}</td>
        <td><button onclick="editProduct('${p.id}')" class="btn-edit">Edit</button></td>
      </tr>
    `).join('');
}

function renderRecentItems(products) {
  const tbody = document.getElementById('recentItemsTableBody');
  if (!tbody) return;

  const sorted = [...products].sort((a, b) => parseFirestoreDate(b.createdAt) - parseFirestoreDate(a.createdAt)).slice(0, 10);

  if (!sorted.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5">No items added yet</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = sorted.map((item) => `
      <tr>
        <td>${item.name}</td>
        <td>${item.description || '-'}</td>
        <td>${item.partNo || '-'}</td>
        <td>${parseFirestoreDate(item.createdAt).toLocaleDateString()}</td>
        <td>${item.qty > 0 ? 'In Stock' : 'Out of Stock'}</td>
      </tr>
    `).join('');
}

function renderCatalogueTable(products) {
  const tbody = document.getElementById('catalogueTableBody');
  if (!tbody) return;

  if (!products.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="overview-empty-state">Your product catalogue will be populated as you add items from the inventory section.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = products.map((p) => `
      <tr>
        <td>${p.name}</td>
        <td>${p.qty ?? 0}</td>
        <td>${p.partNo || '-'}</td>
        <td>${p.description || '-'}</td>
        <td class="text-right">${formatCurrency(p.sellPrice)}</td>
      </tr>
    `).join('');
}

function renderProductGrid(products) {
  const grid = document.getElementById('productGrid');
  if (!grid) return;

  const searchTerm = document.getElementById('productSearch')?.value.toLowerCase() || '';
  const visibleProducts = products.filter((product) => {
    const name = product.name?.toLowerCase() || '';
    const partNo = product.partNo?.toLowerCase() || '';
    return name.includes(searchTerm) || partNo.includes(searchTerm);
  });

  if (!visibleProducts.length) {
    grid.innerHTML = '<div class="overview-empty-state">No matching products found.</div>';
    return;
  }

  grid.innerHTML = visibleProducts.map((product) => `
      <article class="product-card">
        <div class="product-card-header">
          <h4>${product.name}</h4>
          <span class="product-part-no">${product.partNo || 'N/A'}</span>
        </div>
        <p class="product-description">${product.description || 'No description available.'}</p>
        <div class="product-card-meta">
          <span>Stock: ${product.qty ?? 0}</span>
          <span>${formatCurrency(product.sellPrice)}</span>
        </div>
        <button class="btn btn-outline" onclick="addToCart('${product.id}')">Add to cart</button>
      </article>
    `).join('');
}

function filterStockTable() {
  const searchTerm = document.getElementById('stockSearchInput')?.value.toLowerCase() || '';
  const filterType = document.getElementById('stockFilterType')?.value || 'all';
  const rows = document.querySelectorAll('#stockTableBody tr');

  rows.forEach((row) => {
    const cells = row.querySelectorAll('td');
    if (!cells.length) return;

    const name = cells[0]?.textContent.toLowerCase() || '';
    const qty = cells[1]?.textContent.toLowerCase() || '';
    const date = cells[6]?.textContent.toLowerCase() || '';

    const matches = filterType === 'all'
      ? [name, qty, date].some((value) => value.includes(searchTerm))
      : filterType === 'name' ? name.includes(searchTerm)
      : filterType === 'qty' ? qty.includes(searchTerm)
      : date.includes(searchTerm);

    row.style.display = matches ? '' : 'none';
  });
}

function filterCatalogueTable() {
  const searchTerm = document.getElementById('catalogueSearch')?.value.toLowerCase() || '';
  const rows = document.querySelectorAll('#catalogueTableBody tr');
  rows.forEach((row) => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(searchTerm) ? '' : 'none';
  });
}

function updateDashboardStats(products, sales) {
  const todaysSales = getTodaysSales(sales);
  const totalToday = todaysSales.reduce((sum, sale) => sum + Number(sale.totalAmount || 0), 0);
  const averageSale = Array.isArray(sales) && sales.length
    ? sales.reduce((sum, sale) => sum + Number(sale.totalAmount || 0), 0) / sales.length
    : 0;

  const expenseTotal = products.reduce((sum, product) => sum + (Number(product.buyPrice) || 0) * (Number(product.qty) || 0), 0);

  if (typeof updateFinancialMetrics === 'function') {
    updateFinancialMetrics(totalToday, expenseTotal, todaysSales.length, averageSale);
  }

  const currentProfit = totalToday - dailyExpenseAmount;

  if (typeof updateTargetInsights === 'function') {
    updateTargetInsights(todaysSales, totalToday, businessTargets.salesTarget, businessTargets.profitTarget, currentProfit);
  }

  if (typeof updateTopItemsList === 'function') {
    updateTopItemsList(todaysSales);
  }

  if (typeof updateGrowthAllocationAdvice === 'function') {
    updateGrowthAllocationAdvice(totalToday, expenseTotal);
  }

  renderDailyClosingReport(sales);
  renderRestockOrder(products);
  renderDailyProfit(totalToday);
  checkTargetNotifications(totalToday, currentProfit, businessTargets.salesTarget, businessTargets.profitTarget);
  updateAnnouncementMessage(currentProfit, businessTargets.salesTarget, businessTargets.profitTarget);
}

function getTodaysSales(sales) {
  const salesArray = Array.isArray(sales) ? sales : [];
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  return salesArray.filter((sale) => {
    const saleDate = parseFirestoreDate(sale?.timestamp);
    saleDate.setHours(0, 0, 0, 0);
    return saleDate.getTime() === startOfDay.getTime();
  });
}

function renderDailyClosingSummary(sales) {
  const totalSales = Array.isArray(sales) ? sales.reduce((sum, sale) => sum + Number(sale.totalAmount || 0), 0) : 0;
  const paymentTotals = sales.reduce((totals, sale) => {
    const method = (sale.paymentMethod || 'Cash').toLowerCase();
    totals[method] = (totals[method] || 0) + Number(sale.totalAmount || 0);
    return totals;
  }, { cash: 0, mpesa: 0, card: 0 });

  const dailyTotalSalesValue = document.getElementById('dailyTotalSalesValue');
  const dailyCashValue = document.getElementById('dailyCashValue');
  const dailyMpesaValue = document.getElementById('dailyMpesaValue');
  const dailyCardValue = document.getElementById('dailyCardValue');

  if (dailyTotalSalesValue) dailyTotalSalesValue.textContent = formatCurrency(totalSales);
  if (dailyCashValue) dailyCashValue.textContent = formatCurrency(paymentTotals.cash || 0);
  if (dailyMpesaValue) dailyMpesaValue.textContent = formatCurrency(paymentTotals.mpesa || 0);
  if (dailyCardValue) dailyCardValue.textContent = formatCurrency(paymentTotals.card || 0);
}

function renderDailyClosingReport(sales) {
  const todaysSales = getTodaysSales(Array.isArray(sales) ? sales : []);
  const tbody = document.getElementById('dailyClosingsTableBody');
  if (!tbody) return;

  if (!todaysSales.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="overview-empty-state">No sales have been logged today.</td>
      </tr>
    `;
    renderDailyClosingSummary([]);
    return;
  }

  let counter = 0;
  tbody.innerHTML = todaysSales.flatMap((sale) => {
    return (sale.items || []).map((item) => {
      counter += 1;
      const product = currentProducts.find((productEntry) => productEntry.id === item.id) || {};
      return `
        <tr>
          <td>${counter}</td>
          <td>${item.name || 'Unknown item'}${item.quantity ? ` x${item.quantity}` : ''}</td>
          <td>${product.description || '-'}</td>
          <td>${product.partNo || '-'}</td>
          <td>${parseFirestoreDate(sale.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
          <td>${sale.paymentMethod || 'Cash'}</td>
        </tr>
      `;
    });
  }).join('');

  renderDailyClosingSummary(todaysSales);
}

function renderRestockOrder(products) {
  const lowStockItems = products
    .filter((product) => Number(product.qty) < 5)
    .sort((a, b) => (Number(a.qty) || 0) - (Number(b.qty) || 0));

  const tbody = document.getElementById('restockOrderTableBody');
  const notice = document.getElementById('restockOrderEmptyState');
  if (!tbody) return;

  if (!lowStockItems.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="overview-empty-state">No low-stock items need restocking.</td>
      </tr>
    `;
    if (notice) notice.textContent = 'No low-stock items need restocking.';
    return;
  }

  tbody.innerHTML = lowStockItems.map((product, index) => {
    const orderQty = Math.max(5 - Number(product.qty || 0), 1);
    return `
      <tr>
        <td>${index + 1}</td>
        <td>${product.name || 'Unnamed item'}</td>
        <td>${product.description || '-'}</td>
        <td>${product.partNo || '-'}</td>
        <td>${Number(product.qty || 0)}</td>
        <td>${orderQty}</td>
      </tr>
    `;
  }).join('');

  if (notice) notice.textContent = `${lowStockItems.length} item${lowStockItems.length > 1 ? 's' : ''} ready for reorder.`;
}

function saveDailyExpenses() {
  const input = document.getElementById('dailyExpensesInput');
  if (!input) return;

  const value = Number(input.value || 0);
  if (Number.isNaN(value) || value < 0) {
    showAlert('Enter a valid expense amount.', 'warning');
    return;
  }

  dailyExpenseAmount = value;
  const key = getDailyExpenseStorageKey();
  localStorage.setItem(key, JSON.stringify(dailyExpenseAmount));
  showAlert('Daily expense saved.', 'success');
  updateDailyExpenseDisplay();
  renderDailyProfit(getTodaysSales(currentSales).reduce((sum, sale) => sum + Number(sale.totalAmount || 0), 0));
}

function getDailyExpenseStorageKey() {
  const today = new Date();
  return `shopmapp-daily-expense-${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
}

function loadDailyExpenses() {
  const key = getDailyExpenseStorageKey();
  const stored = localStorage.getItem(key);
  if (stored) {
    dailyExpenseAmount = Number(JSON.parse(stored)) || 0;
  }
  const input = document.getElementById('dailyExpensesInput');
  if (input) input.value = dailyExpenseAmount || '';
  updateDailyExpenseDisplay();
}

function updateDailyExpenseDisplay() {
  const expensesEl = document.getElementById('dailyExpensesValue');
  if (expensesEl) expensesEl.textContent = formatCurrency(dailyExpenseAmount);
}

function renderDailyProfit(totalSales) {
  const profit = totalSales - dailyExpenseAmount;
  const profitEl = document.getElementById('dailyProfitValue');
  if (profitEl) profitEl.textContent = formatCurrency(profit);
}

function checkTargetNotifications(totalSales, currentProfit, salesTarget, profitTarget) {
  if (salesTarget > 0) {
    if (totalSales >= salesTarget && !salesTargetNotified) {
      showAlert(`Sales target reached! You've earned ${formatCurrency(totalSales)} today, meeting your target of ${formatCurrency(salesTarget)}.`, 'success');
      salesTargetNotified = true;
    } else if (totalSales < salesTarget) {
      salesTargetNotified = false;
    }
  }

  if (profitTarget > 0) {
    if (currentProfit >= profitTarget && !profitTargetNotified) {
      showAlert(`Profit goal achieved! Your net profit is ${formatCurrency(currentProfit)}, which meets or exceeds your profit target of ${formatCurrency(profitTarget)}.`, 'success');
      profitTargetNotified = true;
    } else if (currentProfit < profitTarget) {
      profitTargetNotified = false;
    }
  }
}

function updateAnnouncementMessage(currentProfit, salesTarget, profitTarget) {
  const announcementText = document.getElementById('announcementText');
  if (!announcementText) return;

  const personalSavings = Math.max(0, currentProfit * 0.35);
  const businessReserve = Math.max(0, currentProfit * 0.65);

  let targetNote = 'Set your daily sales and profit targets under Business Settings to track performance in real time.';
  if (salesTarget > 0 || profitTarget > 0) {
    const salesMessage = salesTarget > 0 ? `Sales target: ${formatCurrency(salesTarget)}. ` : '';
    const profitMessage = profitTarget > 0 ? `Profit target: ${formatCurrency(profitTarget)}. ` : '';
    targetNote = `${salesMessage}${profitMessage}`;
  }

  const profitMessage = currentProfit >= 0
    ? `Net profit today is ${formatCurrency(currentProfit)}. Save ${formatCurrency(personalSavings)} and retain ${formatCurrency(businessReserve)} for reinvestment.`
    : `Net profit is negative today. Review expenses and sales so you can recover and meet your goals.`;

  announcementText.innerHTML = `<strong>Target update:</strong> ${targetNote} ${profitMessage}`;
}

function downloadDailyClosingReportCSV() {
  const todaysSales = getTodaysSales(currentSales);
  if (!todaysSales.length) {
    showAlert('No sales today to export.', 'info');
    return;
  }

  const headers = ['No', 'Item', 'Description', 'Part No', 'Time sold', 'Payment Method', 'Sale Total'];
  const rows = [];
  let counter = 0;

  todaysSales.forEach((sale) => {
    (sale.items || []).forEach((item) => {
      counter += 1;
      const product = currentProducts.find((productEntry) => productEntry.id === item.id) || {};
      rows.push([
        counter,
        `${item.name || 'Unknown item'}${item.quantity ? ` x${item.quantity}` : ''}`,
        product.description || '-',
        product.partNo || '-',
        parseFirestoreDate(sale.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sale.paymentMethod || 'Cash',
        formatCurrency(sale.totalAmount)
      ]);
    });
  });

  const csvContent = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'daily-closing-report.csv';
  link.click();
  URL.revokeObjectURL(url);
}

function generateRestockOrderCSV() {
  const lowStockItems = currentProducts.filter((product) => Number(product.qty) < 5).sort((a, b) => (Number(a.qty) || 0) - (Number(b.qty) || 0));
  if (!lowStockItems.length) {
    showAlert('No restock items available to export.', 'info');
    return;
  }

  const headers = ['No', 'Item', 'Description', 'Part No', 'Current Qty', 'Order Qty'];
  const rows = lowStockItems.map((product, index) => [
    index + 1,
    product.name || 'Unnamed item',
    product.description || '-',
    product.partNo || '-',
    Number(product.qty || 0),
    Math.max(5 - Number(product.qty || 0), 1)
  ]);

  const csvContent = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'restock-order-list.csv';
  link.click();
  URL.revokeObjectURL(url);
}

async function shareRestockOrderList() {
  const lowStockItems = currentProducts.filter((product) => Number(product.qty) < 5).sort((a, b) => (Number(a.qty) || 0) - (Number(b.qty) || 0));
  if (!lowStockItems.length) {
    showAlert('No restock items available to share.', 'info');
    return;
  }

  const lines = [
    'No, Item, Description, Part No, Current Qty, Order Qty',
    ...lowStockItems.map((product, index) => {
      const orderQty = Math.max(5 - Number(product.qty || 0), 1);
      return `${index + 1}, ${product.name || 'Unnamed item'}, ${product.description || '-'}, ${product.partNo || '-'}, ${Number(product.qty || 0)}, ${orderQty}`;
    })
  ];
  const message = `Restock order list:\n${lines.join('\n')}`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: 'Restock Order List',
        text: lines.join('\n')
      });
      return;
    } catch (error) {
      console.warn('Share cancelled or failed', error);
    }
  }

  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(message);
      showAlert('Restock order text copied to clipboard.', 'success');
      return;
    } catch (clipboardError) {
      console.warn('Clipboard share failed', clipboardError);
    }
  }

  showAlert('Unable to share restock list automatically. Please use download instead.', 'warning');
}

function updateStockProductSelect(products) {
  const select = document.getElementById('stockProductSelect');
  if (!select) return;

  const selectedValue = select.value;
  select.innerHTML = '<option value="">Choose a product...</option>' + products.map((product) => `
      <option value="${product.id}">${product.name} (${product.qty ?? 0})</option>
    `).join('');

  if (selectedValue) select.value = selectedValue;
}

window.addStockQuantity = async function () {
  const select = document.getElementById('stockProductSelect');
  const quantityInput = document.getElementById('addStockQty');
  const productId = select?.value;
  const amount = Number(quantityInput?.value || 0);

  if (!productId || amount <= 0) {
    showAlert('Please select a product and enter a valid quantity.', 'warning');
    return;
  }

  const product = currentProducts.find((item) => item.id === productId);
  if (!product) {
    showAlert('Selected product was not found.', 'error');
    return;
  }

  try {
    await updateProduct(productId, { qty: (Number(product.qty) || 0) + amount });
    if (quantityInput) quantityInput.value = '';
    showAlert('Stock updated successfully.', 'success');
  } catch (error) {
    console.error('Unable to update stock quantity', error);
    showAlert('Failed to update stock. Please try again.', 'error');
  }
};

window.editProduct = async function (productId) {
  const product = currentProducts.find((item) => item.id === productId);
  if (!product) {
    showAlert('Product not found.', 'error');
    return;
  }

  const newQty = window.prompt('Enter new stock quantity:', product.qty ?? 0);
  if (newQty === null) return;
  const newSellPrice = window.prompt('Enter new selling price:', product.sellPrice ?? 0);
  if (newSellPrice === null) return;
  const newBuyPrice = window.prompt('Enter new buying price:', product.buyPrice ?? 0);
  if (newBuyPrice === null) return;
  const newPartNo = window.prompt('Enter new part number:', product.partNo || '');
  if (newPartNo === null) return;
  const newDescription = window.prompt('Enter new description:', product.description || '');
  if (newDescription === null) return;

  try {
    await updateProduct(productId, {
      qty: Number(newQty),
      sellPrice: Number(newSellPrice),
      buyPrice: Number(newBuyPrice),
      partNo: newPartNo.trim(),
      description: newDescription.trim()
    });
    showAlert('Product updated successfully.', 'success');
  } catch (error) {
    console.error('Unable to edit product', error);
    showAlert('Product update failed. Please try again.', 'error');
  }
};

window.downloadStockPDF = function () {
  const title = 'Stock Registry';
  const printableRows = currentProducts.map((product) => `
      <tr>
        <td>${product.name}</td>
        <td>${product.qty ?? 0}</td>
        <td>${product.partNo || '-'}</td>
        <td>${formatCurrency(product.buyPrice)}</td>
        <td>${formatCurrency(product.sellPrice)}</td>
        <td>${product.description || '-'}</td>
        <td>${parseFirestoreDate(product.createdAt).toLocaleDateString()}</td>
      </tr>
    `).join('');

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    showAlert('Unable to open print window. Please allow popups for this page.', 'warning');
    return;
  }

  printWindow.document.write(`
      <html>
        <head>
          <title>${title}</title>
          <style>
            body{font-family:Arial,Helvetica,sans-serif;padding:20px;color:#111}
            table{width:100%;border-collapse:collapse;margin-top:20px}
            th,td{border:1px solid #ccc;padding:8px;text-align:left}
            th{background:#f5f5f5}
          </style>
        </head>
        <body>
          <h1>${title}</h1>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Qty</th>
                <th>Part No.</th>
                <th>Buy Price</th>
                <th>Sell Price</th>
                <th>Description</th>
                <th>Date Added</th>
              </tr>
            </thead>
            <tbody>
              ${printableRows}
            </tbody>
          </table>
        </body>
      </html>
    `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
};

window.addToCart = function (productId) {
  const product = currentProducts.find((item) => item.id === productId);
  if (!product) {
    showAlert('Product not available.', 'error');
    return;
  }

  const cartItem = cart.find((item) => item.id === productId);
  if (cartItem) {
    cartItem.quantity += 1;
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      sellPrice: Number(product.sellPrice) || 0,
      qty: Number(product.qty) || 0,
      quantity: 1
    });
  }

  renderCart();
};

window.changeCartItemQuantity = function (productId, delta) {
  const cartItem = cart.find((item) => item.id === productId);
  if (!cartItem) return;
  cartItem.quantity = Math.max(1, cartItem.quantity + delta);
  renderCart();
};

window.removeCartItem = function (productId) {
  cart = cart.filter((item) => item.id !== productId);
  renderCart();
};

function renderCart() {
  const cartList = document.getElementById('cartList');
  if (!cartList) return;

  if (!cart.length) {
    cartList.innerHTML = '<p class="empty-cart">No items in cart</p>';
    updateCartSummary();
    return;
  }

  cartList.innerHTML = cart.map((item) => `
      <div class="cart-item-row">
        <div class="cart-item-details">
          <strong>${item.name}</strong>
          <span>${formatCurrency(item.sellPrice)} each</span>
          <span>${item.qty} in stock</span>
        </div>
        <div class="cart-item-actions">
          <button class="btn btn-small" onclick="changeCartItemQuantity('${item.id}', -1)">-</button>
          <span>${item.quantity}</span>
          <button class="btn btn-small" onclick="changeCartItemQuantity('${item.id}', 1)">+</button>
          <button class="btn btn-ghost" onclick="removeCartItem('${item.id}')">Remove</button>
        </div>
      </div>
    `).join('');

  updateCartSummary();
}

function updateCartSummary() {
  const subtotalEl = document.getElementById('subtotal');
  const totalEl = document.getElementById('total');
  const checkoutBtn = document.getElementById('checkoutBtn');

  const total = cart.reduce((sum, item) => sum + item.quantity * Number(item.sellPrice), 0);
  const subtotalText = formatCurrency(total);

  if (subtotalEl) subtotalEl.textContent = subtotalText;
  if (totalEl) totalEl.textContent = subtotalText;
  if (checkoutBtn) checkoutBtn.disabled = cart.length === 0;
}

async function completeSale() {
  if (!cart.length) {
    showAlert('Add items to the cart before completing a sale.', 'warning');
    return;
  }

  try {
    const totalAmount = cart.reduce((sum, item) => sum + item.quantity * Number(item.sellPrice), 0);
    await createSale({
      adminUid,
      items: cart.map((item) => ({ id: item.id, name: item.name, quantity: item.quantity, sellPrice: item.sellPrice })),
      totalAmount,
      paymentMethod: 'Cash'
    });

    for (const item of cart) {
      const product = currentProducts.find((p) => p.id === item.id);
      if (product) {
        await updateProduct(item.id, { qty: Math.max((Number(product.qty) || 0) - item.quantity, 0) });
      }
    }

    cart = [];
    renderCart();
    showAlert('Sale completed successfully.', 'success');
  } catch (error) {
    console.error('Unable to complete sale', error);
    showAlert('Sale could not be completed. Please try again.', 'error');
  }
}

function renderSalesHistory(sales) {
  const tbody = document.getElementById('historyTableBody');
  if (!tbody) return;

  const startDateInput = document.getElementById('startDate')?.value;
  const endDateInput = document.getElementById('endDate')?.value;
  const startDate = startDateInput ? new Date(startDateInput) : null;
  const endDate = endDateInput ? new Date(endDateInput) : null;
  if (endDate) endDate.setHours(23, 59, 59, 999);

  const filteredSales = sales.filter((sale) => {
    const saleDate = parseFirestoreDate(sale.timestamp);
    if (startDate && saleDate < startDate) return false;
    if (endDate && saleDate > endDate) return false;
    return true;
  });

  if (!filteredSales.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center color-muted">No sales history found for the selected range.</td>
      </tr>
    `;
  } else {
    tbody.innerHTML = filteredSales.map((sale) => `
      <tr>
        <td>${parseFirestoreDate(sale.timestamp).toLocaleString()}</td>
        <td>#${sale.invoiceId || sale.id}</td>
        <td>${(sale.items || []).length} item${(sale.items || []).length === 1 ? '' : 's'}</td>
        <td>${formatCurrency(sale.totalAmount)}</td>
        <td>${sale.paymentMethod || 'Cash'}</td>
        <td class="text-center"><button class="btn-view">View</button></td>
      </tr>
    `).join('');
  }

  updateHistoryStats(filteredSales);
}

function updateHistoryStats(sales) {
  const totalRevenue = sales.reduce((sum, sale) => sum + Number(sale.totalAmount || 0), 0);
  const invoiceCount = sales.length;
  const average = invoiceCount ? totalRevenue / invoiceCount : 0;

  const historyRevenueValue = document.getElementById('historyRevenueValue');
  const historyInvoiceCountValue = document.getElementById('historyInvoiceCountValue');
  const historyAverageValue = document.getElementById('historyAverageValue');
  if (historyRevenueValue) historyRevenueValue.textContent = formatCurrency(totalRevenue);
  if (historyInvoiceCountValue) historyInvoiceCountValue.textContent = invoiceCount.toString();
  if (historyAverageValue) historyAverageValue.textContent = formatCurrency(average);
}

function exportSalesHistoryCSV() {
  if (!currentSales.length) {
    showAlert('No sales records available to export.', 'info');
    return;
  }

  const headers = ['Date', 'Invoice ID', 'Items Sold', 'Total Amount', 'Payment Method'];
  const rows = currentSales.map((sale) => [
    parseFirestoreDate(sale.timestamp).toLocaleString(),
    sale.invoiceId || sale.id,
    (sale.items || []).length,
    sale.totalAmount,
    sale.paymentMethod || 'Cash'
  ]);

  const csvContent = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'sales-history.csv';
  link.click();
  URL.revokeObjectURL(url);
}

window.handleLogout = async function () {
  try {
    await signOut(auth);
    localStorage.clear();
    window.location.href = 'login.html';
  } catch (error) {
    console.error('Logout failed', error);
  }
};

// Start sales: activate in-page sales section and redirect to full sales terminal
window.startSales = function() {
  try {
    // attempt to show the in-dashboard sales engine for quick access
    if (typeof showSection === 'function') showSection('sales');
  } catch (e) {
    console.warn('showSection not available', e);
  }
  // navigate to the dedicated sales terminal page
  window.location.href = 'sales.html';
};

window.addEventListener('DOMContentLoaded', () => {
  setTimeout(hideDashboardLoader, 300);
});

window.initializePageHandlers = initializePageHandlers;
window.initListeners = initListeners;
window.refreshTargetInsights = function() {
  if (typeof refreshTargetInsights === 'function') refreshTargetInsights(currentSales);
};

initializePageHandlers();

// AI BUSINESS ADVISOR INTEGRATION

function updateAdvisorPanel() {
  const bizName = currentBusiness?.businessName || currentBusiness?.name || 'ShopMapp Store';
  const displayBizName = document.getElementById('advisorContextBusinessName');
  if (displayBizName) displayBizName.textContent = bizName;

  const totalProd = currentProducts.length;
  const displayTotalProd = document.getElementById('advisorContextTotalProducts');
  if (displayTotalProd) displayTotalProd.textContent = totalProd;

  const outOfStock = currentProducts.filter(p => (Number(p.stock) || Number(p.qty) || 0) === 0).length;
  const displayOutOfStock = document.getElementById('advisorContextOutOfStock');
  if (displayOutOfStock) displayOutOfStock.textContent = outOfStock;

  const lowStock = currentProducts.filter(p => {
    const s = Number(p.stock) || Number(p.qty) || 0;
    return s > 0 && s < 5;
  }).length;
  const displayLowStock = document.getElementById('advisorContextLowStock');
  if (displayLowStock) displayLowStock.textContent = lowStock;

  const totalSalesCount = currentSales.length;
  const displayTotalSales = document.getElementById('advisorContextTotalSales');
  if (displayTotalSales) displayTotalSales.textContent = totalSalesCount;

  const totalRevenue = currentSales.reduce((sum, s) => sum + (Number(s.totalAmount) || 0), 0);
  const displayTotalRev = document.getElementById('advisorContextTotalRevenue');
  if (displayTotalRev) displayTotalRev.textContent = formatCurrency(totalRevenue);
}

function getBusinessContext() {
  // Aggregate products
  const productsSummary = currentProducts.map(p => ({
    name: p.name,
    category: p.category || 'General',
    price: Number(p.sellPrice || p.price) || 0,
    cost: Number(p.buyPrice || p.cost) || 0,
    stock: Number(p.qty || p.stock) || 0,
    partNo: p.partNo || ''
  }));

  // Aggregate sales (recent 30 transactions)
  const sortedSales = [...currentSales].sort((a, b) => {
    const dateA = parseFirestoreDate(a.timestamp);
    const dateB = parseFirestoreDate(b.timestamp);
    return dateB - dateA;
  });

  const salesSummary = sortedSales.slice(0, 30).map(s => {
    const saleDate = parseFirestoreDate(s.timestamp).toISOString().split('T')[0];
    return {
      date: saleDate,
      total: Number(s.totalAmount) || 0,
      paymentMethod: s.paymentMethod || 'Cash',
      itemsCount: (s.items || []).reduce((sum, item) => sum + (Number(item.quantity || item.qty) || 0), 0),
      items: (s.items || []).map(item => ({
        name: item.name,
        price: Number(item.sellPrice || item.price) || 0,
        qty: Number(item.quantity || item.qty) || 0
      }))
    };
  });

  return {
    businessName: currentBusiness?.businessName || currentBusiness?.name || 'ShopMapp Store',
    businessType: currentBusiness?.businessType || 'Retail',
    location: currentBusiness?.location || 'General',
    description: currentBusiness?.description || '',
    currency: currentCurrency,
    taxRate: currentBusiness?.taxRate || 0,
    metrics: {
      totalProducts: currentProducts.length,
      outOfStockCount: currentProducts.filter(p => (Number(p.qty || p.stock) || 0) === 0).length,
      lowStockCount: currentProducts.filter(p => (Number(p.qty || p.stock) || 0) < 5 && (Number(p.qty || p.stock) || 0) > 0).length,
      totalSalesCount: currentSales.length,
      totalRevenue: currentSales.reduce((sum, s) => sum + (Number(s.totalAmount) || 0), 0)
    },
    products: productsSummary,
    recentSales: salesSummary
  };
}

function generateMockAdvisorResponse(question, products, sales) {
  // Offline/fallback advisor providing basic insights from local data
  const lowStockItems = products.filter(p => (p.qty || 0) > 0 && (p.qty || 0) < 5);
  const outOfStockItems = products.filter(p => (p.qty || 0) === 0);
  const totalRev = sales.reduce((sum, s) => sum + (Number(s.totalAmount) || 0), 0);
  const avgSale = sales.length > 0 ? totalRev / sales.length : 0;

  const lowerQ = question.toLowerCase();
  if (lowerQ.includes('stock') || lowerQ.includes('inventory')) {
    return `📦 **Stock Overview (Local Analysis)**\n- Total items in stock: ${products.length}\n- Out of stock: ${outOfStockItems.length}\n- Low stock (<5 units): ${lowStockItems.length}\n\n${lowStockItems.length > 0 ? `**Items to restock**: ${lowStockItems.map(p => p.name).join(', ')}` : 'All items well stocked!'}\n\n*Note: For deeper AI insights, ensure your API key is configured.*`;
  } else if (lowerQ.includes('revenue') || lowerQ.includes('sales') || lowerQ.includes('profit')) {
    return `📈 **Revenue Analysis (Local Data)**\n- Total revenue: KES ${totalRev.toLocaleString()}\n- Transactions: ${sales.length}\n- Average sale: KES ${avgSale.toLocaleString()}\n\n*Note: For AI-powered recommendations, check your serverless function configuration.*`;
  } else if (lowerQ.includes('product') || lowerQ.includes('bestseller')) {
    const bestSeller = sales.length > 0 ? sales.reduce((best, s) => { const top = (s.items || []).reduce((a, b) => (a.quantity || 0) > (b.quantity || 0) ? a : b, {}); return top.name ? top : best; }, {}) : null;
    return `🏆 **Product Analysis (Local)**\n- Total products: ${products.length}\n${bestSeller ? `- Most commonly purchased: ${bestSeller.name}` : '- No sales data yet'}\n\n*For strategic recommendations, enable your AI advisor backend.*`;
  }
  return `💡 **ShopMapp Advisor (Offline Mode)**\n\nI'm currently running in offline mode with limited insights. To enable full AI analysis:\n\n1. Ensure \`GEMINI_API_KEY\` is set in your Netlify environment\n2. Deploy to Netlify or set up your serverless function endpoint\n3. Try your question again once the backend is ready\n\n**What I can tell you now:**\n- Products in stock: ${products.length}\n- Total revenue: KES ${totalRev.toLocaleString()}\n- Transactions: ${sales.length}`;
}

async function submitAdvisorMessage() {
  const inputEl = document.getElementById('chatInput');
  if (!inputEl) return;
  const userText = inputEl.value.trim();
  if (!userText) return;

  inputEl.value = '';
  addChatMessageToUI('user', userText);

  const statusBadge = document.getElementById('advisorStatusBadge');
  if (statusBadge) {
    statusBadge.textContent = 'Thinking...';
    statusBadge.className = 'status-badge loading';
  }

  const sendBtn = document.getElementById('sendChatBtn');
  if (inputEl) inputEl.disabled = true;
  if (sendBtn) sendBtn.disabled = true;

  try {
    const bizContext = getBusinessContext();
    const endpoints = [
      window.AI_GATEWAY_ENDPOINT || '/api/ai-advisor',
      '/.netlify/functions/ai-advisor',
      '/functions/ai-advisor'
    ];

    let response = null;
    let lastError = null;

    for (const ep of endpoints) {
      try {
        response = await fetch(ep, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: userText, chatHistory: advisorChatHistory, context: bizContext })
        });
        if (response.ok) break;
        lastError = `HTTP ${response.status} @ ${ep}`;
        // Try alternate endpoints on common gateway/auth failures too
        if ([401, 403, 404].includes(response.status)) continue;
        break;
      } catch (err) {
        lastError = err;
        // try next endpoint
        continue;
      }
    }

    if (!response) throw new Error('No endpoint responded: ' + (lastError || 'unknown'));


    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${response.status} - ${errData.details || ''}`);
    }

    const data = await response.json();
    const reply = data.response;

    addChatMessageToUI('bot', reply);
    advisorChatHistory.push({ role: 'user', content: userText });
    advisorChatHistory.push({ role: 'assistant', content: reply });

  } catch (error) {
    console.error('AI Advisor error:', error);
    const backendMessage = error?.message || 'unknown failure';
    addChatMessageToUI('bot', `⚠️ Backend unavailable (${backendMessage}). Providing local analysis instead...`);
    if (error?.details) {
      addChatMessageToUI('bot', `🔧 Diagnostic: ${error.details}`);
    }
    const fallbackResponse = generateMockAdvisorResponse(userText, currentProducts, currentSales);
    addChatMessageToUI('bot', fallbackResponse);
    advisorChatHistory.push({ role: 'user', content: userText });
    advisorChatHistory.push({ role: 'assistant', content: `Backend fallback response: ${fallbackResponse}` });
  } finally {
    if (statusBadge) {
      statusBadge.textContent = 'Ready';
      statusBadge.className = 'status-badge';
    }
    if (inputEl) {
      inputEl.disabled = false;
      inputEl.focus();
    }
    if (sendBtn) sendBtn.disabled = false;
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderMarkdown(text) {
  // Safe HTML escapes first
  let html = escapeHtml(text);

  // Bold text (**text**)
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // Inline code (`code`)
  html = html.replace(/`(.*?)`/g, '<code>$1</code>');

  // Bullet points and lists
  const lines = html.split('\n');
  let inList = false;
  let formattedLines = [];

  for (let line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!inList) {
        formattedLines.push('<ul>');
        inList = true;
      }
      formattedLines.push(`<li>${trimmed.substring(2)}</li>`);
    } else {
      if (inList) {
        formattedLines.push('</ul>');
        inList = false;
      }
      if (trimmed) {
        formattedLines.push(`<p>${line}</p>`);
      } else {
        formattedLines.push('<br>');
      }
    }
  }
  if (inList) {
    formattedLines.push('</ul>');
  }

  return formattedLines.join('\n');
}

function addChatMessageToUI(role, text) {
  const chatHistoryEl = document.getElementById('chatHistory');
  if (!chatHistoryEl) return;

  const msgDiv = document.createElement('div');
  msgDiv.className = `chat-message ${role === 'user' ? 'user-message' : 'bot-message'}`;

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';
  contentDiv.innerHTML = role === 'user' ? `<p>${escapeHtml(text)}</p>` : renderMarkdown(text);

  msgDiv.appendChild(contentDiv);
  chatHistoryEl.appendChild(msgDiv);

  // Auto-scroll to bottom
  chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
}

window.sendAdvisorPrompt = function(promptText) {
  const inputEl = document.getElementById('chatInput');
  if (inputEl) {
    inputEl.value = promptText;
    submitAdvisorMessage();
  }
};

window.handleAdvisorKeyPress = function(event) {
  if (event.key === 'Enter') {
    submitAdvisorMessage();
  }
};
async function askBusinessAdvisor(userMessage) {
  const chatContainer = document.getElementById('advisorChatContainer'); // Replace with your actual UI ID
  showDashboardLoader();

  try {
    // 1. Live state metrics calculations matching your dashboard updates
    const totalRevenueSum = currentSales.reduce((sum, sale) => sum + Number(sale.totalAmount || 0), 0);
    const outOfStockCount = currentProducts.filter(p => Number(p.qty || 0) <= 0).length;
    const lowStockCount = currentProducts.filter(p => Number(p.qty || 0) < 5).length;

    // 2. Pack business variables exactly how your endpoint expects them
    const bizContext = {
      businessName: currentBusiness?.businessName || currentBusiness?.name || 'My ShopMapp Store',
      businessType: currentBusiness?.businessType || 'Retail',
      location: currentBusiness?.location || 'Kenya',
      currency: currentCurrency,
      metrics: {
        totalRevenue: totalRevenueSum,
        totalProducts: currentProducts.length,
        outOfStockCount: outOfStockCount,
        lowStockCount: lowStockCount,
        totalSalesCount: currentSales.length
      },
      // Keep payload footprint tiny to protect your token limits
      products: currentProducts.slice(0, 35).map(p => ({
        name: p.name,
        stock: p.qty ?? 0,
        price: p.sellPrice || 0,
        costPrice: p.buyPrice || 0
      })),
      recentSales: currentSales.slice(0, 20).map(s => ({
        itemsSummary: (s.items || []).map(i => `${i.name} (x${i.quantity || 1})`).join(', '),
        totalAmount: s.totalAmount || 0,
        createdAt: parseFirestoreDate(s.timestamp).toLocaleDateString()
      }))
    };

    // 3. Network post call directly to your local endpoint
    const endpoints = [window.AI_GATEWAY_ENDPOINT || '/api/ai-advisor','/.netlify/functions/ai-advisor','/functions/ai-advisor'];
    let response = null;
    let lastErr = null;
    for (const ep of endpoints) {
      try {
        response = await fetch(ep, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: userMessage, chatHistory: advisorChatHistory, context: bizContext })
        });
        if (response.ok) break;
        lastErr = `HTTP ${response.status} @ ${ep}`;
        if (response.status === 404) continue;
        break;
      } catch (err) {
        lastErr = err;
        continue;
      }
    }
    if (!response || !response.ok) throw new Error('Network issue contacting the server-side advisor: ' + (lastErr || 'no response'));

    const data = await response.json();
    
    // 4. Update memory structures to keep chat sequential
    advisorChatHistory.push({ role: 'user', content: userMessage });
    advisorChatHistory.push({ role: 'assistant', content: data.response });

    // Append response to your UI
    if (chatContainer) {
      chatContainer.innerHTML += `<div class="ai-reply">${data.response}</div>`;
    }

  } catch (error) {
    console.error('Advisor Pipeline Error:', error);
    showAlert('Could not load insights. Check your network link.', 'error');
  } finally {
    hideDashboardLoader();
  }
}

// Attach it global scope if binding via window inline events
window.askBusinessAdvisor = askBusinessAdvisor;

window.submitAdvisorMessage = submitAdvisorMessage;
window.updateAdvisorPanel = updateAdvisorPanel;
window.AI_GATEWAY_ENDPOINT = window.AI_GATEWAY_ENDPOINT || null; // Allow client to override advisor endpoint via window variable
