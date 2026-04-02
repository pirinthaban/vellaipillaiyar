import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Product, UserProfile, Sale, CustomerProfile } from '../types';

import AdminSidebar from '../components/admin/AdminSidebar';
import AdminDashboard from '../components/admin/AdminDashboard';
import AdminProducts from '../components/admin/AdminProducts';
import AdminSellers from '../components/admin/AdminSellers';
import AdminSales from '../components/admin/AdminSales';
import AdminBuyers from '../components/admin/AdminBuyers';
import InvoiceBill from '../components/admin/InvoiceBill';
import { SingleBarcodeOverlay, BatchBarcodeOverlay } from '../components/admin/BarcodeOverlay';

type Tab = 'dashboard' | 'products' | 'sellers' | 'buyers' | 'sales' | 'invoice';

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [sellers, setSellers] = useState<UserProfile[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [printBarcodeData, setPrintBarcodeData] = useState<string | null>(null);
  const [batchPrintData, setBatchPrintData] = useState<string[] | null>(null);

  useEffect(() => {
    const unsubProducts = onSnapshot(
      query(collection(db, 'products')),
      snapshot => setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product))),
      err => handleFirestoreError(err, OperationType.LIST, 'products')
    );
    const unsubUsers = onSnapshot(
      query(collection(db, 'users')),
      snapshot => setSellers(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile))),
      err => handleFirestoreError(err, OperationType.LIST, 'users')
    );
    const unsubSales = onSnapshot(
      query(collection(db, 'sales')),
      snapshot => setSales(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sale))),
      err => handleFirestoreError(err, OperationType.LIST, 'sales')
    );
    const unsubCustomers = onSnapshot(
      query(collection(db, 'customers')),
      snapshot => setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CustomerProfile))),
      err => handleFirestoreError(err, OperationType.LIST, 'customers')
    );
    setLoading(false);
    return () => { unsubProducts(); unsubUsers(); unsubSales(); unsubCustomers(); };
  }, []);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-neutral-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-neutral-900" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[linear-gradient(180deg,#fafafa_0%,#f3f4f6_100%)] overflow-x-hidden">
      <div className="min-h-screen print:hidden lg:flex">
        <AdminSidebar
          activeTab={activeTab}
          isSidebarOpen={isSidebarOpen}
          isSidebarCollapsed={isSidebarCollapsed}
          onTabChange={setActiveTab}
          onToggleSidebar={setIsSidebarOpen}
          onToggleSidebarCollapsed={setIsSidebarCollapsed}
        />

        <main className="flex-1 overflow-x-hidden overflow-y-auto px-4 pt-20 pb-4 sm:px-6 sm:pt-24 sm:pb-6 lg:p-8">
          {activeTab === 'dashboard' && (
            <AdminDashboard sales={sales} onNavigate={setActiveTab} />
          )}
          {activeTab === 'products' && (
            <AdminProducts
              products={products}
              onPrintSingle={setPrintBarcodeData}
              onPrintBatch={setBatchPrintData}
            />
          )}
          {activeTab === 'sellers' && <AdminSellers sellers={sellers} />}
          {activeTab === 'buyers' && <AdminBuyers customers={customers} sales={sales} />}
          {activeTab === 'sales' && <AdminSales sales={sales} customers={customers} />}
          {activeTab === 'invoice' && <InvoiceBill />}
        </main>
      </div>

      {/* Barcode Print Overlays */}
      {printBarcodeData && (
        <SingleBarcodeOverlay
          barcode={printBarcodeData}
          onClose={() => setPrintBarcodeData(null)}
        />
      )}
      {batchPrintData && (
        <BatchBarcodeOverlay
          barcodes={batchPrintData}
          onClose={() => setBatchPrintData(null)}
        />
      )}
    </div>
  );
}
