import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, addDoc, updateDoc, doc, serverTimestamp, getDoc, setDoc, getDocs, where } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { CustomerProfile, LoyaltySettings, Product, SaleItem } from '../types';
import { Search, Camera, LogOut, ShoppingCart } from 'lucide-react';
import { signOut } from 'firebase/auth';
import jsPDF from 'jspdf';

import BarcodeScanner from '../components/BarcodeScanner';
import CategoryRibbon from '../components/seller/CategoryRibbon';
import ProductCard from '../components/seller/ProductCard';
import VariationModal from '../components/seller/VariationModal';
import CartSidebar from '../components/seller/CartSidebar';
import CheckoutModal from '../components/seller/CheckoutModal';

export default function SellerPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [search, setSearch] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [success, setSuccess] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [variationModal, setVariationModal] = useState<Product | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [loyalty, setLoyalty] = useState<LoyaltySettings>({ pointsPerRupee: 1, pointsToRupee: 100, redeemEnabled: true });

  const isProductVisible = (published: unknown) => {
    if (published === false || published === 'false' || published === 'hidden' || published === 0) return false;
    return true;
  };

  const isVariationVisible = (published: unknown) => {
    if (published === false || published === 'false' || published === 'hidden' || published === 0) return false;
    return true;
  };

  // Convert different phone formats to one canonical local format (0XXXXXXXXX)
  const normalizePhone = (input: string) => {
    const digits = (input || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('94') && digits.length === 11) return `0${digits.slice(2)}`;
    if (digits.length === 9) return `0${digits}`;
    if (digits.length > 10) return digits.slice(-10);
    return digits;
  };

  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, 'products')),
      snapshot => setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product))),
      err => console.error('Failed to load products:', err)
    );
    const unsubLoyalty = onSnapshot(
      doc(db, 'settings', 'loyalty'),
      snapshot => {
        if (snapshot.exists()) {
          setLoyalty(prev => ({ ...prev, ...(snapshot.data() as Partial<LoyaltySettings>) }));
        }
      },
      err => console.error('Failed to load loyalty settings:', err)
    );
    return () => { unsubscribe(); unsubLoyalty(); };
  }, []);

  const lookupCustomer = async (phone: string): Promise<CustomerProfile | null> => {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) return null;
    try {
      const snap = await getDoc(doc(db, 'customers', normalizedPhone));
      if (snap.exists()) {
        return { id: snap.id, ...snap.data() } as CustomerProfile;
      }
    } catch (err) {
      console.warn('Customer lookup unavailable or denied in customers collection:', err);
    }
    
    // Fallback: aggregate from sales history if customer profile is missing/unreadable.
    try {
      const q1 = query(collection(db, 'sales'), where('customer.phone', '==', normalizedPhone));
      const q2 = normalizedPhone !== phone ? query(collection(db, 'sales'), where('customer.phone', '==', phone)) : null;
      const [snap1, snap2] = await Promise.all([getDocs(q1), q2 ? getDocs(q2) : Promise.resolve(null)]);
      const allDocs = [...snap1.docs, ...(snap2?.docs || [])];

      // De-duplicate sales docs if both queries hit same rows
      const uniqueMap = new Map<string, any>();
      allDocs.forEach((d) => uniqueMap.set(d.id, d));
      const salesDocs = Array.from(uniqueMap.values());

      if (salesDocs.length > 0) {
        let earned = 0;
        let redeemed = 0;
        let latestTimestamp = 0;
        let name = 'Walk-in Customer';
        let email = '';
        let address = '';

        salesDocs.forEach((docSnap) => {
          const s = docSnap.data();
          const ts = s.timestamp?.seconds || 0;
          earned += s.vp?.earned || 0;
          redeemed += s.vp?.redeemed || 0;

          // Keep latest known customer details from most recent sale.
          if (ts >= latestTimestamp) {
            latestTimestamp = ts;
            name = s.customer?.name || name;
            email = s.customer?.email || email;
            address = s.customer?.address || address;
          }
        });

        return {
          id: normalizedPhone,
          name,
          phone: normalizedPhone,
          email,
          address,
          vpBlocked: false,
          vpBalance: Math.max(0, earned - redeemed),
          totalPurchases: salesDocs.reduce((acc, d) => acc + (d.data().total || 0), 0),
          purchaseCount: salesDocs.length,
          active: true,
        } as CustomerProfile;
      }
    } catch (err) {
      console.warn('Fallback sales customer lookup denied:', err);
    }
    
    return null;
  };

  const ensureCustomerByPhone = async (phone: string): Promise<void> => {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) return;
    try {
      const ref = doc(db, 'customers', normalizedPhone);
      const snap = await getDoc(ref);
      if (snap.exists()) return;
      await setDoc(ref, {
        name: 'Walk-in Customer',
        phone: normalizedPhone,
        email: '',
        address: '',
        vpBlocked: false,
        vpBalance: 0,
        totalPurchases: 0,
        purchaseCount: 0,
        active: true,
        lastPurchaseAt: null,
      }, { merge: true });
    } catch (err) {
      console.warn('Unable to auto-create customer by phone:', err);
    }
  };

  // ─── Cart Operations ───────────────────────────────────────────────────────

  const isDiscreteUnit = (unit?: string) => unit === 'qty' || unit === 'pc' || !unit;
  const getUnitStep = (unit?: string) => (isDiscreteUnit(unit) ? 1 : 0.001);
  const roundToStep = (value: number, step: number) => {
    const precision = step.toString().includes('.') ? step.toString().split('.')[1].length : 0;
    return Number((Math.round(value / step) * step).toFixed(precision));
  };

  const addToCart = (product: Product, variation?: any) => {
    const stock = variation ? variation.stock : product.stock;
    if (stock <= 0) return;
    const price = variation ? (variation.discountPrice || variation.price) : (product.discountPrice || product.price);
    const costPrice = variation ? (variation.costPrice || 0) : (product.costPrice || 0);
    const name = variation ? `${product.name} (${variation.name})` : product.name;
    const unit = variation?.unit || product.unit || 'qty';
    const step = getUnitStep(unit);
    setCart(prev => {
      const existing = prev.find(i => variation ? i.variationId === variation.id : i.productId === product.id && !i.variationId);
      if (existing) {
        return prev.map(i => {
          const isTarget = variation ? i.variationId === variation.id : i.productId === product.id && !i.variationId;
          if (!isTarget) return i;
          const nextQty = roundToStep(Math.min((i.maxStock ?? stock), i.quantity + step), step);
          return { ...i, quantity: nextQty, maxStock: stock };
        });
      }
      const initialQty = roundToStep(Math.min(stock, step), step);
      return [...prev, { productId: product.id, variationId: variation?.id, name, price, costPrice, quantity: initialQty, maxStock: stock, unit }];
    });
    setVariationModal(null);
    if (window.innerWidth < 1024) setIsCartOpen(true);
  };

  const removeFromCart = (id: string) => setCart(prev => prev.filter(i => (i.variationId ? i.variationId !== id : i.productId !== id)));

  const updateQuantity = (id: string, delta: number) => {
    setCart(prev => prev.map(i => {
      const itemId = i.variationId || i.productId;
      if (itemId === id) {
        const step = getUnitStep(i.unit);
        const next = roundToStep(i.quantity + (delta * step), step);
        const min = step;
        const max = i.maxStock ?? Infinity;
        const clamped = roundToStep(Math.max(min, Math.min(max, next)), step);
        return { ...i, quantity: clamped };
      }
      return i;
    }));
  };

  const setQuantity = (id: string, quantity: number) => {
    setCart(prev => prev.map(i => {
      const itemId = i.variationId || i.productId;
      if (itemId !== id) return i;
      const step = getUnitStep(i.unit);
      const min = isDiscreteUnit(i.unit) ? 1 : 0;
      const max = i.maxStock ?? Infinity;
      const clampedBase = Math.max(min, Math.min(max, quantity));
      const clamped = isDiscreteUnit(i.unit)
        ? roundToStep(clampedBase, 1)
        : roundToStep(clampedBase, step);
      return { ...i, quantity: clamped };
    }));
  };

  const setItemPrice = (id: string, price: number) => {
    setCart(prev => prev.map(i => {
      const itemId = i.variationId || i.productId;
      if (itemId !== id) return i;
      return { ...i, price: Math.max(0, Number(price.toFixed(2))) };
    }));
  };

  const setItemUnit = (id: string, unit: string) => {
    setCart(prev => prev.map(i => {
      const itemId = i.variationId || i.productId;
      if (itemId !== id) return i;
      const step = getUnitStep(unit);
      const min = isDiscreteUnit(unit) ? 1 : 0;
      const max = i.maxStock ?? Infinity;
      const clampedBase = Math.max(min, Math.min(max, i.quantity));
      const clampedQty = isDiscreteUnit(unit)
        ? roundToStep(clampedBase, 1)
        : roundToStep(clampedBase, step);
      return { ...i, unit: unit as any, quantity: clampedQty };
    }));
  };

  // ─── Barcode Scanner ───────────────────────────────────────────────────────

  const handleScan = (barcode: string) => {
    const product = products.find(p => p.barcode === barcode);
    if (product) {
      const visibleVariations = (product.variations || []).filter(v => isVariationVisible(v.published));
      visibleVariations.length > 0
        ? setVariationModal({ ...product, variations: visibleVariations })
        : addToCart(product);
      setShowScanner(false);
      return;
    }
    for (const p of products) {
      const variation = p.variations?.find(v => isVariationVisible(v.published) && v.barcode === barcode);
      if (variation) { addToCart(p, variation); setShowScanner(false); return; }
    }
  };

  // ─── PDF Receipt ───────────────────────────────────────────────────────────

  const generateReceipt = (cartItems: SaleItem[], grandTotal: number) => {
    try {
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [80, Math.max(160, cartItems.length * 12 + 100)] });
      pdf.setFontSize(14); pdf.text('VELLAIPILLAIYAR', 20, 14);
      pdf.setFontSize(9); pdf.text('Sales Receipt', 27, 21);
      pdf.setFontSize(7); pdf.text(`Date: ${new Date().toLocaleString()}`, 4, 30);
      pdf.setLineWidth(0.3); pdf.line(4, 33, 76, 33);
      pdf.text('Item', 4, 39); pdf.text('Qty', 54, 39); pdf.text('Amount', 64, 39);
      pdf.line(4, 41, 76, 41);
      let y = 48;
      cartItems.forEach(item => {
        const name = String(item.name || 'Item');
        pdf.text(name.length > 26 ? name.substring(0, 23) + '...' : name, 4, y);
        pdf.text(String(item.quantity), 54, y);
        pdf.text(`Rs.${(item.price * item.quantity).toFixed(2)}`, 64, y);
        y += 8;
      });
      y += 2; pdf.line(4, y, 76, y); y += 7;
      pdf.setFontSize(9); pdf.text('TOTAL:', 4, y); pdf.text(`Rs.${grandTotal.toFixed(2)}`, 57, y);
      y += 12; pdf.setFontSize(7); pdf.text('Thank you for your business!', 16, y);
      pdf.save(`Receipt_${Date.now()}.pdf`);
    } catch (err) { console.error('PDF generation failed:', err); }
  };

  // ─── Checkout ──────────────────────────────────────────────────────────────

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    const currentUser = auth.currentUser;
    if (!currentUser) { setCheckoutError('You must be logged in to complete a sale.'); return; }
    // Show modal to collect client details before saving
    setShowCheckoutModal(true);
  };

  const processCheckout = async (payload: {
    customer: { name: string; phone: string; email?: string; address?: string };
    vp: { redeemed: number; redeemedAmount: number; earned: number; balance: number };
    payableTotal: number;
  }) => {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('Not authenticated');

    setIsCheckingOut(true);
    setCheckoutError(null);
    const cartSnapshot = [...cart];
    const totalSnapshot = payload.payableTotal;

    try {
      // Sanitize — Firestore rejects undefined fields
      const sanitizedItems = cartSnapshot.map(item => {
const clean: any = { productId: item.productId, name: item.name, price: item.price, quantity: item.quantity, unit: item.unit || 'qty' };
        if (item.costPrice !== undefined) clean.costPrice = item.costPrice;
        if (item.variationId) clean.variationId = item.variationId;
        return clean;
      });

      const normalizedPhone = normalizePhone(payload.customer.phone);

      let existing: Partial<CustomerProfile> | null = null;
      if (normalizedPhone) {
        const customerRef = doc(db, 'customers', normalizedPhone);
        try {
          const existingSnap = await getDoc(customerRef);
          existing = existingSnap.exists() ? (existingSnap.data() as Partial<CustomerProfile>) : null;
          if (existing?.active === false) {
            throw new Error('This customer is disabled by admin.');
          }
        } catch (err: any) {
          // If customer read is denied or fails offline, continue checkout and skip checks.
          console.warn('Customer fetch skipped during checkout:', err);
        }
      }

      // Keep one canonical name per mobile number, but do not let placeholder names
      // override a newly entered real customer name.
      const existingName = (existing?.name || '').trim();
      const hasExistingRealName = !!existingName && existingName.toLowerCase() !== 'walk-in customer';
      const typedName = (payload.customer.name || '').trim();
      const canonicalName = (hasExistingRealName ? existingName : (typedName || 'Walk-in Customer')).trim();
      const cleanCustomer: { name: string; phone: string; email?: string; address?: string } = {
        name: canonicalName,
        phone: normalizedPhone,
      };
      if (payload.customer.email) cleanCustomer.email = payload.customer.email;
      if (payload.customer.address) cleanCustomer.address = payload.customer.address;

      const isVpBlocked = existing?.vpBlocked === true;
      const effectiveVp = isVpBlocked
        ? {
            redeemed: 0,
            redeemedAmount: 0,
            earned: 0,
            balance: Number(existing?.vpBalance || 0),
          }
        : payload.vp;

      const totalProfitSnapshot = cartSnapshot.reduce((sum, i) => sum + ((i.price - (i.costPrice || 0)) * i.quantity), 0) - effectiveVp.redeemedAmount;

      await addDoc(collection(db, 'sales'), {
        items: sanitizedItems, total: totalSnapshot, profit: totalProfitSnapshot,
        customer: cleanCustomer,
        vp: effectiveVp,
        sellerId: currentUser.uid, timestamp: serverTimestamp(),
      });

      if (normalizedPhone) {
        const customerRef = doc(db, 'customers', normalizedPhone);
        try {
          await setDoc(customerRef, {
            name: canonicalName,
            phone: normalizedPhone,
            email: payload.customer.email || existing?.email || '',
            address: payload.customer.address || existing?.address || '',
            vpBlocked: existing?.vpBlocked ?? false,
            vpBalance: effectiveVp.balance,
            totalPurchases: (existing?.totalPurchases || 0) + payload.payableTotal,
            purchaseCount: (existing?.purchaseCount || 0) + 1,
            active: existing?.active ?? true,
            lastPurchaseAt: serverTimestamp(),
          }, { merge: true });
        } catch (err: any) {
          // Do not block billing if customer write is denied or offline; sale and stock updates are primary.
          console.warn('Customer profile update skipped during checkout:', err);
        }
      }

      for (const item of cartSnapshot) {
        const product = products.find(p => p.id === item.productId);
        if (!product) continue;
        if (item.variationId && product.variations?.length) {
          const updatedVariations = product.variations.map(v =>
            v.id === item.variationId ? { ...v, stock: Math.max(0, v.stock - item.quantity) } : v
          );
          await updateDoc(doc(db, 'products', item.productId), {
            variations: updatedVariations,
            stock: updatedVariations.reduce((acc, v) => acc + v.stock, 0),
          });
        } else {
          await updateDoc(doc(db, 'products', item.productId), { stock: Math.max(0, product.stock - item.quantity) });
        }
      }

      generateReceipt(cartSnapshot, totalSnapshot);
      setCart([]);
      setSuccess(true);
      setShowCheckoutModal(false);
      setTimeout(() => setSuccess(false), 4000);
    } catch (err: any) {
      let msg = 'Checkout failed. Please try again.';
      if (err?.message) { try { msg = JSON.parse(err.message).error || err.message; } catch { msg = err.message; } }
      setCheckoutError(msg);
    } finally {
      setIsCheckingOut(false);
    }
  };

  // ─── Derived Data ──────────────────────────────────────────────────────────

  const categories: string[] = ['All', ...Array.from(new Set(products.map(p => p.category))).filter((c): c is string => Boolean(c))];

  const filteredProducts = products
    .map((p) => {
      const visibleVariations = (p.variations || []).filter((v) => isVariationVisible(v.published));
      if (p.variations && p.variations.length > 0) {
        return {
          ...p,
          variations: visibleVariations,
          stock: visibleVariations.reduce((sum, v) => sum + (v.stock || 0), 0),
        } as Product;
      }
      return p;
    })
    .filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.category.toLowerCase().includes(search.toLowerCase()) || p.barcode?.includes(search);
      return isProductVisible(p.published) && matchesSearch && (selectedCategory === 'All' || p.category === selectedCategory) && (!p.variations || p.variations.length > 0);
    });

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen lg:h-screen bg-neutral-100 overflow-hidden">
      {/* Left: Product Browser */}
      <main className="flex-1 flex flex-col p-3 sm:p-4 md:p-6 overflow-hidden">
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
          <div className="flex-1 md:max-w-md relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={20} />
            <input
              placeholder="Search products, categories, or scan..."
              className="w-full pl-10 pr-4 py-2.5 sm:py-3 bg-white rounded-xl border border-neutral-200 shadow-sm focus:ring-2 focus:ring-neutral-900 transition-all"
              value={search} onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between md:justify-end gap-2 sm:gap-3">
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={() => setShowScanner(!showScanner)}
                className={`p-2.5 sm:p-3 rounded-xl transition-all ${showScanner ? 'bg-neutral-900 text-white shadow-lg' : 'bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-50'}`}
              >
                <Camera size={20} />
              </button>
              <button onClick={() => setIsCartOpen(true)} className="lg:hidden p-2.5 sm:p-3 bg-white text-neutral-900 border border-neutral-200 rounded-xl relative">
                <ShoppingCart size={20} />
                {cart.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-neutral-900 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-white">
                    {cart.reduce((sum, i) => sum + i.quantity, 0).toFixed(3)}
                  </span>
                )}
              </button>
            </div>
            <button onClick={() => signOut(auth)} className="p-2.5 sm:p-3 bg-white text-red-600 border border-neutral-200 rounded-xl hover:bg-red-50 transition-all">
              <LogOut size={20} />
            </button>
          </div>
        </header>

        {/* Barcode Scanner */}
        {showScanner && <div className="mb-6"><BarcodeScanner onScan={handleScan} /></div>}

        {/* Category Ribbon */}
        <CategoryRibbon categories={categories} selected={selectedCategory} onSelect={setSelectedCategory} />

        {/* Product Grid */}
        <div className="flex-1 overflow-auto grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 pb-4 sm:pb-6">
          {filteredProducts.map(p => (
            <div key={p.id}>
              <ProductCard
                product={p}
                onSelect={product => product.variations && product.variations.length > 0 ? setVariationModal(product) : addToCart(product)}
              />
            </div>
          ))}
          {filteredProducts.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-20 text-neutral-400 gap-4">
              <Search size={48} strokeWidth={1} />
              <p className="text-sm">No products found</p>
            </div>
          )}
        </div>
      </main>

      {/* Variation Modal */}
      {variationModal && (
        <VariationModal
          product={variationModal}
          onAddVariation={addToCart}
          onClose={() => setVariationModal(null)}
        />
      )}

      {/* Checkout Modal — shows client detail form + invoice PDF generation */}
      {showCheckoutModal && (
        <CheckoutModal
          cart={cart}
          total={cart.reduce((s, i) => s + i.price * i.quantity, 0)}
          loyalty={loyalty}
          onLookupCustomer={lookupCustomer}
          onEnsureCustomerByPhone={ensureCustomerByPhone}
          onConfirm={processCheckout}
          onClose={() => setShowCheckoutModal(false)}
        />
      )}

      {/* Right: Cart Sidebar */}
      <CartSidebar
        cart={cart}
        isCartOpen={isCartOpen}
        isCheckingOut={isCheckingOut}
        success={success}
        checkoutError={checkoutError}
        onClose={() => setIsCartOpen(false)}
        onUpdateQuantity={updateQuantity}
        onSetQuantity={setQuantity}
        onSetPrice={setItemPrice}
        onSetUnit={setItemUnit}
        onRemove={removeFromCart}
        onCheckout={handleCheckout}
        onClearError={() => setCheckoutError(null)}
      />

      {/* Mobile Cart Overlay */}
      {isCartOpen && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden" onClick={() => setIsCartOpen(false)} />
      )}
    </div>
  );
}
