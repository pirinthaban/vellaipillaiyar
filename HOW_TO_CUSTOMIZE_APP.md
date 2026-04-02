# How to Customize App Branding (Shop Name, Address, & Links)

This guide shows you exactly which files and line numbers you need to edit to replace the default placeholder details with your actual shop name, address, and contact info across the entire app.

---

### 1. The Global Website Title (Browser Tab)
*This is the text that appears on the top tab of the web browser.*
* **File:** `index.html`
* **Line:** ~9
* **What to change:**
  ```html
  <title>Vellaipillaiyar Multi Shop</title>
  ```

---

### 2. Login Page Title
* **File:** `src/pages/LoginPage.tsx`
* **Line:** ~46
* **What to change:**
  ```tsx
  <h1 className="text-3xl font-bold text-neutral-900">Vellaipillaiyar Multi Shop</h1>
  ```

---

### 3. Public Buyer Page (Showcase Header & Texts)
*This is your main public catalog page.*
* **File:** `src/pages/BuyerPage.tsx`
* **Lines:** ~194 (The top-left logo text)
  ```tsx
  <h1 className="text-2xl font-black tracking-tighter uppercase italic">
    Vellaipillaiyar<span className="text-orange-500">.</span>Multi Shop
  </h1>
  ```
* **Lines:** ~287 (The subtitle / description banner texts)
  ```tsx
  Browse products, build your request list, and place orders instantly.
  ```

---

### 4. WhatsApp Order Number (Buyer Page)
*When buyers click "Request Order via WhatsApp", this is the number the message goes to.*
* **File:** `src/pages/BuyerPage.tsx` 
* **Line:** ~113
* **What to change:** Set the `VITE_WHATSAPP_NUMBER` environment variable to your international business number (without `+` or spaces).
  ```tsx
  window.open(`https://wa.me/${import.meta.env.VITE_WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
  ```

---

### 5. Invoice & Bill Generator (Admin Panel)
*This is the template used when you click "Generate Invoice" in the Admin Sales section.*
* **File:** `src/components/admin/InvoiceBill.tsx`
* **Lines:** ~38 to 44
* **What to change:** Update the `defaultSettings` object with your shop's official billing details.
  ```tsx
  const defaultSettings: InvoiceSettings = {
    companyName: 'Vellaipillaiyar Multi Shop',
    phone: '+94 485144774',
    email: 'www.pirinthaban@gmail.com',
    address: 'A35, Thevipuram, Mullaitivu.',
    website: 'pirinthaban.github.io/vellaipillaiyar',
    // ...
  }
  ```

---

### 6. Small Receipt / Bill (Seller Checkout)
*This is the live printable receipt that pops up when a Seller completes a cart checkout.*
* **File:** `src/components/seller/CheckoutModal.tsx`
* **Lines:** ~24 to 30
* **What to change:** Update the `defaultSettings` object here as well.
  ```tsx
  const defaultSettings: InvoiceSettings = {
    companyName: 'Vellaipillaiyar Multi Shop',
    phone: '+94 485144774',
    email: 'www.pirinthaban@gmail.com',
    address: 'A35, Thevipuram, Mullaitivu.',
    website: 'pirinthaban.github.io/vellaipillaiyar',
    // ...
  }
  ```

---

### 7. Admin Sidebar Logo
*The little brand indicator at the bottom of the navigation sidebar in the Admin Panel.*
* **File:** `src/components/admin/AdminSidebar.tsx`
* **Line:** ~47
* **What to change:**
  ```tsx
  <p className="text-xs text-neutral-500 uppercase tracking-widest mt-1">Vellaipillaiyar Multi Shop</p>
  ```

---

### 8. Seller Page PDF Export Label (Optional)
*If you export data via the basic Seller panel PDF generator.*
* **File:** `src/pages/SellerPage.tsx`
* **Line:** ~215
* **What to change:**
  ```tsx
  pdf.text('VELLAIPILLAIYAR MULTI SHOP', 20, 14);
  ```

---

**Tip:** Once you make these changes, run `npm run build` to verify everything compiles, and then redeploy your frontend to your hosting provider so the changes go live!