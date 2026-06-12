# ShopMapp - Business Intelligence & Inventory OS

A comprehensive retail management system built with Firebase that provides real-time logistics monitoring, employee performance tracking, and predictive inventory analytics.

## 🚀 Features

### Core Functionality
- **Multi-role Authentication** - Business owners and sales agents with role-based access
- **Sales Terminal** - Fast invoice generation with product search and real-time totals
- **Inventory Management** - Add, track, and manage product catalogue
- **Business Dashboard** - Real-time sales analytics and performance metrics
- **Owner Control Panel** - Business configuration and agent management
- **PWA Support** - Offline capability with service worker

### Technical Stack
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Backend**: Firebase Authentication, Cloud Firestore, Cloud Storage
- **PWA**: Service Worker for offline capability
- **UI**: Modern glassmorphism design with Inter font

## 📁 Project Structure

```
SHOPMAP/
├── index.html              # Landing page
├── main.css                # Global styles (enhanced with utilities)
├── firebase.js             # Firebase configuration & helper functions
├── firebase-rules.json    # Firestore security rules
├── README.md               # This file
├── auth_shop/
│   ├── login.html          # Business login
│   ├── business.html       # Business registration
│   ├── agent.html          # Agent login
│   ├── agent.js           # Agent authentication
│   ├── overview.html      # Main dashboard
│   ├── overview.js        # Dashboard logic
│   ├── sales.html         # Sales terminal
│   ├── sales.js           # Sales processing
│   ├── globalData.js      # Shared state management (enhanced)
│   └── sw.js              # Service worker
└── business_owner/
    ├── owner.html         # Owner control panel
    └── owner.js          # Owner panel logic
```

## 🔧 Setup Instructions

### 1. Firebase Project Setup
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project
3. Enable **Authentication** (Email/Password + Google)
4. Enable **Cloud Firestore** (Create in test mode initially)
5. Enable **Cloud Storage** (For product images)
6. Copy your Firebase config to `firebase.js`

### 2. Firestore Database Structure
The system uses these collections:

```
businesses/
  ├── {businessId}/
  │   ├── businessName: string
  │   ├── businessType: string
  │   ├── location: string
  │   ├── ownerEmail: string
  │   ├── ownerPhone: string
  │   ├── description: string
  │   └── createdAt: timestamp

products/
  ├── {productId}/
  │   ├── adminUid: string (business owner)
  │   ├── name: string
  │   ├── category: string
  │   ├── price: number
  │   ├── cost: number
  │   ├── stock: number
  │   ├── barcode: string
  │   └── createdAt: timestamp

sales/
  ├── {saleId}/
  │   ├── adminUid: string
  │   ├── agentUid: string
  │   ├── items: array
  │   ├── total: number
  │   ├── customer: string
  │   ├── paymentMethod: string
  │   └── createdAt: timestamp

staff/
  ├── {staffId}/
  │   ├── adminUid: string
  │   ├── email: string
  │   ├── name: string
  │   ├── role: string
  │   └── createdAt: timestamp
```

### 3. Deploy Security Rules
Copy the rules from `firebase-rules.json` to your Firebase Console:
1. Go to Firestore Database → Rules
2. Replace existing rules with content from `firebase-rules.json`
3. Publish rules

### 4. Deployment
- Deploy to Firebase Hosting:
  ```bash
  firebase init hosting
  firebase deploy
  ```
- Or use any static hosting (Netlify, Vercel)

## 🔐 Security Rules

The security rules in `firebase-rules.json` provide:
- Business owners can only access their own business data
- Agents can only access assigned business data
- Products and sales are scoped to business owner
- Role-based read/write permissions

### Key Security Features:
- **Businesses**: Owners have full control of their business document
- **Products**: Only business owner can create/update products
- **Sales**: Business owner sees all sales, agents see their own
- **Staff**: Only business owner can manage staff

## 📱 User Roles

| Role | Access Level |
|------|-------------|
| **Business Owner** | Full access to business data, settings, reports, and staff management |
| **Sales Agent** | Sales terminal, own sales history |

## 🛠️ Enhanced Features

### Firebase Helper Functions
The `firebase.js` now includes:
- `getBusinessData(uid)` - Fetch business information
- `getProducts(uid)` - Get all products for a business
- `getSales(uid, limit)` - Get sales history
- `getStaff(uid)` - Get staff members
- `createProduct(data)` - Add new product
- `createSale(data)` - Record new sale
- `updateProduct(id, data)` - Update product
- `deleteProduct(id)` - Remove product
- `subscribeToProducts(uid, callback)` - Real-time product listener
- `subscribeToSales(uid, callback)` - Real-time sales listener

### Global State Management
Enhanced `globalData.js` provides:
- Session and local storage persistence
- Auth state management
- Business data caching for offline access
- Role checking utilities (`isAdmin()`, `isSalesAgent()`)

### UI Enhancements
- Toast notification system
- Loading spinners
- Empty state components
- Data table styles
- Badge variants (success, warning, danger, info)
- Card components
- Form enhancements
- Stat card components
- Responsive grid utilities
- PWA install prompt
- Offline indicator

## 📄 License

MIT License - Feel free to use this for your own projects.

## 🤝 Support

For issues or questions, please open an issue on the repository.