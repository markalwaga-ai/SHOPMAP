/**
 * SHOPMAP Notification & Alert System
 * Provides enhanced toast notifications, alerts, and loading overlays
 */

// ============= NOTIFICATION SYSTEM =============

/**
 * Create and show a notification toast
 * @param {string} message - The notification message
 * @param {string} type - Type: 'success', 'error', 'warning', 'info'
 * @param {number} duration - Duration in ms (0 = manual dismiss)
 * @param {object} options - Additional options
 */
export function showNotification(message, type = 'info', duration = 4000, options = {}) {
    // Ensure container exists
    let container = document.getElementById('notification-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'notification-container';
        document.body.appendChild(container);
    }

    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type} ${options.animated ? 'animate-in' : ''}`;
    
    // Add icon based on type
    const icons = {
        success: '✓',
        error: '✕',
        warning: '⚠',
        info: 'ℹ'
    };

    const icon = icons[type] || icons.info;
    
    // Build HTML
    notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-icon">${icon}</span>
            <span class="notification-message">${escapeHtml(message)}</span>
            ${options.closable !== false ? '<button class="notification-close" aria-label="Close">×</button>' : ''}
        </div>
    `;

    container.appendChild(notification);

    // Auto-remove after duration
    if (duration > 0) {
        setTimeout(() => dismissNotification(notification), duration);
    }

    // Close button handler
    const closeBtn = notification.querySelector('.notification-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => dismissNotification(notification));
    }

    return notification;
}

/**
 * Dismiss a notification with animation
 */
function dismissNotification(notification) {
    notification.classList.add('animate-out');
    setTimeout(() => notification.remove(), 300);
}

/**
 * Show success notification
 */
export function successNotification(message, duration = 3500) {
    return showNotification(message, 'success', duration, { animated: true });
}

/**
 * Show error notification
 */
export function errorNotification(message, duration = 5000) {
    return showNotification(message, 'error', duration, { animated: true });
}

/**
 * Show warning notification
 */
export function warningNotification(message, duration = 4000) {
    return showNotification(message, 'warning', duration, { animated: true });
}

/**
 * Show info notification
 */
export function infoNotification(message, duration = 3500) {
    return showNotification(message, 'info', duration, { animated: true });
}

// ============= ALERT DIALOG SYSTEM =============

/**
 * Show a modal alert dialog
 * @param {string} title - Alert title
 * @param {string} message - Alert message
 * @param {string} type - Type: 'info', 'success', 'warning', 'error'
 * @param {array} buttons - Button configuration
 */
export async function showAlert(title, message, type = 'info', buttons = [{ label: 'OK', value: 'ok' }]) {
    return new Promise((resolve) => {
        // Create overlay
        const overlay = document.createElement('div');
        overlay.className = 'alert-overlay';
        
        // Create alert box
        const alertBox = document.createElement('div');
        alertBox.className = `alert-box alert-${type}`;

        // Icon mapping
        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };

        const icon = icons[type] || icons.info;

        // Build HTML
        alertBox.innerHTML = `
            <div class="alert-header">
                <span class="alert-icon">${icon}</span>
                <h2 class="alert-title">${escapeHtml(title)}</h2>
            </div>
            <div class="alert-body">
                <p class="alert-message">${escapeHtml(message)}</p>
            </div>
            <div class="alert-footer">
                ${buttons.map((btn, idx) => `
                    <button class="alert-button ${btn.className || ''}" data-value="${idx}">
                        ${escapeHtml(btn.label)}
                    </button>
                `).join('')}
            </div>
        `;

        overlay.appendChild(alertBox);
        document.body.appendChild(overlay);

        // Add animation
        setTimeout(() => alertBox.classList.add('show'), 10);

        // Button handlers
        alertBox.querySelectorAll('.alert-button').forEach((btn, idx) => {
            btn.addEventListener('click', () => {
                alertBox.classList.remove('show');
                setTimeout(() => {
                    overlay.remove();
                    resolve(buttons[idx].value);
                }, 300);
            });
        });

        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                alertBox.classList.remove('show');
                setTimeout(() => {
                    overlay.remove();
                    resolve(null);
                }, 300);
            }
        });
    });
}

/**
 * Show confirmation dialog
 */
export function confirmDialog(title, message) {
    return showAlert(title, message, 'warning', [
        { label: 'Cancel', value: false, className: 'btn-secondary' },
        { label: 'Confirm', value: true, className: 'btn-primary' }
    ]);
}

// ============= LOADING OVERLAY SYSTEM =============

/**
 * Show loading overlay
 * @param {string} message - Loading message
 * @param {boolean} blockInteraction - Block user interaction
 */
export function showLoading(message = 'Loading...', blockInteraction = true) {
    let overlay = document.getElementById('loading-overlay');
    
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'loading-overlay';
        overlay.className = blockInteraction ? 'loading-overlay active' : 'loading-overlay non-blocking';
        
        overlay.innerHTML = `
            <div class="loading-container">
                <div class="loading-spinner">
                    <div class="spinner-circle"></div>
                </div>
                <p class="loading-message">${escapeHtml(message)}</p>
            </div>
        `;
        
        document.body.appendChild(overlay);
    } else {
        overlay.classList.add('active');
        overlay.querySelector('.loading-message').textContent = message;
    }
    
    return overlay;
}

/**
 * Hide loading overlay
 */
export function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.classList.remove('active');
        setTimeout(() => {
            overlay.classList.add('hidden');
        }, 300);
    }
}

/**
 * Show progress bar
 * @param {number} progress - Progress percentage (0-100)
 * @param {string} label - Progress label
 */
export function showProgress(progress = 0, label = '') {
    let progressBar = document.getElementById('progress-bar');
    
    if (!progressBar) {
        progressBar = document.createElement('div');
        progressBar.id = 'progress-bar';
        progressBar.className = 'progress-bar-container active';
        progressBar.innerHTML = `
            <div class="progress-fill"></div>
            <div class="progress-label"></div>
        `;
        document.body.appendChild(progressBar);
    }

    progressBar.classList.add('active');
    const fill = progressBar.querySelector('.progress-fill');
    const labelEl = progressBar.querySelector('.progress-label');
    
    fill.style.width = Math.min(100, Math.max(0, progress)) + '%';
    if (label) labelEl.textContent = label;
}

/**
 * Hide progress bar
 */
export function hideProgress() {
    const progressBar = document.getElementById('progress-bar');
    if (progressBar) {
        progressBar.classList.remove('active');
    }
}

// ============= UTILITY FUNCTIONS =============

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * Show loading state on a button
 */
export function setButtonLoading(button, isLoading = true) {
    if (isLoading) {
        button.disabled = true;
        button.setAttribute('data-original-text', button.textContent);
        button.innerHTML = '<span class="btn-spinner"></span> Processing...';
        button.classList.add('loading');
    } else {
        button.disabled = false;
        button.textContent = button.getAttribute('data-original-text') || 'Submit';
        button.classList.remove('loading');
    }
}

/**
 * Disable form inputs and show loading state
 */
export function setFormLoading(form, isLoading = true) {
    const inputs = form.querySelectorAll('input, textarea, select, button');
    inputs.forEach(input => {
        if (input.type !== 'button') {
            input.disabled = isLoading;
        } else {
            setButtonLoading(input, isLoading);
        }
    });
}

/**
 * Request full screen loading
 * Useful for critical operations
 */
export function showFullScreenLoading(message = 'Processing...') {
    return showLoading(message, true);
}

/**
 * Execute async operation with loading state
 */
export async function withLoading(asyncFn, loadingMessage = 'Loading...') {
    showLoading(loadingMessage);
    try {
        const result = await asyncFn();
        hideLoading();
        return result;
    } catch (error) {
        hideLoading();
        errorNotification(error.message || 'An error occurred');
        throw error;
    }
}

/**
 * Execute with progress tracking
 */
export async function withProgress(asyncFn, progressInterval = 100) {
    let progress = 0;
    const progressInterval_ms = progressInterval;
    
    showProgress(0);
    
    const progressTimer = setInterval(() => {
        progress = Math.min(progress + Math.random() * 30, 90);
        showProgress(progress);
    }, progressInterval_ms);
    
    try {
        const result = await asyncFn();
        clearInterval(progressTimer);
        showProgress(100);
        setTimeout(() => hideProgress(), 500);
        return result;
    } catch (error) {
        clearInterval(progressTimer);
        hideProgress();
        throw error;
    }
}

// ============= GLOBAL EXPORTS =============

// Make key functions available globally for easier access in HTML
if (typeof window !== 'undefined') {
    window.showNotification = showNotification;
    window.successNotification = successNotification;
    window.errorNotification = errorNotification;
    window.warningNotification = warningNotification;
    window.infoNotification = infoNotification;
    window.showAlert = showAlert;
    window.confirmDialog = confirmDialog;
    window.showLoading = showLoading;
    window.hideLoading = hideLoading;
    window.setButtonLoading = setButtonLoading;
    window.withLoading = withLoading;
}
