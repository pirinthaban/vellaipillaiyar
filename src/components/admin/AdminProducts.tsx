import React, { useState } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../../firebase';
import { Product, Category, Variation } from '../../types';
import { Plus, Trash2, Edit2, Search, Printer, Upload, Barcode, X, Download, Package } from 'lucide-react';
import { format } from 'date-fns';
import BarcodeGenerator from 'react-barcode';

interface Props {
  products: Product[];
  onPrintSingle: (data: string | null) => void;
  onPrintBatch: (data: string[] | null) => void;
}

const EMPTY_PRODUCT: Partial<Product> = {
  name: '', category: 'paint', price: 0, costPrice: 0, stock: 0, barcode: '', description: '', image: '', discountPrice: 0, offerLabel: '', variations: [], unit: 'qty'
};

export default function AdminProducts({ products, onPrintSingle, onPrintBatch }: Props) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [newProduct, setNewProduct] = useState<Partial<Product>>({ ...EMPTY_PRODUCT });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showBatchPrintModal, setShowBatchPrintModal] = useState(false);
  const [batchPrintCopies, setBatchPrintCopies] = useState(1);
  const [showBulkUpdateModal, setShowBulkUpdateModal] = useState(false);
  const [bulkCategory, setBulkCategory] = useState<'no-change' | Category>('no-change');
  const [bulkPublished, setBulkPublished] = useState<'no-change' | 'visible' | 'hidden'>('no-change');
  const [stockAdjustProduct, setStockAdjustProduct] = useState<Product | null>(null);
  const [stockIncreaseQty, setStockIncreaseQty] = useState(0);
  const [showVariantStockModal, setShowVariantStockModal] = useState(false);
  const [variantStockUpdates, setVariantStockUpdates] = useState<Record<string, number>>({});
  const [variantVisibilityUpdates, setVariantVisibilityUpdates] = useState<Record<string, boolean>>({});

  const isProductVisible = (published: unknown) => {
    if (published === false || published === 'false' || published === 'hidden' || published === 0) return false;
    return true;
  };

  const isBarcodeUnique = (barcode: string, currentProductId?: string, currentVariationId?: string) => {
    if (!barcode) return true;
    for (const p of products) {
      if (p.id === currentProductId) continue; // Skip the current product being edited
      if (p.barcode === barcode) return false;
      if (p.variations) for (const v of p.variations) if (v.barcode === barcode) return false;
    }
    // For new products, check variations in the form
    if (newProduct.variations) {
      for (const v of newProduct.variations) {
        if (v.id === currentVariationId) continue; // Skip the current variation being edited
        if (v.barcode === barcode) return false;
      }
    }
    return true;
  };

  const generateBarcode = (forVariationId?: string, variationIdx?: number) => {
    const chars = '0123456789';
    let code = '', isUnique = false, attempts = 0;
    while (!isUnique && attempts < 100) {
      code = Array.from({ length: 10 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
      isUnique = isBarcodeUnique(code, editingProduct?.id, forVariationId);
      attempts++;
    }
    if (variationIdx !== undefined) {
      const variations = [...(newProduct.variations || [])];
      variations[variationIdx].barcode = code;
      setNewProduct({ ...newProduct, variations });
    } else {
      setNewProduct((prev: Partial<Product>) => ({ ...prev, barcode: code }));
    }
  };

  const uploadProductImages = async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    try {
      const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'YOUR_CLOUD_NAME_HERE';
      const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'YOUR_UNSIGNED_PRESET_HERE';

      if (CLOUD_NAME === 'YOUR_CLOUD_NAME_HERE' || UPLOAD_PRESET === 'YOUR_UNSIGNED_PRESET_HERE') {
        throw new Error('Please configure your Cloudinary Cloud Name & Upload Preset in code or .env');
      }

      const safeName = (newProduct.name || 'product').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();

      const uploadedUrls = await Promise.all(files.map(async (file, idx) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', UPLOAD_PRESET);
        formData.append('folder', 'hardware-pos');
        formData.append('public_id', `${safeName}_${newProduct.barcode || Date.now()}_${idx}`);

        const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) throw new Error('Cloudinary upload failed');

        const data = await response.json();
        return data.secure_url as string;
      }));

      setNewProduct((prev: Partial<Product>) => {
        const currentImages = prev.images && prev.images.length > 0
          ? prev.images
          : (prev.image ? [prev.image] : []);
        const images = [...new Set([...currentImages, ...uploadedUrls])];
        return {
          ...prev,
          image: images[0] || '',
          images,
        };
      });
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to upload image to Cloudinary. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    await uploadProductImages(files.filter(file => file.type.startsWith('image/')));
    e.target.value = '';
  };

  const removeImage = (imageUrl: string) => {
    setNewProduct((prev: Partial<Product>) => {
      const currentImages = prev.images && prev.images.length > 0
        ? prev.images
        : (prev.image ? [prev.image] : []);
      const images = currentImages.filter((url: string) => url !== imageUrl);
      return {
        ...prev,
        image: images[0] || '',
        images,
      };
    });
  };

  const getProductImages = (product: Partial<Product> | Product) => {
    if (product.images && product.images.length > 0) return product.images;
    return product.image ? [product.image] : [];
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFiles(false);
    const files = Array.from(e.dataTransfer.files || []) as File[];
    await uploadProductImages(files.filter(file => file.type.startsWith('image/')));
  };

  const normalizeProductImages = (productToSave: Partial<Product>) => {
    const images = getProductImages(productToSave);
    return {
      ...productToSave,
      image: images[0] || '',
      images,
    };
  };

  const getPrimaryImage = (product: Partial<Product> | Product) => getProductImages(product)[0] || '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const productToSave = { ...newProduct };
      // Skip validation for stock-only updates (just updating inventory)
      const hasProductChanges = editingProduct && (
        productToSave.name !== editingProduct.name ||
        productToSave.category !== editingProduct.category ||
        productToSave.description !== editingProduct.description ||
        productToSave.price !== editingProduct.price ||
        productToSave.barcode !== editingProduct.barcode
      );
      
      // Only validate barcodes if updating product details, not just stock
      if (!editingProduct || hasProductChanges) {
        if (productToSave.barcode && (!productToSave.variations || productToSave.variations.length === 0) && !isBarcodeUnique(productToSave.barcode, editingProduct?.id)) {
          setError(`Barcode ${productToSave.barcode} is already in use.`); return;
        }
        if (productToSave.variations && productToSave.variations.length > 0) {
          for (const v of productToSave.variations as Variation[]) {
            if (v.barcode && !isBarcodeUnique(v.barcode, editingProduct?.id, v.id)) {
              setError(`Variation barcode ${v.barcode} is already in use.`); return;
            }
          }
        }
      }
      if (productToSave.variations && productToSave.variations.length > 0) {
        const variations = productToSave.variations as Variation[];
        productToSave.stock = variations.reduce((acc: number, variation: Variation) => acc + variation.stock, 0);
        productToSave.price = Math.min(...variations.map((variation: Variation) => variation.price));
        productToSave.costPrice = Math.min(...variations.map((variation: Variation) => variation.costPrice || 0));
        const validDiscounts = variations
          .map((variation: Variation) => variation.discountPrice)
          .filter((price: number | undefined): price is number => price !== undefined && price > 0);
        productToSave.discountPrice = validDiscounts.length > 0 ? Math.min(...validDiscounts) : 0;
        productToSave.offerLabel = variations.find((variation: Variation) => variation.offerLabel)?.offerLabel || '';
        productToSave.barcode = variations.find((variation: Variation) => variation.barcode)?.barcode || '';
      }
      const normalizedProduct = normalizeProductImages(productToSave);
      if (editingProduct) {
        await updateDoc(doc(db, 'products', editingProduct.id), normalizedProduct);
      } else {
        await addDoc(collection(db, 'products'), normalizedProduct);
      }
      setIsAdding(false);
      setEditingProduct(null);
      setNewProduct({ ...EMPTY_PRODUCT });
    } catch (err: any) {
      console.error(err);
      const parsed = typeof err?.message === 'string' && err.message.startsWith('{')
        ? (() => {
            try {
              return JSON.parse(err.message).error as string;
            } catch {
              return '';
            }
          })()
        : '';
      const rawMessage = parsed || err?.message || 'Failed to save product. Please try again.';
      if (rawMessage.toLowerCase().includes('insufficient permissions') || rawMessage.toLowerCase().includes('permission')) {
        const uid = auth.currentUser?.uid || 'unknown-uid';
        const email = auth.currentUser?.email || 'unknown-email';
        setError(`Permission denied. Publish latest Firestore rules and ensure users/${uid} has role 'admin' or 'seller'. Current login: ${email}`);
        return;
      }
      setError(rawMessage);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'products', id));
      setDeleteConfirm(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `products/${id}`);
    }
  };

  const toggleVisibility = async (product: Product) => {
    try {
      const currentlyVisible = isProductVisible(product.published);
      await updateDoc(doc(db, 'products', product.id), { published: !currentlyVisible });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `products/${product.id}`);
    }
  };

  const handleBatchPrint = () => {
    const barcodes = products.filter(p => selectedProductIds.has(p.id)).flatMap(p => {
      const codes: string[] = [];
      if (p.barcode) codes.push(p.barcode);
      if (p.variations) p.variations.forEach(v => { if (v.barcode) codes.push(v.barcode); });
      return codes;
    });
    if (barcodes.length === 0) { setError('No products with barcodes selected.'); return; }
    setShowBatchPrintModal(true);
  };

  const confirmBatchPrint = () => {
    const barcodes: string[] = [];
    products.forEach(p => {
      if (!selectedProductIds.has(p.id)) return;
      for (let i = 0; i < batchPrintCopies; i++) {
        if (p.barcode) barcodes.push(p.barcode);
        if (p.variations) p.variations.forEach(v => { if (v.barcode) barcodes.push(v.barcode); });
      }
    });
    onPrintBatch(barcodes);
    setShowBatchPrintModal(false);
    setBatchPrintCopies(1);
  };

  const applyBulkUpdate = async () => {
    if (selectedProductIds.size === 0) return;
    const updates: Record<string, any> = {};

    if (bulkCategory !== 'no-change') updates.category = bulkCategory;
    if (bulkPublished === 'visible') updates.published = true;
    if (bulkPublished === 'hidden') updates.published = false;

    if (Object.keys(updates).length === 0) {
      setError('Choose at least one field to update.');
      return;
    }

    try {
      const batch = writeBatch(db);
      products.forEach((p) => {
        if (!selectedProductIds.has(p.id)) return;
        batch.update(doc(db, 'products', p.id), updates);
      });
      await batch.commit();
      setShowBulkUpdateModal(false);
      setBulkCategory('no-change');
      setBulkPublished('no-change');
      setError(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'products (bulk update)');
    }
  };

  const applyStockIncrease = async () => {
    if (!stockAdjustProduct) return;
    const qty = Math.max(0, Number(stockIncreaseQty) || 0);
    if (qty <= 0) {
      setError('Enter a stock quantity greater than 0.');
      return;
    }

    try {
      await updateDoc(doc(db, 'products', stockAdjustProduct.id), {
        stock: (stockAdjustProduct.stock || 0) + qty,
      });
      setShowVariantStockModal(false);
      setStockAdjustProduct(null);
      setStockIncreaseQty(0);
      setError(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `products/${stockAdjustProduct.id}`);
    }
  };

  const openVariantStockModal = (product: Product) => {
    if (!product.variations || product.variations.length === 0) {
      setError('This product has no variations.');
      return;
    }
    setStockIncreaseQty(0);
    setStockAdjustProduct(product);
    const initialUpdates: Record<string, number> = {};
    const initialVisibility: Record<string, boolean> = {};
    product.variations.forEach(v => {
      initialUpdates[v.id || ''] = v.stock || 0;
      initialVisibility[v.id || ''] = v.published !== false; // Default to visible
    });
    setVariantStockUpdates(initialUpdates);
    setVariantVisibilityUpdates(initialVisibility);
    setShowVariantStockModal(true);
  };

  const applyVariantStockUpdates = async () => {
    if (!stockAdjustProduct || !stockAdjustProduct.variations) return;
    
    try {
      const updatedVariations = stockAdjustProduct.variations.map((v: Variation) => ({
        ...v,
        stock: variantStockUpdates[v.id || ''] ?? v.stock,
        published: variantVisibilityUpdates[v.id || ''] ?? v.published
      }));
      
      // Recalculate product-level stock
      const totalStock = updatedVariations.reduce((acc: number, v: Variation) => acc + (v.stock || 0), 0);
      
      await updateDoc(doc(db, 'products', stockAdjustProduct.id), {
        variations: updatedVariations,
        stock: totalStock
      });
      
      setShowVariantStockModal(false);
      setStockAdjustProduct(null);
      setVariantStockUpdates({});
      setVariantVisibilityUpdates({});
      setError(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `products/${stockAdjustProduct.id}`);
    }
  };

  const exportToCSV = () => {
    const headers = ['Name', 'Category', 'Cost Price', 'Sell Price', 'Discount Price', 'Stock', 'Barcode', 'Description'];
    const rows = products.map(p => [p.name, p.category, (p.costPrice || 0).toString(), p.price.toString(), (p.discountPrice || 0).toString(), p.stock.toString(), p.barcode || '', p.description || '']);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    link.download = `inventory_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.barcode?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const updateVariation = (idx: number, field: string, value: any) => {
    const variations = [...(newProduct.variations || [])];
    (variations[idx] as any)[field] = value;
    setNewProduct({ ...newProduct, variations });
  };

  return (
    <div className="space-y-6">
      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl flex justify-between items-center">
          <p className="text-sm font-medium">{error}</p>
          <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 rounded-full"><X size={16} /></button>
        </div>
      )}

      {/* Header Row */}
      <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <h2 className="text-xl sm:text-2xl font-bold text-neutral-900">Product Inventory</h2>
          <div className="relative w-full sm:w-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={18} />
            <input
              placeholder="Search products..."
              className="pl-10 pr-4 py-2 bg-white border border-neutral-200 rounded-xl text-sm focus:ring-2 focus:ring-neutral-900 transition-all w-full sm:w-64"
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 w-full sm:w-auto">
          <button onClick={exportToCSV} className="w-full sm:w-auto justify-center bg-white text-neutral-900 border border-neutral-200 px-4 py-3 sm:py-2 rounded-xl sm:rounded-lg flex items-center gap-2 hover:bg-neutral-50 transition-all shadow-sm">
            <Download size={20} /> Export
          </button>
          {selectedProductIds.size > 0 && (
            <button onClick={handleBatchPrint} className="w-full sm:w-auto justify-center bg-blue-600 text-white border border-blue-700 px-4 py-3 sm:py-2 rounded-xl sm:rounded-lg flex items-center gap-2 hover:bg-blue-700 transition-all shadow-lg">
              <Printer size={20} /> Batch Print ({selectedProductIds.size})
            </button>
          )}
          {selectedProductIds.size > 0 && (
            <button onClick={() => setShowBulkUpdateModal(true)} className="w-full sm:w-auto justify-center bg-amber-600 text-white border border-amber-700 px-4 py-3 sm:py-2 rounded-xl sm:rounded-lg flex items-center gap-2 hover:bg-amber-700 transition-all shadow-lg">
              <Edit2 size={20} /> Update Selected ({selectedProductIds.size})
            </button>
          )}
          <button onClick={() => setIsAdding(true)} className="w-full sm:w-auto justify-center bg-neutral-900 text-white px-4 py-3 sm:py-2 rounded-xl sm:rounded-lg flex items-center gap-2 hover:bg-neutral-800 transition-all">
            <Plus size={20} /> Add Product
          </button>
        </div>
      </div>

      {/* Batch Print Modal */}
      {showBatchPrintModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 bg-blue-50 rounded-2xl text-blue-600"><Printer size={24} /></div>
              <div>
                <h3 className="text-xl font-bold text-neutral-900">Batch Print Options</h3>
                <p className="text-sm text-neutral-500">How many copies of each barcode?</p>
              </div>
            </div>
            <div className="space-y-6">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Number of Copies</label>
                <input type="number" min="1" max="50" className="w-full p-4 bg-neutral-50 border border-neutral-200 rounded-2xl text-2xl font-bold text-center" value={batchPrintCopies} onChange={e => setBatchPrintCopies(Math.max(1, parseInt(e.target.value) || 1))} />
              </div>
              <div className="flex gap-3">
                <button onClick={confirmBatchPrint} className="flex-1 bg-blue-600 text-white py-4 rounded-2xl font-bold hover:bg-blue-700 transition-all">Generate & Print</button>
                <button onClick={() => setShowBatchPrintModal(false)} className="flex-1 bg-neutral-100 text-neutral-600 py-4 rounded-2xl font-bold hover:bg-neutral-200 transition-all">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showBulkUpdateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-bold text-neutral-900">Update Selected Products</h3>
            <p className="text-sm text-neutral-500 mt-1 mb-6">Apply changes to {selectedProductIds.size} selected products.</p>

            <div className="space-y-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Category</label>
                <select
                  value={bulkCategory}
                  onChange={(e) => setBulkCategory(e.target.value as 'no-change' | Category)}
                  className="p-3 border border-neutral-200 rounded-xl bg-neutral-50"
                >
                  <option value="no-change">No Change</option>
                  {['paint', 'wiring', 'electrical', 'oils', 'pipeline', 'construction'].map(c => (
                    <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Visibility</label>
                <select
                  value={bulkPublished}
                  onChange={(e) => setBulkPublished(e.target.value as 'no-change' | 'visible' | 'hidden')}
                  className="p-3 border border-neutral-200 rounded-xl bg-neutral-50"
                >
                  <option value="no-change">No Change</option>
                  <option value="visible">Visible</option>
                  <option value="hidden">Hidden</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={applyBulkUpdate} className="flex-1 bg-amber-600 text-white py-3 rounded-xl font-bold hover:bg-amber-700 transition-all">Apply Updates</button>
              <button onClick={() => setShowBulkUpdateModal(false)} className="flex-1 bg-neutral-100 text-neutral-700 py-3 rounded-xl font-bold hover:bg-neutral-200 transition-all">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Form */}
      {isAdding && (
        <div className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm">
          <h3 className="text-lg font-bold text-neutral-900 mb-6">{editingProduct ? 'Edit Product' : 'Add New Product'}</h3>
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-600 text-sm font-medium">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />{error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Basic Details Column */}
            <div className="space-y-4">
              <h4 className="font-bold text-neutral-900 border-b pb-2">Basic Details</h4>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-neutral-400 uppercase">Product Name</label>
                <input placeholder="e.g. Premium White Paint" className="p-3 border rounded-xl bg-neutral-50 focus:bg-white transition-all" required value={newProduct.name} onChange={e => setNewProduct({ ...newProduct, name: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-neutral-400 uppercase">Category</label>
                <select className="p-3 border rounded-xl bg-neutral-50 focus:bg-white transition-all" value={newProduct.category} onChange={e => setNewProduct({ ...newProduct, category: e.target.value as Category })}>
                  {['paint', 'wiring', 'electrical', 'oils', 'pipeline', 'construction'].map(c => (
                    <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-neutral-400 uppercase">Measurement Unit</label>
                <select className="p-3 border rounded-xl bg-neutral-50 focus:bg-white transition-all" value={newProduct.unit || 'qty'} onChange={e => setNewProduct({ ...newProduct, unit: e.target.value as any })}>
                  <option value="qty">Quantity (qty)</option>
                  <option value="kg">Kilogram (kg)</option>
                  <option value="lb">Pound (lb)</option>
                  <option value="ft">Feet (ft)</option>
                  <option value="m">Meter (m)</option>
                  <option value="yd">Yard (yd)</option>
                  <option value="pc">Piece (pc)</option>
                </select>
              </div>
              {(!newProduct.variations || newProduct.variations.length === 0) ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-neutral-400 uppercase">Cost Price (Get)</label>
                      <input type="number" placeholder="0.00" className="p-3 border rounded-xl bg-neutral-50 focus:bg-white transition-all" value={newProduct.costPrice || ''} onChange={e => setNewProduct({ ...newProduct, costPrice: parseFloat(e.target.value) || 0 })} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-neutral-400 uppercase">Sell Price</label>
                      <input type="number" placeholder="0.00" className="p-3 border rounded-xl bg-neutral-50 focus:bg-white transition-all" required value={newProduct.price || ''} onChange={e => setNewProduct({ ...newProduct, price: parseFloat(e.target.value) || 0 })} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-neutral-400 uppercase">Discount Price</label>
                      <input type="number" placeholder="0.00" className="p-3 border rounded-xl bg-neutral-50 focus:bg-white transition-all" value={newProduct.discountPrice || ''} onChange={e => setNewProduct({ ...newProduct, discountPrice: parseFloat(e.target.value) || 0 })} />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-neutral-400 uppercase">Offer Label</label>
                    <input placeholder="e.g. 10% OFF" className="p-3 border rounded-xl bg-neutral-50 focus:bg-white transition-all" value={newProduct.offerLabel} onChange={e => setNewProduct({ ...newProduct, offerLabel: e.target.value })} />
                  </div>
                </>
              ) : (
                <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl">
                  <p className="text-xs text-blue-600 font-medium">Pricing is managed within Variations below.</p>
                </div>
              )}
            </div>

            {/* Inventory & Media Column */}
            <div className="space-y-4">
              <h4 className="font-bold text-neutral-900 border-b pb-2">Inventory & Media</h4>
              {(!newProduct.variations || newProduct.variations.length === 0) ? (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-neutral-400 uppercase">Barcode</label>
                    <div className="flex gap-2">
                      <input placeholder="Scan or generate" className="flex-1 p-3 border rounded-xl bg-neutral-50 focus:bg-white transition-all" value={newProduct.barcode} onChange={e => setNewProduct({ ...newProduct, barcode: e.target.value })} />
                      <button type="button" onClick={() => generateBarcode()} className="p-3 bg-neutral-100 rounded-xl hover:bg-neutral-200 transition-all" title="Generate Barcode"><Barcode size={20} /></button>
                    </div>
                    {newProduct.barcode && (
                      <div className="bg-white p-2 rounded-xl border border-neutral-100 flex justify-center">
                        <BarcodeGenerator value={newProduct.barcode} width={1} height={40} fontSize={12} background="#ffffff" />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-neutral-400 uppercase">Stock Level</label>
                    <input type="number" placeholder="0" className="p-3 border rounded-xl bg-neutral-50 focus:bg-white transition-all" required value={newProduct.stock} onChange={e => setNewProduct({ ...newProduct, stock: parseInt(e.target.value) })} />
                  </div>
                </>
              ) : (
                <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl">
                  <p className="text-xs text-blue-600 font-medium">Barcode & stock are managed within Variations below.</p>
                </div>
              )}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-neutral-400 uppercase">Product Image</label>
                <div
                  className={`space-y-4 rounded-2xl border-2 border-dashed p-4 transition-all ${isDraggingFiles ? 'border-orange-500 bg-orange-50' : 'border-neutral-200 bg-neutral-50'}`}
                  onDragEnter={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDraggingFiles(true);
                  }}
                  onDragOver={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDraggingFiles(true);
                  }}
                  onDragLeave={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDraggingFiles(false);
                  }}
                  onDrop={handleDrop}
                >
                  <div className="flex flex-wrap gap-3">
                    {getProductImages(newProduct).map((img) => (
                      <div key={img} className="relative w-20 h-20 bg-white rounded-xl overflow-hidden border border-neutral-200 shadow-sm">
                        <img src={img} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeImage(img)}
                          className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 hover:bg-red-700"
                          title="Remove image"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                    {getProductImages(newProduct).length === 0 && (
                      <div className="w-full flex flex-col items-center justify-center gap-2 py-6 text-center">
                        <Upload size={24} className="text-neutral-300" />
                        <p className="text-xs font-medium text-neutral-500">Drag and drop photos here, or choose files below</p>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <input type="file" accept="image/*" multiple onChange={handleImageUpload} className="text-xs flex-1" />
                    {uploading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-neutral-900" />}
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-neutral-400 uppercase">Description</label>
                <textarea placeholder="Product details..." className="p-3 border rounded-xl bg-neutral-50 focus:bg-white transition-all h-24" value={newProduct.description} onChange={e => setNewProduct({ ...newProduct, description: e.target.value })} />
              </div>
            </div>

            {/* Variations — full width */}
            <div className="lg:col-span-2 border-t pt-6 mt-2">
              <div className="flex justify-between items-center mb-4">
                <h4 className="text-sm font-bold text-neutral-900 uppercase tracking-widest">Product Variations</h4>
                <button type="button" onClick={() => { const v = [...(newProduct.variations || [])]; v.push({ id: Date.now().toString(), name: '', price: newProduct.price || 0, stock: 0, barcode: '' }); setNewProduct({ ...newProduct, variations: v }); }} className="text-xs font-bold text-neutral-900 flex items-center gap-1 hover:underline">
                  <Plus size={14} /> Add Variation
                </button>
              </div>
              <div className="space-y-4">
                {(newProduct.variations || []).map((v, idx) => (
                  <div key={v.id} className="bg-neutral-50 p-6 rounded-2xl border border-neutral-200 hover:border-neutral-300 transition-all">
                    <div className="flex justify-between items-center mb-4 border-b border-neutral-200 pb-4">
                      <span className="text-xs font-bold text-neutral-900 uppercase tracking-widest">Variation {idx + 1}</span>
                      <button type="button" onClick={() => { const variations = (newProduct.variations || []).filter((_, i) => i !== idx); setNewProduct({ ...newProduct, variations }); }} className="px-3 py-1.5 text-neutral-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all flex items-center gap-2 text-[10px] font-bold uppercase shrink-0">
                        <Trash2 size={14} /> Remove
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {[
                        { label: 'Name', field: 'name', type: 'text', placeholder: 'e.g. 5L / Red' },
                        { label: 'Cost Price', field: 'costPrice', type: 'number', placeholder: '0.00' },
                        { label: 'Sell Price', field: 'price', type: 'number', placeholder: '0.00' },
                        { label: 'Discount Price', field: 'discountPrice', type: 'number', placeholder: '0.00' },
                        { label: 'Stock', field: 'stock', type: 'number', placeholder: '0' },
                        { label: 'Offer Label', field: 'offerLabel', type: 'text', placeholder: 'e.g. 10% OFF' },
                      ].map(({ label, field, type, placeholder }) => (
                        <div key={field} className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-neutral-400 uppercase">{label}</label>
                          <input type={type} placeholder={placeholder} className="p-2 text-sm border rounded-lg bg-white"
                            value={(v as any)[field] || ''} onChange={e => updateVariation(idx, field, type === 'number' ? parseFloat(e.target.value) : e.target.value)} />
                        </div>
                      ))}
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-neutral-400 uppercase">Unit</label>
                        <select className="p-2 text-sm border rounded-lg bg-white" value={v.unit || newProduct.unit || 'qty'} onChange={e => updateVariation(idx, 'unit', e.target.value)}>
                          {['qty', 'kg', 'lb', 'ft', 'm', 'yd', 'pc'].map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1 lg:col-span-2">
                        <label className="text-[10px] font-bold text-neutral-400 uppercase">Barcode</label>
                        <div className="flex gap-2">
                          <input placeholder="Optional" className="flex-1 p-2 text-sm border rounded-lg bg-white" value={v.barcode || ''} onChange={e => updateVariation(idx, 'barcode', e.target.value)} />
                          <button type="button" onClick={() => generateBarcode(v.id, idx)} className="px-3 py-2 bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 transition-all flex items-center gap-2 text-[10px] font-bold uppercase shrink-0">
                            <Barcode size={14} /> Generate
                          </button>
                        </div>
                        {v.barcode && (
                          <div className="bg-white p-2 rounded-lg border border-neutral-100 flex justify-center shadow-sm">
                            <BarcodeGenerator value={v.barcode} width={1.2} height={30} fontSize={10} background="#ffffff" />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {(newProduct.variations || []).length === 0 && (
                  <p className="text-xs text-neutral-400 italic text-center py-4">No variations added. Using base product details.</p>
                )}
              </div>
            </div>

            {/* Submit Buttons — full width */}
            <div className="lg:col-span-2 flex flex-col-reverse sm:flex-row gap-4 sm:justify-end pt-4 border-t">
              <button type="button" onClick={() => { setIsAdding(false); setEditingProduct(null); setNewProduct({ ...EMPTY_PRODUCT }); }} className="w-full sm:w-auto px-6 py-4 sm:py-3 text-neutral-600 font-bold uppercase tracking-widest text-xs rounded-xl hover:bg-neutral-100 transition-all text-center">Cancel</button>
              <button type="submit" className="w-full sm:w-auto px-8 py-4 sm:py-3 bg-neutral-900 text-white rounded-xl font-bold uppercase tracking-widest text-xs shadow-lg hover:bg-neutral-800 transition-all text-center">
                {editingProduct ? 'Update Product' : 'Save Product'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Product Table */}
      <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
        <table className="w-full text-left min-w-[920px]">
          <thead className="bg-neutral-50 border-b border-neutral-200">
            <tr>
              <th className="px-6 py-4 w-10">
                <input type="checkbox" className="rounded border-neutral-300" checked={products.length > 0 && selectedProductIds.size === products.length} onChange={() => selectedProductIds.size === products.length ? setSelectedProductIds(new Set()) : setSelectedProductIds(new Set(products.map(p => p.id)))} />
              </th>
              {['Product', 'Category', 'Pricing', 'Stock', 'Actions'].map(h => (
                <th key={h} className="px-6 py-4 text-xs font-bold text-neutral-400 uppercase tracking-widest">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {filteredProducts.map(p => (
              <tr key={p.id} className={`hover:bg-neutral-50 transition-colors ${selectedProductIds.has(p.id) ? 'bg-neutral-50' : ''}`}>
                <td className="px-6 py-4">
                  <input type="checkbox" className="rounded border-neutral-300" checked={selectedProductIds.has(p.id)} onChange={() => { const next = new Set(selectedProductIds); next.has(p.id) ? next.delete(p.id) : next.add(p.id); setSelectedProductIds(next); }} />
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-neutral-100 rounded-xl flex items-center justify-center overflow-hidden border border-neutral-100">
                      {getPrimaryImage(p) ? <img src={getPrimaryImage(p)} alt={p.name} className="w-full h-full object-cover" /> : <Package size={24} className="text-neutral-300" />}
                    </div>
                    <div>
                      <div className="font-bold text-neutral-900">{p.name}</div>
                      {p.variations && p.variations.length > 0 && <div className="text-[9px] font-bold text-blue-600 uppercase">{p.variations.length} Variations</div>}
                      <div className={`inline-flex mt-1 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-widest ${isProductVisible(p.published) ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                        {isProductVisible(p.published) ? 'Visible' : 'Hidden'}
                      </div>
                      <div className="text-[10px] font-mono text-neutral-400 flex items-center gap-1 uppercase"><Barcode size={10} /> {p.barcode || 'No barcode'}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 bg-neutral-100 px-2 py-1 rounded-md">{p.category}</span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col">
                    <span className={`font-bold ${p.discountPrice ? 'text-xs text-neutral-400 line-through' : 'text-neutral-900'}`}>Rs. {p.price.toFixed(2)}</span>
                    {p.discountPrice && <span className="font-bold text-orange-600">Rs. {p.discountPrice.toFixed(2)}</span>}
                    {p.offerLabel && <span className="text-[9px] font-black uppercase text-orange-500 tracking-tighter">{p.offerLabel}</span>}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col gap-1">
                    <div className="w-24 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                      <div className={`h-full transition-all ${p.stock < 10 ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${Math.min(p.stock, 100)}%` }} />
                    </div>
                    <span className={`text-[10px] font-bold uppercase tracking-widest ${p.stock < 10 ? 'text-red-500' : 'text-neutral-400'}`}>{p.stock} {p.unit || 'qty'}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex gap-1 flex-wrap">
                    {p.variations && p.variations.length > 0 ? (
                      <button
                        onClick={() => openVariantStockModal(p)}
                        className="px-3 py-2 rounded-lg transition-all text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 text-xs font-semibold"
                        title="Update Variant Stock"
                      >
                        Variants
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setShowVariantStockModal(false);
                          setStockAdjustProduct(p);
                          setStockIncreaseQty(0);
                        }}
                        className="px-3 py-2 rounded-lg transition-all text-neutral-700 border border-neutral-200 hover:bg-neutral-100 text-xs font-semibold"
                        title="Increase Stock"
                      >
                        Stock +
                      </button>
                    )}
                    <button onClick={() => toggleVisibility(p)} className={`p-2 rounded-lg transition-all ${isProductVisible(p.published) ? 'text-green-600 hover:bg-green-50' : 'text-neutral-300 hover:bg-neutral-100'}`} title={isProductVisible(p.published) ? 'Visible' : 'Hidden'}>
                      <Search size={18} />
                    </button>
                    <button onClick={() => onPrintSingle(p.barcode || '')} className="p-2 hover:bg-neutral-100 rounded-lg transition-all text-neutral-400 hover:text-neutral-900" title="Print Barcode">
                      <Printer size={18} />
                    </button>
                    <button
                      onClick={() => { setEditingProduct(p); setNewProduct(p); setIsAdding(true); }}
                      className="px-3 py-2 hover:bg-neutral-100 rounded-lg transition-all text-neutral-700 border border-neutral-200 flex items-center gap-1 text-xs font-semibold"
                      title="Update Product"
                    >
                      <Edit2 size={14} /> Update
                    </button>
                    <button onClick={() => setDeleteConfirm(p.id)} className="p-2 hover:bg-red-50 rounded-lg transition-all text-red-400 hover:text-red-600">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {stockAdjustProduct && !showVariantStockModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-bold text-neutral-900">Increase Stock</h3>
            <p className="text-sm text-neutral-500 mt-1">{stockAdjustProduct.name}</p>

            <div className="space-y-2 mt-6">
              <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Add Quantity</label>
              <input
                type="number"
                min={1}
                value={stockIncreaseQty || ''}
                onChange={e => setStockIncreaseQty(parseInt(e.target.value) || 0)}
                className="w-full p-3 border border-neutral-200 rounded-xl bg-neutral-50"
                placeholder="Enter quantity"
              />
              <p className="text-xs text-neutral-500">Current stock: {stockAdjustProduct.stock} {stockAdjustProduct.unit || 'qty'}</p>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={applyStockIncrease} className="flex-1 bg-neutral-900 text-white py-3 rounded-xl font-bold hover:bg-neutral-800 transition-all">Update Stock</button>
              <button onClick={() => { setShowVariantStockModal(false); setStockAdjustProduct(null); setStockIncreaseQty(0); }} className="flex-1 bg-neutral-100 text-neutral-700 py-3 rounded-xl font-bold hover:bg-neutral-200 transition-all">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Variant Stock Update Modal */}
      {showVariantStockModal && stockAdjustProduct && stockAdjustProduct.variations && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-neutral-900">Update Variant Stock & Visibility</h3>
            <p className="text-sm text-neutral-500 mt-1">{stockAdjustProduct.name}</p>

            <div className="space-y-4 mt-6">
              {stockAdjustProduct.variations.map((variant) => {
                const isVisible = variantVisibilityUpdates[variant.id || ''] ?? (variant.published !== false);
                return (
                  <div key={variant.id} className="p-4 border border-neutral-200 rounded-xl hover:border-neutral-300 transition-all">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <p className="font-bold text-neutral-900">{variant.name || `Variant ${variant.id}`}</p>
                        <div className="flex gap-4 mt-2 text-xs text-neutral-500">
                          <span>Price: Rs. {variant.price}</span>
                          {variant.barcode && <span>Barcode: {variant.barcode}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col items-end gap-2">
                          {/* Stock Input */}
                          <div className="flex flex-col items-end">
                            <label className="text-xs font-bold text-neutral-400 uppercase mb-1">Stock</label>
                            <input
                              type="number"
                              min={0}
                              value={variantStockUpdates[variant.id || ''] ?? variant.stock ?? 0}
                              onChange={(e) => setVariantStockUpdates({
                                ...variantStockUpdates,
                                [variant.id || '']: Math.max(0, parseInt(e.target.value) || 0)
                              })}
                              className="w-20 p-2 border border-neutral-200 rounded-lg bg-neutral-50 text-right font-bold"
                            />
                            <span className="text-[10px] text-neutral-400 mt-1">{stockAdjustProduct.unit || 'qty'}</span>
                          </div>
                          
                          {/* Visibility Toggle */}
                          <button
                            type="button"
                            onClick={() => setVariantVisibilityUpdates({
                              ...variantVisibilityUpdates,
                              [variant.id || '']: !isVisible
                            })}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all ${isVisible ? 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100' : 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'}`}
                          >
                            {isVisible ? '✓ Visible' : '✕ Hidden'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-3 mt-8">
              <button 
                onClick={applyVariantStockUpdates} 
                className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-all"
              >
                Apply Changes
              </button>
              <button 
                onClick={() => { setShowVariantStockModal(false); setStockAdjustProduct(null); setVariantStockUpdates({}); setVariantVisibilityUpdates({}); }} 
                className="flex-1 bg-neutral-100 text-neutral-700 py-3 rounded-xl font-bold hover:bg-neutral-200 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-2xl max-w-sm w-full shadow-2xl">
            <h3 className="text-xl font-bold text-neutral-900 mb-4">Delete Product?</h3>
            <p className="text-neutral-500 mb-8">This action cannot be undone.</p>
            <div className="flex gap-4">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-3 bg-neutral-100 text-neutral-600 font-bold rounded-xl">Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl shadow-lg shadow-red-200">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
