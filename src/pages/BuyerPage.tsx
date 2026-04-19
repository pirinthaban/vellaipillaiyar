import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Product, Category } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Search, ShoppingBag, X, Menu, ShoppingCart, Send, Plus, Minus, Award, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const categories: Category[] = ['paint', 'wiring', 'electrical', 'oils', 'pipeline', 'construction'];

interface CartItem {
  product: Product;
  variation?: any;
  quantity: number;
}

export default function BuyerPage() {
  const navigate = useNavigate();
  const shopAddress = 'A35, Thevipuram, Mullaitivu';
  const shopPhone = '94774485144';
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | 'all'>('all');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedImageIdx, setSelectedImageIdx] = useState(0);
  const [search, setSearch] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeVariation, setActiveVariation] = useState<any>(null);

  const isVariationVisible = (published: unknown) => {
    if (published === false || published === 'false' || published === 'hidden' || published === 0) return false;
    return true;
  };

  // VP System State
  const [isVpModalOpen, setIsVpModalOpen] = useState(false);
  const [vpPhone, setVpPhone] = useState('');
  const [vpData, setVpData] = useState<any>(null);
  const [isVpLoading, setIsVpLoading] = useState(false);
  const [vpError, setVpError] = useState('');

  const getProductImages = (product: Product) => {
    if (product.images && product.images.length > 0) return product.images;
    return product.image ? [product.image] : [];
  };

  useEffect(() => {
    const q = query(collection(db, 'products'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'products'));

    return () => unsubscribe();
  }, []);

  const filteredProducts = products
    .map((p) => {
      const visibleVariations = (p.variations || []).filter((v) => isVariationVisible(v.published));
      if (p.variations && p.variations.length > 0) {
        const visibleStock = visibleVariations.reduce((sum, v) => sum + (v.stock || 0), 0);
        return {
          ...p,
          variations: visibleVariations,
          stock: visibleStock,
        } as Product;
      }
      return p;
    })
    .filter((p) =>
      p.published !== false &&
      (selectedCategory === 'all' || p.category === selectedCategory) &&
      (p.name.toLowerCase().includes(search.toLowerCase()) || p.description?.toLowerCase().includes(search.toLowerCase())) &&
      (!p.variations || p.variations.length > 0)
    );

  const addToCart = () => {
    if (!selectedProduct) return;
    const stock = activeVariation ? activeVariation.stock : selectedProduct.stock;
    if (stock <= 0) return;
    
    setCart(prev => {
      const existing = prev.find(i => 
        i.product.id === selectedProduct.id && 
        (activeVariation ? i.variation?.id === activeVariation.id : !i.variation)
      );
      if (existing) {
        return prev.map(i => {
          if (i === existing) {
            return { ...i, quantity: Math.min(stock, i.quantity + 1) };
          }
          return i;
        });
      }
      return [...prev, { product: selectedProduct, variation: activeVariation, quantity: 1 }];
    });
    
    setSelectedProduct(null);
    setActiveVariation(null);
    setIsCartOpen(true);
  };

  const updateCartQty = (idx: number, delta: number) => {
    setCart(prev => {
      const item = prev[idx];
      const maxStock = item.variation ? item.variation.stock : item.product.stock;
      const nextQty = Math.max(0, Math.min(maxStock, item.quantity + delta));
      if (nextQty === 0) return prev.filter((_, i) => i !== idx);
      return prev.map((it, i) => i === idx ? { ...it, quantity: nextQty } : it);
    });
  };

  const cartTotal = cart.reduce((sum, item) => {
    const price = item.variation ? item.variation.price : (item.product.discountPrice || item.product.price);
    return sum + (price * item.quantity);
  }, 0);

  const checkoutWhatsApp = () => {
    const text = cart.map(i => {
      const name = i.variation ? `${i.product.name} (${i.variation.name})` : i.product.name;
      return `${name} x${i.quantity}`;
    }).join('\n');
    const msg = `Hello, I want to order:\n\n${text}\n\nTotal: Rs. ${cartTotal.toFixed(2)}`;
      window.open(`https://wa.me/94774485144?text=${encodeURIComponent(msg)}`, '_blank');
    };

    const handleCheckVp = async () => {
    if (!vpPhone.trim()) {
      setVpError('Please enter a phone number');
      return;
    }
    const sanitizedPhone = vpPhone.trim();
    setIsVpLoading(true);
    setVpError('');
    setVpData(null);
    try {
        let isCustomerFound = false;
        // 1. Try to fetch from the specific 'customers' collection (verified accounts)
        try {
          const customerRef = doc(db, 'customers', sanitizedPhone);
          const customerSnap = await getDoc(customerRef);

          if (customerSnap.exists()) {
            const userData = customerSnap.data();
            const balance = userData.vpBalance || 0;
            const earned = userData.vpEarned || balance;
            const redeemed = userData.vpRedeemed || 0;
            setVpData({
              name: userData.name || 'Walk-in Customer',
              earned,
              redeemed,
              balance
            });
            isCustomerFound = true;
          }
        } catch (dbErr: any) {
          console.warn('Could not read from customers collection, proceeding to fallback:', dbErr);
          if (dbErr.message?.toLowerCase().includes('permission')) {
             throw new Error('Rules sync issue. Please manually paste local firestore.rules to Firebase Console -> Firestore Database -> Rules tab, then publish.');
          }
        }

        if (isCustomerFound) return;

        // 2. Fallback: Aggregate from 'sales' collection for unverified/walk-in buyers
      const salesQuery = query(collection(db, 'sales'), where('customer.phone', '==', sanitizedPhone));
      const salesSnap = await getDocs(salesQuery);
      
      if (!salesSnap.empty) {
        let earned = 0;
        let redeemed = 0;
        let name = 'Walk-in Customer';
        let foundVp = false;
        
        salesSnap.forEach(s => {
          const data = s.data();
          if (data.customer?.name) name = data.customer.name;
          if (data.vp) {
            earned += (data.vp.earned || 0);
            redeemed += (data.vp.redeemed || 0);
            foundVp = true;
          }
        });
        
        if (foundVp) {
          setVpData({ 
            name, 
            earned, 
            redeemed, 
            balance: earned - redeemed 
          });
          return;
        }
      }

      setVpError('No account found with this phone number.');
    } catch (err: any) {
      console.error('VP check error:', err);
      // Helpful error mapping specifically for Firestore permission denials
      if (err.message && err.message.toLowerCase().includes('permission')) {
        setVpError('Database syncing rules. Reload page and try again in a moment.');
      } else {
        setVpError(err.message || 'Unable to check points');
      }
    } finally {
      setIsVpLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-orange-500 selection:text-white pb-20">
      {/* Premium Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-40 bg-black/80 backdrop-blur-2xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-12">
            <h1 className="text-2xl font-black tracking-tighter uppercase italic">
              Vellaipillaiyar
            </h1>
            <div className="hidden md:flex items-center gap-8 text-sm font-medium uppercase tracking-widest text-white/50">
              <button onClick={() => setSelectedCategory('all')} className={`hover:text-white transition-colors ${selectedCategory === 'all' ? 'text-white' : ''}`}>All Items</button>
              {categories.slice(0, 3).map(c => (
                <button key={c} onClick={() => setSelectedCategory(c)} className={`hover:text-white transition-colors ${selectedCategory === c ? 'text-white' : ''}`}>{c}</button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4 sm:gap-6">
            <button
              onClick={() => setIsVpModalOpen(true)}
              className="hidden sm:flex items-center gap-2 px-3 py-2 bg-orange-500/10 border border-orange-500/30 rounded-xl text-orange-400 hover:bg-orange-500/20 transition-all"
            >
              <Award size={16} />
              <span className="text-[10px] uppercase font-bold tracking-widest">VP Check</span>
            </button>
            <button onClick={() => navigate('/login')} className="hidden sm:flex items-center gap-2 p-2 hover:bg-white/10 rounded-xl transition-all text-white/50 hover:text-white group">
              <Lock size={16} />
              <span className="text-[10px] uppercase font-bold tracking-widest hidden lg:block">Staff</span>
            </button>
            <div className="hidden md:flex items-center bg-white/5 border border-white/10 rounded-full px-4 py-2 focus-within:border-orange-500/50 transition-all">
              <Search size={18} className="text-white/30" />
              <input 
                placeholder="Search..." 
                className="bg-transparent border-none focus:ring-0 text-sm ml-2 w-48 text-white outline-none"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <button onClick={() => setIsCartOpen(true)} className="p-2 hover:bg-white/10 rounded-full transition-all relative group">
              <ShoppingCart size={22} className={cart.length > 0 ? 'text-orange-500' : 'text-white'} />
              {cart.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-orange-500 border-2 border-[#050505] rounded-full text-[8px] font-bold flex items-center justify-center">
                  {cart.length}
                </span>
              )}
            </button>
            <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="md:hidden p-2 hover:bg-white/10 rounded-full transition-all">
              <Menu size={22} />
            </button>
          </div>
        </div>
        
        {/* Mobile Menu */}
        <AnimatePresence>
          {isMenuOpen && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="md:hidden bg-[#050505] border-b border-white/10 overflow-hidden"
            >
              <div className="px-6 py-4 space-y-4">
                <div className="flex items-center bg-white/5 border border-white/10 rounded-full px-4 py-2 focus-within:border-orange-500/50 transition-all">
                  <Search size={18} className="text-white/30" />
                  <input 
                    placeholder="Search inventory..." 
                    className="bg-transparent border-none focus:ring-0 text-sm ml-2 w-full text-white outline-none"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-3 pb-2 text-sm font-medium uppercase tracking-widest text-white/50">
                  <button
                    onClick={() => { setIsVpModalOpen(true); setIsMenuOpen(false); }}
                    className="text-left hover:text-orange-400 transition-colors py-2"
                  >
                    VP Check
                  </button>
                  <button onClick={() => { setSelectedCategory('all'); setIsMenuOpen(false); }} className={`text-left hover:text-white transition-colors py-2 ${selectedCategory === 'all' ? 'text-white' : ''}`}>All Items</button>
                  {categories.map(c => (
                    <button key={c} onClick={() => { setSelectedCategory(c); setIsMenuOpen(false); }} className={`text-left hover:text-white transition-colors py-2 ${selectedCategory === c ? 'text-white' : ''}`}>{c}</button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-40 pb-16 md:pb-24 px-6 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full pointer-events-none">
          <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[80%] bg-orange-500/10 blur-[150px] rounded-full"></div>
          <div className="absolute top-[20%] right-[-10%] w-[40%] h-[60%] bg-blue-500/10 blur-[120px] rounded-full"></div>
        </div>

        <div className="max-w-7xl mx-auto relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-4xl"
          >
            <span className="inline-block px-4 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-[10px] font-bold uppercase tracking-[0.2em] text-orange-500 mb-8 backdrop-blur-sm shadow-[0_0_20px_rgba(249,115,22,0.2)]">
              Pro Equipment Catalog
            </span>
            <h2 className="text-6xl sm:text-7xl md:text-9xl font-black leading-[0.85] tracking-tighter uppercase italic mb-8 md:mb-12 drop-shadow-2xl">
              Build <br /> 
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-white to-white/30">Everything</span><span className="text-orange-500">.</span>
            </h2>
            <p className="text-lg md:text-xl text-white/50 max-w-xl leading-relaxed mb-10">
              Browse top-tier hardware, industrial tools, and building supplies. Build your request list and order instantly.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Modern Category Filter */}
      <section className="px-6 py-8 border-y border-white/5 bg-white/[0.01]">
        <div className="max-w-7xl mx-auto flex flex-nowrap overflow-x-auto pb-4 -mb-4 gap-3 items-center hide-scrollbar">
          <button 
            onClick={() => setSelectedCategory('all')}
            className={`shrink-0 px-6 py-3 rounded-2xl text-[11px] font-bold uppercase tracking-widest transition-all ${selectedCategory === 'all' ? 'bg-orange-500 text-white shadow-[0_4px_20px_rgba(249,115,22,0.4)]' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
          >
            All Items
          </button>
          {categories.map(c => (
            <button 
              key={c}
              onClick={() => setSelectedCategory(c)}
              className={`shrink-0 px-6 py-3 rounded-2xl text-[11px] font-bold uppercase tracking-widest transition-all ${selectedCategory === c ? 'bg-orange-500 text-white shadow-[0_4px_20px_rgba(249,115,22,0.4)]' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
            >
              {c}
            </button>
          ))}
        </div>
      </section>

      {/* Product Grid */}
      <section className="max-w-7xl mx-auto px-6 py-16 md:py-24">
        {filteredProducts.length === 0 ? (
           <div className="py-20 text-center text-white/30 flex flex-col items-center gap-4">
             <Search size={48} strokeWidth={1} />
             <p>No products found in this category.</p>
           </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 md:gap-8">
            {filteredProducts.map((p, index) => (
              <motion.div 
                key={p.id}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true, margin: "100px" }}
                transition={{ delay: (index % 12) * 0.05, duration: 0.4 }}
                onClick={() => { setSelectedProduct(p); setSelectedImageIdx(0); setActiveVariation(null); }}
                className="group cursor-pointer flex flex-col"
              >
                <div className="relative aspect-square md:aspect-[4/5] bg-white/5 rounded-3xl overflow-hidden border border-white/5 mb-5 shadow-lg">
                  <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-transparent to-transparent opacity-60 group-hover:opacity-80 transition-opacity duration-500 z-10"></div>
                  {getProductImages(p).length > 0 ? (
                    <img 
                      src={getProductImages(p)[0]} 
                      alt={p.name} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out" 
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/10 italic font-black text-3xl uppercase -rotate-12">
                      {p.category}
                    </div>
                  )}
                  
                  <div className="absolute top-4 right-4 z-20 flex flex-col items-end gap-2">
                    {p.offerLabel && (
                      <span className="px-3 py-1 bg-orange-500 text-white rounded-full text-[9px] font-black uppercase tracking-widest shadow-lg">
                        {p.offerLabel}
                      </span>
                    )}
                  </div>
                  
                  <div className="absolute bottom-4 left-4 right-4 z-20 translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
                    <button className="w-full py-3.5 bg-white/10 backdrop-blur-md border border-white/20 text-white font-bold uppercase tracking-widest text-[10px] rounded-2xl flex items-center justify-center gap-2 hover:bg-white hover:text-black transition-colors">
                      <ShoppingBag size={14} /> View Details
                    </button>
                  </div>
                </div>
                
                <div className="space-y-1.5 px-2 flex-1 flex flex-col">
                  <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-orange-500/80">{p.category}</span>
                  <h3 className="text-lg font-bold tracking-tight group-hover:text-orange-500 transition-colors leading-tight">{p.name}</h3>
                  <div className="mt-auto pt-2 flex items-center gap-3">
                    <span className="text-lg font-black tracking-tight">Rs. {(p.discountPrice || p.price).toFixed(2)}</span>
                    {p.discountPrice && (
                      <span className="text-xs text-white/30 line-through">Rs. {p.price.toFixed(2)}</span>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {/* Advanced Product Detail Modal */}
      <AnimatePresence>
        {selectedProduct && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/90 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-[#0a0a0a] border border-white/10 flex flex-col lg:flex-row relative max-w-6xl w-full max-h-[90vh] rounded-[32px] overflow-y-auto lg:overflow-hidden shadow-2xl"
            >
              <button 
                onClick={() => setSelectedProduct(null)}
                className="absolute top-4 right-4 sm:top-6 sm:right-6 z-50 p-2 bg-black/50 text-white hover:bg-white hover:text-black border border-white/10 rounded-full transition-all"
              >
                <X size={20} />
              </button>

              {/* Left: Images */}
              <div className="w-full lg:w-1/2 aspect-square lg:aspect-auto bg-black relative shrink-0">
                {getProductImages(selectedProduct).length > 0 ? (
                  <div className="w-full h-full flex flex-col">
                    <img src={getProductImages(selectedProduct)[selectedImageIdx]} alt={selectedProduct.name} className="w-full h-full object-cover lg:absolute inset-0" referrerPolicy="no-referrer" />
                    {getProductImages(selectedProduct).length > 1 && (
                      <div className="absolute bottom-4 left-4 right-4 flex gap-2 overflow-x-auto hide-scrollbar p-2 bg-black/40 backdrop-blur-md rounded-2xl border border-white/10">
                        {getProductImages(selectedProduct).map((img, idx) => (
                          <button
                            key={idx}
                            onClick={() => setSelectedImageIdx(idx)}
                            className={`shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 transition-all ${selectedImageIdx === idx ? 'border-orange-500 scale-105' : 'border-transparent opacity-50 hover:opacity-100'}`}
                          >
                            <img src={img} alt="thumb" className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/5 italic font-black text-6xl uppercase -rotate-12 bg-white/[0.02]">
                    {selectedProduct.category}
                  </div>
                )}
              </div>

              {/* Right: Details */}
              <div className="w-full lg:w-1/2 p-6 sm:p-8 lg:p-12 flex flex-col lg:overflow-y-auto bg-gradient-to-b from-white/[0.03] to-transparent">
                <div className="mb-8">
                  <span className="inline-block px-3 py-1 bg-white/5 border border-white/10 rounded-full text-xs font-bold uppercase tracking-[0.2em] text-white/50 mb-4 block w-fit">
                    {selectedProduct.category}
                  </span>
                  <h2 className="text-4xl sm:text-5xl font-black tracking-tighter uppercase italic mb-4 leading-[0.9]">
                    {selectedProduct.name}
                  </h2>
                  <div className="flex items-center gap-4 mb-6">
                    <span className="text-4xl font-black text-orange-500">
                      Rs. {(activeVariation ? activeVariation.price : (selectedProduct.discountPrice || selectedProduct.price)).toFixed(2)}
                    </span>
                    {!activeVariation && selectedProduct.discountPrice && (
                      <span className="text-xl text-white/30 line-through">Rs. {selectedProduct.price.toFixed(2)}</span>
                    )}
                  </div>
                  <p className="text-white/60 leading-relaxed text-sm md:text-base">
                    {selectedProduct.description || "Premium industrial grade. Contact us for bulk pricing and technical datasheets."}
                  </p>
                </div>

                {/* Variations */}
                {selectedProduct.variations && selectedProduct.variations.length > 0 && (
                  <div className="mb-8 space-y-3">
                    <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em]">Select Type / Size</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {selectedProduct.variations.map(v => (
                        <button 
                          key={v.id} 
                          onClick={() => setActiveVariation(v)}
                          className={`p-4 rounded-2xl border text-left transition-all ${activeVariation?.id === v.id ? 'bg-orange-500/10 border-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.15)]' : 'bg-white/5 border-white/10 hover:border-white/30'}`}
                        >
                          <div className="font-bold text-sm mb-1">{v.name}</div>
                          <div className="text-xs text-white/60 mb-2">Rs. {v.price.toFixed(2)}</div>
                          <div className={`text-[10px] uppercase font-bold tracking-wider ${v.stock > 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {v.stock > 0 ? `${v.stock} in stock` : 'Out of stock'}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {!selectedProduct.variations?.length && (
                  <div className="mb-8">
                     <div className={`inline-block px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest ${selectedProduct.stock > 0 ? 'bg-green-500/10 text-green-500 border border-green-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
                        {selectedProduct.stock > 0 ? `${selectedProduct.stock} Units Available` : 'Currently Out of Stock'}
                      </div>
                  </div>
                )}

                <div className="mt-auto pt-6 border-t border-white/10">
                  <button 
                    onClick={addToCart}
                    disabled={(selectedProduct.variations?.length > 0 && !activeVariation) || (activeVariation ? activeVariation.stock <= 0 : selectedProduct.stock <= 0)}
                    className="w-full py-5 bg-white text-black font-black uppercase tracking-widest text-sm rounded-2xl flex items-center justify-center gap-3 hover:bg-orange-500 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                  >
                    <ShoppingBag size={18} className="group-hover:scale-110 transition-transform" /> 
                    {selectedProduct.variations?.length > 0 && !activeVariation ? 'Select a variation' : 'Add to Order List'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* VP Points Modal */}
      <AnimatePresence>
        {isVpModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-[#0a0a0a] border border-white/10 w-full max-w-md rounded-3xl overflow-hidden shadow-2xl relative"
            >
              <button 
                onClick={() => {
                  setIsVpModalOpen(false);
                  setVpData(null);
                  setVpError('');
                  setVpPhone('');
                }}
                className="absolute top-4 right-4 z-50 p-2 text-white/50 hover:text-white hover:bg-white/10 rounded-full transition-all"
              >
                <X size={20} />
              </button>
              
              <div className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 bg-orange-500/10 border border-orange-500/20 rounded-2xl flex items-center justify-center text-orange-500">
                    <Award size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold tracking-tight uppercase">Loyalty Points</h3>
                    <p className="text-xs text-white/40 uppercase tracking-widest font-bold">Check your VP Balance</p>
                  </div>
                </div>

                {!vpData ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-widest text-white/60 mb-2">Phone Number</label>
                      <input 
                        type="text"
                        value={vpPhone}
                        onChange={(e) => setVpPhone(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleCheckVp()}
                        placeholder="e.g. 03001234567"
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
                      />
                    </div>
                    {vpError && (
                      <p className="text-red-500 text-sm font-bold">{vpError}</p>
                    )}
                    <button
                      onClick={handleCheckVp}
                      disabled={isVpLoading}
                      className="w-full py-4 bg-orange-500 text-white font-bold uppercase tracking-widest text-sm rounded-xl hover:bg-orange-600 transition-colors disabled:opacity-50"
                    >
                      {isVpLoading ? 'Checking...' : 'Check Balance'}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center">
                      <p className="text-sm font-bold text-white/60 mb-1">Welcome back,</p>
                      <p className="text-xl font-black uppercase mb-6 truncate">{vpData.name}</p>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-black/50 rounded-xl p-4 border border-white/5">
                          <p className="text-[10px] uppercase font-bold tracking-widest text-white/40 mb-1">Current Balance</p>
                          <p className="text-3xl font-black text-orange-500">{vpData.balance}</p>
                        </div>
                        <div className="flex flex-col gap-2">
                           <div className="bg-black/50 rounded-xl p-2 border border-white/5 flex-1 flex flex-col justify-center">
                             <p className="text-[9px] uppercase font-bold tracking-widest text-white/40">Total Earned</p>
                             <p className="text-sm font-bold text-white/80">{vpData.earned}</p>
                           </div>
                           <div className="bg-black/50 rounded-xl p-2 border border-white/5 flex-1 flex flex-col justify-center">
                             <p className="text-[9px] uppercase font-bold tracking-widest text-white/40">Redeemed</p>
                             <p className="text-sm font-bold text-white/80">{vpData.redeemed}</p>
                           </div>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => { setVpData(null); setVpPhone(''); }}
                      className="w-full py-3 bg-white/10 text-white font-bold uppercase tracking-widest text-sm rounded-xl hover:bg-white/20 transition-colors"
                    >
                      Check Another
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Slide-out Cart Drawer */}
      <AnimatePresence>
        {isCartOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsCartOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110]"
            />
            <motion.div 
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 bottom-0 w-full sm:w-[450px] bg-[#0a0a0a] border-l border-white/10 z-[120] flex flex-col shadow-2xl"
            >
              <div className="p-6 border-b border-white/5 flex justify-between items-center bg-black/20">
                <h2 className="text-xl font-bold uppercase tracking-widest flex items-center gap-3">
                  <ShoppingBag size={20} className="text-orange-500" /> Order List
                </h2>
                <button onClick={() => setIsCartOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-all">
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
                {cart.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-white/30 gap-4">
                    <ShoppingCart size={48} strokeWidth={1} />
                    <p className="text-sm uppercase tracking-widest font-bold">List is empty</p>
                  </div>
                ) : (
                  cart.map((item, idx) => (
                    <div key={idx} className="flex gap-4 p-4 bg-white/5 border border-white/10 rounded-2xl">
                      <div className="w-16 h-16 rounded-xl overflow-hidden bg-black shrink-0">
                        {getProductImages(item.product)[0] ? (
                          <img src={getProductImages(item.product)[0]} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-white/10" />
                        )}
                      </div>
                      <div className="flex-1 flex flex-col justify-between">
                        <div>
                          <h4 className="font-bold text-sm leading-tight">{item.product.name}</h4>
                          {item.variation && <p className="text-xs text-orange-500 mt-0.5">{item.variation.name}</p>}
                        </div>
                        <div className="flex justify-between items-center mt-2">
                          <span className="font-bold text-sm">
                            Rs. {(item.variation ? item.variation.price : (item.product.discountPrice || item.product.price)).toFixed(2)}
                          </span>
                          <div className="flex items-center gap-3 bg-black/50 rounded-full border border-white/10 px-2 py-1">
                            <button onClick={() => updateCartQty(idx, -1)} className="p-1 hover:text-orange-500"><Minus size={12}/></button>
                            <span className="text-xs font-bold w-4 text-center">{item.quantity}</span>
                            <button onClick={() => updateCartQty(idx, 1)} className="p-1 hover:text-orange-500"><Plus size={12}/></button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="p-6 border-t border-white/5 bg-black/40 backdrop-blur-md">
                <div className="flex justify-between items-center mb-6">
                  <span className="text-white/50 uppercase tracking-widest text-xs font-bold">Total Estimate</span>
                  <span className="text-2xl font-black">Rs. {cartTotal.toFixed(2)}</span>
                </div>
                <button 
                  onClick={checkoutWhatsApp}
                  disabled={cart.length === 0}
                  className="w-full py-4 bg-[#25D366] text-white font-bold uppercase tracking-widest text-sm rounded-xl flex items-center justify-center gap-3 hover:bg-[#20bd5a] transition-all disabled:opacity-50 disabled:grayscale"
                >
                  <Send size={18} /> Request Order via WhatsApp
                </button>
                <p className="text-center text-[10px] text-white/30 uppercase tracking-widest mt-4">
                  Send your list directly to our sales team
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <footer className="border-t border-white/10 bg-black/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col sm:flex-row gap-2 sm:gap-6 sm:items-center sm:justify-between text-xs uppercase tracking-widest">
          <p className="text-white/60">Location: <span className="text-white font-bold">{shopAddress}</span></p>
          <p className="text-white/60">Phone: <span className="text-orange-400 font-bold">{shopPhone}</span></p>
        </div>
      </footer>

      <style dangerouslySetContent={{__html: `
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
    </div>
  );
}




