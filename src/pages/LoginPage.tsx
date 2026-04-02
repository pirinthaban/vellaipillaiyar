import { useState } from 'react';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, limit, query } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { LogIn } from 'lucide-react';

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const adminEmail = import.meta.env.VITE_ADMIN_EMAIL || '';
  const sellerEmail = import.meta.env.VITE_SELLER_EMAIL || '';

  const bootstrapUser = async (user: typeof auth.currentUser, role: 'admin' | 'seller') => {
    if (!user) return;
    const { setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'users', user.uid), {
      name: user.displayName || (role === 'admin' ? 'Admin' : 'Seller'),
      email: user.email,
      role,
    });
  };

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Check if user is in the authorized users collection
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (!userDoc.exists()) {
        // Bootstrap the first admin if it's the owner email
        if (adminEmail && user.email === adminEmail && user.emailVerified) {
          await bootstrapUser(user, 'admin');
        } else if (sellerEmail && user.email === sellerEmail && user.emailVerified) {
          await bootstrapUser(user, 'seller');
        } else {
          const usersSnap = await getDocs(query(collection(db, 'users'), limit(1)));
          if (usersSnap.empty && user.emailVerified) {
            await bootstrapUser(user, 'admin');
          } else {
            await auth.signOut();
            setError('Unauthorized access. Please contact the administrator.');
          }
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-100 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-neutral-900">Vellaipillaiyar</h1>
          <p className="mt-2 text-neutral-600">Admin & Seller Portal</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg text-sm border border-red-100">
            {error}
          </div>
        )}

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 bg-neutral-900 text-white py-3 px-4 rounded-xl font-semibold hover:bg-neutral-800 transition-colors disabled:opacity-50"
        >
          {loading ? (
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
          ) : (
            <>
              <LogIn size={20} />
              Sign in with Google
            </>
          )}
        </button>

        <div className="text-center text-xs text-neutral-400">
          Authorized personnel only. Access is monitored.
        </div>
      </div>
    </div>
  );
}
