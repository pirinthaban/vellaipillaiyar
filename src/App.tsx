import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, limit, query } from 'firebase/firestore';
import { auth, db } from './firebase';
import { UserProfile } from './types';

// Pages
import AdminPage from './pages/AdminPage';
import SellerPage from './pages/SellerPage';
import BuyerPage from './pages/BuyerPage';
import LoginPage from './pages/LoginPage';

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const adminEmail = import.meta.env.VITE_ADMIN_EMAIL || '';
  const sellerEmail = import.meta.env.VITE_SELLER_EMAIL || '';

  const bootstrapUser = async (firebaseUser: typeof auth.currentUser, role: 'admin' | 'seller') => {
    if (!firebaseUser) return null;
    const data = {
      name: firebaseUser.displayName || (role === 'admin' ? 'Admin' : 'Seller'),
      email: firebaseUser.email,
      role,
    };
    const { setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'users', firebaseUser.uid), data);
    return { uid: firebaseUser.uid, ...data } as UserProfile;
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Fetch user profile from Firestore
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (userDoc.exists()) {
          setUser({ uid: firebaseUser.uid, ...userDoc.data() } as UserProfile);
        } else if (adminEmail && firebaseUser.email === adminEmail && firebaseUser.emailVerified) {
          // Bootstrap admin if not exists
          try {
            setUser(await bootstrapUser(firebaseUser, 'admin'));
          } catch (e) {
            console.error('Failed to bootstrap admin:', e);
            setUser(null);
          }
        } else if (sellerEmail && firebaseUser.email === sellerEmail && firebaseUser.emailVerified) {
          // Bootstrap seller if not exists
          try {
            setUser(await bootstrapUser(firebaseUser, 'seller'));
          } catch (e) {
            console.error('Failed to bootstrap seller:', e);
            setUser(null);
          }
        } else {
          try {
            const usersSnap = await getDocs(query(collection(db, 'users'), limit(1)));
            if (usersSnap.empty && firebaseUser.emailVerified) {
              setUser(await bootstrapUser(firebaseUser, 'admin'));
            } else {
              setUser(null);
            }
          } catch (e) {
            console.error('Failed to inspect users collection:', e);
            setUser(null);
          }
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-neutral-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        {/* Public Buyer Route */}
        <Route path="/" element={<BuyerPage />} />

        {/* Admin/Seller Authentication Route */}
        <Route path="/login" element={user ? <Navigate to={user.role === 'admin' ? '/admin' : '/seller'} /> : <LoginPage />} />

        {/* Admin Protected Route */}
        <Route
          path="/admin/*"
          element={user?.role === 'admin' ? <AdminPage /> : <Navigate to="/login" />}
        />

        {/* Seller Protected Route */}
        <Route
          path="/seller/*"
          element={user?.role === 'seller' || user?.role === 'admin' ? <SellerPage /> : <Navigate to="/login" />}
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}



