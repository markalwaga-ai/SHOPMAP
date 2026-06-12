// Dashboard Metrics Enhancement Functions
// This file is imported by overview.js as a module.

function parseFirestoreDate(timestamp) {
  if (!timestamp) return new Date();
  if (timestamp.toDate) return timestamp.toDate();
  return new Date((timestamp.seconds || 0) * 1000);
}

function formatCurrency(amount) {
  const value = Number(amount) || 0;
  return `KES ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Enhanced financial metrics calculation and display
 * @param {number} revenue - Total revenue for the day
 * @param {number} expenses - Total expenses for the day
 * @param {number} transactionCount - Number of transactions
 * @param {number} avgSale - Average sale amount
 */
export function updateFinancialMetrics(revenue, expenses, transactionCount, avgSale) {
  // Net Profit Calculation
  const netProfit = revenue - expenses;
  const netProfitEl = document.getElementById('netProfitValue');
  if (netProfitEl) {
    netProfitEl.textContent = `KES ${Math.max(0, netProfit).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  }

  // Revenue Breakdown
  const revenueEl = document.getElementById('netProfitRevenue');
  if (revenueEl) {
    revenueEl.textContent = `KES ${revenue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  }

  // Expenses Breakdown
  const expensesEl = document.getElementById('netProfitExpenses');
  if (expensesEl) {
    expensesEl.textContent = `KES ${expenses.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  }

  // Gross Sales Card
  const grossSalesEl = document.getElementById('grossSalesValue');
  if (grossSalesEl) {
    grossSalesEl.textContent = `KES ${revenue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  }

  // Transaction Count
  const transactionCountEl = document.getElementById('transactionCount');
  if (transactionCountEl) {
    transactionCountEl.textContent = transactionCount;
  }

  // Average Sale Amount
  const avgSaleEl = document.getElementById('avgSaleValue');
  if (avgSaleEl) {
    avgSaleEl.textContent = `KES ${avgSale.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  }

  // Base Expenses Card
  const baseExpensesEl = document.getElementById('baseExpensesValue');
  if (baseExpensesEl) {
    baseExpensesEl.textContent = `KES ${expenses.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  }

  // Operating Expenses (60% of total)
  const operatingExpensesEl = document.getElementById('operatingExpenses');
  if (operatingExpensesEl) {
    operatingExpensesEl.textContent = `KES ${(expenses * 0.6).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  }

  // Inventory Expenses (40% of total)
  const inventoryExpensesEl = document.getElementById('inventoryExpenses');
  if (inventoryExpensesEl) {
    inventoryExpensesEl.textContent = `KES ${(expenses * 0.4).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  }

  // Reserved Funds for Growth & Restocking (40% of net profit)
  const reservedFunds = Math.max(0, netProfit * 0.4);
  const reservedFundsEl = document.getElementById('reservedFundsValue');
  if (reservedFundsEl) {
    reservedFundsEl.textContent = `KES ${reservedFunds.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  }

  // Growth Reserve (60% of reserved funds = 24% of net profit)
  const growthReserveEl = document.getElementById('growthReserve');
  if (growthReserveEl) {
    growthReserveEl.textContent = `KES ${(reservedFunds * 0.6).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  }

  // Restock Buffer (40% of reserved funds = 16% of net profit)
  const restockBufferEl = document.getElementById('restockBuffer');
  if (restockBufferEl) {
    restockBufferEl.textContent = `KES ${(reservedFunds * 0.4).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  }
}

/**
 * Update target insights with progress tracking
 * @param {Array} todaysSales - Array of sales from today
 * @param {number} totalRevenue - Total revenue for today
 */
export function updateTargetInsights(todaysSales, totalRevenue, salesTarget = 50000, profitTarget = 0, currentProfit = 0) {
  const DAILY_TARGET = Number(salesTarget) || 50000;
  const percentage = DAILY_TARGET ? Math.min((totalRevenue / DAILY_TARGET) * 100, 100) : 0;

  // Update Target Percentage
  const targetPercentageEl = document.getElementById('targetPercentage');
  if (targetPercentageEl) {
    targetPercentageEl.textContent = Math.round(percentage) + '%';
  }

  // Update Progress Bar Width
  const progressBarEl = document.getElementById('targetProgressBar');
  if (progressBarEl) {
    progressBarEl.style.width = percentage + '%';
  }

  // Current Sales Amount
  const currentSalesTargetEl = document.getElementById('currentSalesTarget');
  if (currentSalesTargetEl) {
    currentSalesTargetEl.textContent = Math.round(totalRevenue).toLocaleString();
  }

  // Daily Target Amount
  const dailyTargetEl = document.getElementById('dailyTarget');
  if (dailyTargetEl) {
    dailyTargetEl.textContent = DAILY_TARGET.toLocaleString();
  }

  const profitTargetEl = document.getElementById('profitTargetValue');
  if (profitTargetEl) {
    profitTargetEl.textContent = Number(profitTarget || 0).toLocaleString();
  }

  // Generate Dynamic Insights
  const insight1 = document.getElementById('insight1');
  const insight2 = document.getElementById('insight2');
  const insight3 = document.getElementById('insight3');

  if (insight1) {
    const totalQty = todaysSales.reduce((sum, sale) => {
      return sum + (sale.items || []).reduce((s, item) => s + (item.qty || 0), 0);
    }, 0);
    insight1.textContent = `Sales volume: ${todaysSales.length} transaction(s) with ${totalQty} units sold`;
  }

  if (insight2) {
    const remainingCapacity = DAILY_TARGET - totalRevenue;
    if (remainingCapacity > 0) {
      insight2.textContent = `Current reserves: ${formatCurrency(totalRevenue)} (${formatCurrency(remainingCapacity)} left to sales target)`;
    } else {
      insight2.textContent = `Current reserves: ${formatCurrency(totalRevenue)} - Sales target reached! 🎉`;
    }
  }

  if (insight3) {
    const personalSavings = Math.max(0, currentProfit * 0.35);
    const businessReserve = Math.max(0, currentProfit * 0.65);
    const profitStatus = profitTarget > 0
      ? (currentProfit >= profitTarget ? 'Profit target met ✅' : `${formatCurrency(profitTarget - currentProfit)} to reach profit target`)
      : 'Set a profit target in Business Settings to track this goal.';

    insight3.textContent = `Allocation advice: save ${formatCurrency(personalSavings)}, retain ${formatCurrency(businessReserve)} for business reinvestment. ${profitStatus}`;
  }

  // Render Chart
  renderTargetChart(todaysSales);
}

/**
 * Initialize or update Chart.js visualization
 * @param {Array} todaysSales - Array of sales from today
 */
export function renderTargetChart(todaysSales) {
  const ctx = document.getElementById('targetInsightsChart');
  if (!ctx) return;

  // Initialize hourly data structure
  const hourlyData = {};
  for (let i = 0; i < 24; i++) {
    hourlyData[i] = 0;
  }

  // Aggregate sales by hour
  todaysSales.forEach(sale => {
    if (sale.timestamp && typeof parseFirestoreDate === 'function') {
      const saleTime = parseFirestoreDate(sale.timestamp);
      const hour = saleTime.getHours();
      hourlyData[hour] += Number(sale.totalAmount || sale.total || 0);
    }
  });

  // Build chart labels and data
  const labels = [];
  const data = [];
  for (let i = 0; i < 24; i++) {
    labels.push(i.toString().padStart(2, '0') + ':00');
    data.push(hourlyData[i]);
  }

  // Destroy existing chart if it exists
  if (window.targetChart) {
    window.targetChart.destroy();
  }

  // Create new Chart.js instance
  window.targetChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Sales Revenue (KES)',
        data: data,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointBackgroundColor: '#3b82f6',
        pointBorderColor: 'rgba(255, 255, 255, 0.8)',
        pointBorderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            color: '#cbd5e1'
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.06)'
          }
        },
        x: {
          ticks: {
            color: '#cbd5e1'
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.06)'
          }
        }
      }
    }
  });
}

/**
 * Update top selling items list
 * @param {Array} todaysSales - Array of sales from today
 */
export function updateTopItemsList(todaysSales) {
  const itemCounts = {};

  // Count items sold
  todaysSales.forEach(sale => {
    (sale.items || []).forEach(item => {
      const name = item.name || 'Unknown Item';
      itemCounts[name] = (itemCounts[name] || 0) + (item.qty || 1);
    });
  });

  // Sort and get top 5
  const topItems = Object.entries(itemCounts)
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  const listEl = document.getElementById('topItemsList');
  if (!listEl) return;

  if (topItems.length === 0) {
    listEl.innerHTML = '<div class="empty-state">No sales yet today...</div>';
    return;
  }

  // Render top items with styling
  listEl.innerHTML = topItems.map((item, idx) => `
    <div class="top-item">
      <div class="item-rank">#${idx + 1}</div>
      <div class="item-info">
        <div class="item-name">${escapeHtml(item.name)}</div>
        <div class="item-stats">Top selling product</div>
      </div>
      <div class="item-sales-count">${item.qty} sold</div>
    </div>
  `).join('');
}

/**
 * Update growth allocation advice based on profitability
 * @param {number} revenue - Total revenue
 * @param {number} expenses - Total expenses
 */
export function updateGrowthAllocationAdvice(revenue, expenses) {
  const netProfit = revenue - expenses;

  // Calculate optimal allocation percentages
  const recommendations = {
    restocking: Math.max(0, netProfit * 0.35),  // 35% for inventory restocking
    growth: Math.max(0, netProfit * 0.40),      // 40% for business growth
    retention: Math.max(0, netProfit * 0.25)    // 25% to keep as profit/buffer
  };

  // Update Restocking Advice
  const restockingEl = document.getElementById('adviceRestocking');
  if (restockingEl) {
    restockingEl.textContent = `KES ${recommendations.restocking.toLocaleString(undefined, {minimumFractionDigits: 0})}`;
  }

  // Update Growth Advice
  const growthEl = document.getElementById('adviceGrowth');
  if (growthEl) {
    growthEl.textContent = `KES ${recommendations.growth.toLocaleString(undefined, {minimumFractionDigits: 0})}`;
  }

  // Update Retention Advice
  const retentionEl = document.getElementById('adviceRetention');
  if (retentionEl) {
    retentionEl.textContent = `KES ${recommendations.retention.toLocaleString(undefined, {minimumFractionDigits: 0})}`;
  }
}

/**
 * Refresh all dashboard insights
 * Call this when you need to recalculate everything
 */
export function refreshTargetInsights(sales = [], salesTarget = 50000, profitTarget = 0, currentProfit = 0) {
  if (!Array.isArray(sales)) return;
  const todaysSales = sales.filter((sale) => {
    const saleDate = parseFirestoreDate(sale.timestamp);
    saleDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return saleDate.getTime() === today.getTime();
  });
  updateTargetInsights(todaysSales, todaysSales.reduce((sum, sale) => sum + Number(sale.totalAmount || 0), 0), salesTarget, profitTarget, currentProfit);
}

/**
 * Utility function to escape HTML special characters
 * @param {string} text - Text to escape
 * @returns {string} - Escaped text
 */
export function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}
