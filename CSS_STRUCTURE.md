# CSS File Structure - Updated

## Overview
The main.css file has been successfully split into **4 separate, modular CSS files** for better organization and maintainability.

---

## New CSS Files

### 1. **base.css**
- **Purpose**: Shared foundation styles used across all pages
- **Contains**:
  - CSS variables (colors, spacing, gradients)
  - Reset and normalize styles
  - Navbar styling
  - All button variants (.btn, .btn-primary, .btn-outline, etc.)
  - Form elements and controls
  - Utility classes (flex, grid, spacing, colors, etc.)
  - Common animations and transitions
  - Alert/notification styles
  - Badge styles
  - Loading states and empty states
  - PWA and offline indicators

**Used by**: All HTML files (index.html, login.html, business.html, user.html, overview.html, sales.html, owner.html)

---

### 2. **auth-login.css** 
- **Purpose**: Landing page and authentication page styles
- **Used by**:
  - index.html (Landing page with hero section)
  - auth_shop/login.html (Login page)
  - auth_shop/business.html (Business registration)
  - auth_shop/user.html (User role selection)

- **Contains**:
  - Hero section styling
  - Feature cards and feature grid
  - Dashboard mockup preview
  - Footer styles
  - Auth card containers
  - Login/registration form layouts
  - Role selection cards
  - Business dropdown and selector
  - Access information displays
  - All authentication-related responsive styles

---

### 3. **overview.css**
- **Purpose**: Dashboard and inventory management styles
- **Used by**:
  - auth_shop/overview.html (Dashboard/inventory management)
  - auth_shop/sales.html (POS terminal)

- **Contains**:
  - Sidebar and navigation styling
  - Dashboard layout and header
  - User profile badge and status indicators
  - Stats grid and stat cards
  - Dashboard content sections
  - Announcement cards
  - Inventory/stock card styling
  - Panel card styling
  - Table styling for overview and catalogue tables
  - Search and filter components
  - Stock management controls
  - Cart and cart item styling
  - Data table styling
  - Dashboard-specific responsive styles
  - All POS terminal and sales-related styles

---

### 4. **owner.css**
- **Purpose**: Owner panel and business management styles
- **Used by**:
  - business_owner/owner.html (Owner panel)

- **Contains**:
  - Owner grid layout
  - Owner section styling
  - Owner form groups and inputs
  - Statistics boxes and display
  - Agent login form styling
  - Sales terminal header and layout
  - Invoice card and table styling
  - Payment section styling
  - Action buttons specific to owner panel
  - Grand total and receipt styling
  - All owner panel responsive styles

---

## File Usage by Page

| Page | CSS Files |
|------|-----------|
| index.html | base.css + auth-login.css |
| auth_shop/login.html | base.css + auth-login.css |
| auth_shop/business.html | base.css + auth-login.css |
| auth_shop/user.html | base.css + auth-login.css |
| auth_shop/overview.html | base.css + overview.css |
| auth_shop/sales.html | base.css + overview.css + sales-style.css |
| business_owner/owner.html | base.css + owner.css |

---

## Benefits of This Structure

✅ **Modularity**: Each CSS file is focused on a specific feature area
✅ **Easier Maintenance**: Updates to specific sections are isolated
✅ **Faster Development**: Developers can quickly locate and modify relevant styles
✅ **Better Performance**: Modern browsers cache separate files efficiently
✅ **Scalability**: Adding new pages becomes easier - just reference the appropriate CSS files
✅ **Code Reusability**: Shared styles in base.css are used everywhere without duplication
✅ **Cleaner Codebase**: No more 4000+ line monolithic CSS file

---

## How to Update Styles

### Update Common/Global Styles
Edit `base.css` - affects all pages

### Update Authentication/Landing Styles
Edit `auth-login.css` - affects index.html, login.html, business.html, user.html

### Update Dashboard/Inventory Styles
Edit `overview.css` - affects overview.html, sales.html

### Update Owner Panel Styles
Edit `owner.css` - affects owner.html

---

## Important Notes

⚠️ **Do NOT delete main.css yet** - it's still present as backup
⚠️ All CSS variables are defined in `base.css` - customize colors/spacing there
⚠️ Ensure all HTML files properly link to BOTH their base.css AND specific CSS file
⚠️ Load order matters - base.css should always load first

---

## Next Steps

1. Test all pages to ensure styles are loading correctly
2. Delete main.css once you've verified everything works
3. Update your build process (if any) to reference the new file structure
4. Consider minifying these CSS files for production

