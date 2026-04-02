import React, { useState } from 'react';
import { collection, setDoc, doc, deleteDoc } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../../firebase';
import { UserProfile } from '../../types';
import { Plus, X } from 'lucide-react';

interface Props {
  sellers: UserProfile[];
}

export default function AdminSellers({ sellers }: Props) {
  const [isAdding, setIsAdding] = useState(false);
  const [newUser, setNewUser] = useState<Partial<UserProfile>>({ name: '', email: '', role: 'seller', uid: '' });
  const [error, setError] = useState<string | null>(null);

  const handleAddSeller = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.uid) { setError('Please provide the Firebase UID for the user.'); return; }
    try {
      await setDoc(doc(db, 'users', newUser.uid), {
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
      });
      setIsAdding(false);
      setNewUser({ name: '', email: '', role: 'seller', uid: '' });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'users');
    }
  };

  const handleRemoveAccess = async (seller: UserProfile) => {
    if (!seller.uid) return;
    if (seller.uid === auth.currentUser?.uid) {
      setError('You cannot remove your own admin access.');
      return;
    }
    const ok = window.confirm(`Remove access for ${seller.name} (${seller.email})?`);
    if (!ok) return;

    try {
      await deleteDoc(doc(db, 'users', seller.uid));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${seller.uid}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
        <h2 className="text-xl sm:text-2xl font-bold text-neutral-900">Manage Staff</h2>
        <button
          onClick={() => setIsAdding(true)}
          className="bg-neutral-900 text-white px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 hover:bg-neutral-800 transition-all w-full sm:w-auto"
        >
          <Plus size={20} /> Add Seller
        </button>
      </div>

      {isAdding && (
        <div className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm">
          <form onSubmit={handleAddSeller} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input placeholder="Full Name" className="p-3 border rounded-xl bg-neutral-50" required value={newUser.name} onChange={e => setNewUser({ ...newUser, name: e.target.value })} />
            <input type="email" placeholder="Email" className="p-3 border rounded-xl bg-neutral-50" required value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} />
            <input placeholder="Firebase UID" className="p-3 border rounded-xl bg-neutral-50" required value={newUser.uid} onChange={e => setNewUser({ ...newUser, uid: e.target.value })} />
            <select className="p-3 border rounded-xl bg-neutral-50" value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value as 'admin' | 'seller' })}>
              <option value="seller">Seller</option>
              <option value="admin">Admin</option>
            </select>
            {error && <p className="col-span-2 text-sm text-red-600 font-medium">{error}</p>}
            <div className="col-span-2 flex gap-3 justify-end">
              <button type="button" onClick={() => setIsAdding(false)} className="px-5 py-2 text-neutral-600 hover:bg-neutral-100 rounded-xl transition-all">Cancel</button>
              <button type="submit" className="px-6 py-2 bg-neutral-900 text-white rounded-xl font-bold hover:bg-neutral-800 transition-all">Authorize User</button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sellers.map(s => (
          <div key={s.uid} className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-neutral-100 rounded-full flex items-center justify-center text-neutral-500 font-bold text-xl">
                {s.name.charAt(0)}
              </div>
              <div>
                <h3 className="font-bold text-neutral-900">{s.name}</h3>
                <p className="text-sm text-neutral-500">{s.email}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 justify-between items-center">
              <span className={`px-2 py-1 rounded-full text-xs font-bold ${s.role === 'admin' ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'}`}>
                {s.role.toUpperCase()}
              </span>
              <button onClick={() => handleRemoveAccess(s)} className="text-red-600 text-sm hover:underline font-semibold">Remove Access</button>
            </div>
          </div>
        ))}
        {sellers.length === 0 && (
          <p className="col-span-3 text-center text-sm text-neutral-400 py-12">No staff registered yet.</p>
        )}
      </div>

      {error && (
        <div className="fixed bottom-8 right-8 bg-red-600 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-4 z-50">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="p-1 hover:bg-white/20 rounded-full"><X size={16} /></button>
        </div>
      )}
    </div>
  );
}
