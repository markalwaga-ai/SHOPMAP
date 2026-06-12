// Global data store for sharing between pages
export const globalData = {
    adminUid: "",
    userRole: "admin",
    businessName: "ShopMapp Retail",
    businessType: "",
    businessEmail: "",
    businessPhone: "",
    businessDescription: "",
    userEmail: "",
    userName: "",
    isAuthenticated: false,
    lastLogin: null
};

const STORAGE_KEYS = {
    GLOBAL_DATA: 'shopmap_global_data',
    AUTH_STATE: 'shopmap_auth_state',
    BUSINESS_CACHE: 'shopmap_business_cache'
};

export function updateGlobalData(data) {
    Object.assign(globalData, data);
    globalData.lastLogin = new Date().toISOString();
    sessionStorage.setItem(STORAGE_KEYS.GLOBAL_DATA, JSON.stringify(globalData));
    localStorage.setItem(STORAGE_KEYS.GLOBAL_DATA, JSON.stringify(globalData));
    console.log('Global data updated:', globalData);
}

export function getGlobalData() {
    const stored = sessionStorage.getItem(STORAGE_KEYS.GLOBAL_DATA);
    if (stored) {
        Object.assign(globalData, JSON.parse(stored));
    } else {
        const localStored = localStorage.getItem(STORAGE_KEYS.GLOBAL_DATA);
        if (localStored) {
            Object.assign(globalData, JSON.parse(localStored));
        }
    }
    return globalData;
}

export function clearGlobalData() {
    sessionStorage.removeItem(STORAGE_KEYS.GLOBAL_DATA);
    localStorage.removeItem(STORAGE_KEYS.GLOBAL_DATA);
    Object.assign(globalData, {
        adminUid: "",
        userRole: "admin",
        businessName: "ShopMapp Retail",
        isAuthenticated: false
    });
}

export function isLoggedIn() {
    return globalData.isAuthenticated && globalData.adminUid;
}

export function isAdmin() {
    return globalData.userRole === 'admin' || globalData.userRole === 'owner';
}