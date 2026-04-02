import { useMemo, useState } from 'react';
import { collection, deleteDoc, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { CustomerProfile, Sale } from '../../types';
import { Award, Download, FileClock, Pencil, Phone, Plus, Trash2, User, X } from 'lucide-react';

interface Props {
  customers: CustomerProfile[];
  sales: Sale[];
}

interface BuyerRow {
  phone: string;
  customerDocId?: string;
  vpBlocked: boolean;
  name: string;
  vpEarned: number;
  vpRedeemed: number;
  vpBalance: number;
  totalPurchases: number;
  purchaseCount: number;
  email?: string;
  address?: string;
  existsInCustomers: boolean;
  hasProfileVpTotals: boolean;
}

interface BuyerForm {
  name: string;
  phone: string;
  email: string;
  address: string;
  vpEarned: number;
  vpRedeemed: number;
  vpBalance: number;
}

const EMPTY_FORM: BuyerForm = {
  name: '',
  phone: '',
  email: '',
  address: '',
  vpEarned: 0,
  vpRedeemed: 0,
  vpBalance: 0,
};

/**
 * Normalize phone number to canonical 0XXXXXXXXX format (10 digits, Sri Lankan local)
 */
const normalizePhone = (phone: string): string => {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('94')) return '0' + digits.slice(2);
  if (digits.length === 11 && digits.startsWith('94')) return '0' + digits.slice(2);
  if (digits.length === 11 && digits.startsWith('9')) return '0' + digits.slice(1);
  if (digits.length === 10) return digits;
  return phone.trim();
};

export default function AdminBuyers({ customers, sales }: Props) {
  const [search, setSearch] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editPhone, setEditPhone] = useState<string | null>(null);
  const [form, setForm] = useState<BuyerForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [historyPhone, setHistoryPhone] = useState<string | null>(null);

  const rows: BuyerRow[] = useMemo(() => {
    // Merge verified customer profiles with sales-only buyers so admins can see all mobile numbers.
    const map = new Map<string, BuyerRow>();

    customers.forEach((c) => {
      const profile = c as CustomerProfile & { vpEarned?: number; vpRedeemed?: number };
      const profileEarned = Number(profile.vpEarned || 0);
      const profileRedeemed = Number(profile.vpRedeemed || 0);
      const hasProfileVpTotals = profile.vpEarned !== undefined || profile.vpRedeemed !== undefined;
      const rawPhone = (c.phone || c.id || '').trim();
      const phone = normalizePhone(rawPhone);
      if (!phone) return;
      map.set(phone, {
        phone,
        customerDocId: c.id,
        vpBlocked: Boolean((profile as any).vpBlocked),
        name: c.name || 'Walk-in Customer',
        vpEarned: profileEarned,
        vpRedeemed: profileRedeemed,
        vpBalance: c.vpBalance || (profileEarned - profileRedeemed),
        totalPurchases: c.totalPurchases || 0,
        purchaseCount: c.purchaseCount || 0,
        email: c.email,
        address: c.address,
        existsInCustomers: true,
        hasProfileVpTotals,
      });
    });

    sales.forEach((s) => {
      const rawPhone = s.customer?.phone?.trim();
      const phone = normalizePhone(rawPhone || '');
      if (!phone) return;

      const existing = map.get(phone);
      const earned = s.vp?.earned || 0;
      const redeemed = s.vp?.redeemed || 0;
      const vpDelta = earned - redeemed;

      if (existing) {
        existing.totalPurchases += s.total || 0;
        existing.purchaseCount += 1;
        if (!existing.hasProfileVpTotals) {
          existing.vpEarned += earned;
          existing.vpRedeemed += redeemed;
          existing.vpBalance = existing.vpEarned - existing.vpRedeemed;
        }
        if (existing.name === 'Walk-in Customer' && s.customer?.name) {
          existing.name = s.customer.name;
        }
        return;
      }

      map.set(phone, {
        phone,
        vpBlocked: false,
        name: s.customer?.name || 'Walk-in Customer',
        vpEarned: earned,
        vpRedeemed: redeemed,
        vpBalance: vpDelta,
        totalPurchases: s.total || 0,
        purchaseCount: 1,
        email: s.customer?.email,
        address: s.customer?.address,
        existsInCustomers: false,
        hasProfileVpTotals: false,
      });
    });

    return Array.from(map.values()).sort((a, b) => b.totalPurchases - a.totalPurchases);
  }, [customers, sales]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q) || r.phone.toLowerCase().includes(q) || (r.email || '').toLowerCase().includes(q));
  }, [rows, search]);

  const summary = useMemo(() => {
    const totalEarned = filteredRows.reduce((acc, r) => acc + (r.vpEarned || 0), 0);
    const totalRedeemed = filteredRows.reduce((acc, r) => acc + (r.vpRedeemed || 0), 0);
    const totalBalance = filteredRows.reduce((acc, r) => acc + (r.vpBalance || 0), 0);
    return { totalEarned, totalRedeemed, totalBalance };
  }, [filteredRows]);

  const buyerSales = useMemo(() => {
    if (!historyPhone) return [] as Sale[];
    const normalizedHistoryPhone = normalizePhone(historyPhone);
    return sales
      .filter((s) => normalizePhone(s.customer?.phone || '') === normalizedHistoryPhone)
      .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
  }, [historyPhone, sales]);

  const activeBuyer = useMemo(() => {
    if (!historyPhone) return null;
    return rows.find((r) => r.phone === historyPhone) || null;
  }, [historyPhone, rows]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditPhone(null);
    setIsAdding(false);
    setFormError('');
  };

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditPhone(null);
    setFormError('');
    setIsAdding(true);
  };

  const openEdit = (row: BuyerRow) => {
    setForm({
      name: row.name || '',
      phone: row.phone || '',
      email: row.email || '',
      address: row.address || '',
      vpEarned: row.vpEarned || 0,
      vpRedeemed: row.vpRedeemed || 0,
      vpBalance: row.vpBalance || 0,
    });
    setEditPhone(row.phone);
    setFormError('');
    setIsAdding(true);
  };

  const saveBuyer = async () => {
    const trimmedPhone = form.phone.trim();
    const normalizedPhone = normalizePhone(trimmedPhone);
    if (!normalizedPhone) {
      setFormError('Please enter a valid mobile number.');
      return;
    }

    // Check for duplicate phone number (unique constraint)
    const normalizedEditPhone = editPhone ? normalizePhone(editPhone) : null;
    const phoneAlreadyExists = rows.some((r) => r.phone === normalizedPhone && r.phone !== normalizedEditPhone);
    if (phoneAlreadyExists) {
      setFormError('This mobile number is already assigned to another buyer. Mobile number must be unique.');
      return;
    }

    setFormError('');
    setBusy(true);
    try {
      if (normalizedEditPhone && normalizedEditPhone !== normalizedPhone) {
        // When mobile changes, move the customer document id to the new phone.
        await deleteDoc(doc(db, 'customers', normalizedEditPhone));
      }

      const payload = {
        name: form.name.trim() || 'Walk-in Customer',
        phone: normalizedPhone,
        email: form.email.trim() || '',
        address: form.address.trim() || '',
        vpEarned: Number(form.vpEarned) || 0,
        vpRedeemed: Number(form.vpRedeemed) || 0,
        vpBalance: Number(form.vpBalance) || 0,
        totalPurchases: rows.find((r) => r.phone === (normalizedEditPhone || normalizedPhone))?.totalPurchases || 0,
        purchaseCount: rows.find((r) => r.phone === (normalizedEditPhone || normalizedPhone))?.purchaseCount || 0,
        active: true,
        updatedAt: serverTimestamp(),
      };

      if (normalizedEditPhone) {
        await setDoc(doc(db, 'customers', normalizedPhone), payload, { merge: true });
      } else {
        await setDoc(doc(db, 'customers', normalizedPhone), {
          ...payload,
          createdAt: serverTimestamp(),
        }, { merge: true });
      }
      resetForm();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'customers');
    } finally {
      setBusy(false);
    }
  };

  const removeBuyer = async (row: BuyerRow) => {
    if (!row.existsInCustomers) return;
    const ok = window.confirm(`Remove buyer ${row.name} (${row.phone})?`);
    if (!ok) return;

    setBusy(true);
    try {
      const normalizedPhone = normalizePhone(row.phone);

      // Primary delete by known customer document id when available.
      const candidateIds = Array.from(new Set([row.customerDocId, normalizedPhone, row.phone].filter(Boolean) as string[]));
      await Promise.all(candidateIds.map((id) => deleteDoc(doc(db, 'customers', id))));

      // Fallback cleanup for legacy docs keyed by random ids but matching phone field.
      const phoneQueries = Array.from(new Set([normalizedPhone, row.phone].filter(Boolean) as string[]));
      const snaps = await Promise.all(phoneQueries.map((p) => getDocs(query(collection(db, 'customers'), where('phone', '==', p)))));
      const extraDeletes: Promise<void>[] = [];
      snaps.forEach((snap) => {
        snap.docs.forEach((d) => {
          if (!candidateIds.includes(d.id)) {
            extraDeletes.push(deleteDoc(doc(db, 'customers', d.id)));
          }
        });
      });
      if (extraDeletes.length > 0) {
        await Promise.all(extraDeletes);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'customers');
    } finally {
      setBusy(false);
    }
  };

  const toggleBuyerVpBlock = async (row: BuyerRow) => {
    const normalizedPhone = normalizePhone(row.phone);
    if (!normalizedPhone) return;
    const nextBlocked = !row.vpBlocked;
    setBusy(true);
    try {
      const targetIds = Array.from(new Set([row.customerDocId, normalizedPhone, row.phone].filter(Boolean) as string[]));
      await Promise.all(targetIds.map((id) => setDoc(doc(db, 'customers', id), {
        name: row.name || 'Walk-in Customer',
        phone: normalizedPhone,
        email: row.email || '',
        address: row.address || '',
        vpBalance: row.vpBalance || 0,
        totalPurchases: row.totalPurchases || 0,
        purchaseCount: row.purchaseCount || 0,
        active: true,
        vpBlocked: nextBlocked,
        updatedAt: serverTimestamp(),
      }, { merge: true })));
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'customers');
    } finally {
      setBusy(false);
    }
  };

  const exportDatasheet = () => {
    const header = ['Name', 'Phone', 'Email', 'Address', 'VP Earned', 'VP Redeemed', 'VP Balance', 'Total Purchases', 'Invoices'];
    const lines = filteredRows.map((r) => [
      r.name,
      r.phone,
      r.email || '',
      r.address || '',
      String(r.vpEarned),
      String(r.vpRedeemed),
      String(r.vpBalance),
      r.totalPurchases.toFixed(2),
      String(r.purchaseCount),
    ]);
    const csv = [header, ...lines]
      .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `buyers-datasheet-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-xl sm:text-2xl font-bold text-neutral-900">Buyers & VP Coins</h2>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <button
            onClick={exportDatasheet}
            className="px-3 py-2 rounded-lg border border-neutral-300 text-neutral-700 text-sm font-semibold hover:bg-neutral-100 transition-all flex items-center justify-center gap-2 w-full sm:w-auto"
          >
            <Download size={16} /> Datasheet
          </button>
          <button
            onClick={openCreate}
            className="px-3 py-2 rounded-lg bg-neutral-900 text-white text-sm font-semibold hover:bg-neutral-800 transition-all flex items-center justify-center gap-2 w-full sm:w-auto"
          >
            <Plus size={16} /> Add Buyer
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-neutral-200 p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone, email"
            className="w-full sm:max-w-md p-3 border border-neutral-200 rounded-xl bg-neutral-50"
          />
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-400">{filteredRows.length} buyers</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-green-100 p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-widest text-green-600">Total VP Earned</p>
          <p className="text-3xl font-black text-green-600 mt-2">{summary.totalEarned}</p>
        </div>
        <div className="bg-white rounded-2xl border border-red-100 p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-widest text-red-600">Total VP Redeemed</p>
          <p className="text-3xl font-black text-red-600 mt-2">{summary.totalRedeemed}</p>
        </div>
        <div className="bg-white rounded-2xl border border-orange-100 p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-widest text-orange-600">Net VP Balance</p>
          <p className="text-3xl font-black text-orange-600 mt-2">{summary.totalBalance}</p>
        </div>
      </div>

      {isAdding && (
        <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-neutral-900">{editPhone ? 'Edit Buyer' : 'Add Buyer'}</h3>
            <button onClick={resetForm} className="p-2 rounded-lg hover:bg-neutral-100"><X size={16} /></button>
          </div>
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm font-medium">
              {formError}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Buyer Name" className="p-3 border border-neutral-200 rounded-xl bg-neutral-50" />
            <div>
              <input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} placeholder="Mobile Number" disabled={!!editPhone} className="p-3 border border-neutral-200 rounded-xl bg-neutral-50 disabled:opacity-60 w-full" title={editPhone ? "Mobile number is locked when editing (it is the unique buyer ID)" : ""} />
              {editPhone && <div className="text-xs text-neutral-500 mt-1">Mobile number cannot be changed (unique buyer ID)</div>}
              {!editPhone && <div className="text-xs text-neutral-500 mt-1">Mobile number is the unique buyer ID</div>}
            </div>
            <input value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder="Email" className="p-3 border border-neutral-200 rounded-xl bg-neutral-50" />
            <input value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} placeholder="Address" className="p-3 border border-neutral-200 rounded-xl bg-neutral-50" />
            <input
              type="number"
              min={0}
              value={form.vpEarned}
              onChange={(e) => setForm((p) => ({ ...p, vpEarned: Number(e.target.value) || 0 }))}
              placeholder="VP Earned"
              className="p-3 border border-neutral-200 rounded-xl bg-neutral-50"
            />
            <input
              type="number"
              min={0}
              value={form.vpRedeemed}
              onChange={(e) => setForm((p) => ({ ...p, vpRedeemed: Number(e.target.value) || 0 }))}
              placeholder="VP Redeemed"
              className="p-3 border border-neutral-200 rounded-xl bg-neutral-50"
            />
            <input
              type="number"
              min={0}
              value={form.vpBalance}
              onChange={(e) => setForm((p) => ({ ...p, vpBalance: Number(e.target.value) || 0 }))}
              placeholder="VP Balance"
              className="p-3 border border-neutral-200 rounded-xl bg-neutral-50"
            />
          </div>
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
            <button onClick={resetForm} className="px-4 py-2 rounded-lg border border-neutral-300 text-neutral-700 font-semibold w-full sm:w-auto">Cancel</button>
            <button onClick={saveBuyer} disabled={busy || !form.phone.trim()} className="px-4 py-2 rounded-lg bg-neutral-900 text-white font-semibold disabled:opacity-60 w-full sm:w-auto">
              {busy ? 'Saving...' : 'Save Buyer'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
        <table className="w-full text-left min-w-[980px]">
          <thead className="bg-neutral-50 border-b border-neutral-200">
            <tr>
              <th className="px-6 py-4 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Buyer</th>
              <th className="px-6 py-4 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Mobile Number</th>
              <th className="px-6 py-4 text-xs font-semibold text-neutral-500 uppercase tracking-wider">VP Earned</th>
              <th className="px-6 py-4 text-xs font-semibold text-neutral-500 uppercase tracking-wider">VP Redeemed</th>
              <th className="px-6 py-4 text-xs font-semibold text-neutral-500 uppercase tracking-wider">VP Balance</th>
              <th className="px-6 py-4 text-xs font-semibold text-neutral-500 uppercase tracking-wider">VP Access</th>
              <th className="px-6 py-4 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Total Purchases</th>
              <th className="px-6 py-4 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Invoices</th>
              <th className="px-6 py-4 text-xs font-semibold text-neutral-500 uppercase tracking-wider">History</th>
              <th className="px-6 py-4 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Manage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {filteredRows.map((r) => (
              <tr key={r.phone} className="hover:bg-neutral-50 transition-colors">
                <td className="px-6 py-4 text-sm text-neutral-800 font-semibold">
                  <div className="flex items-center gap-2">
                    <User size={14} className="text-neutral-400" />
                    <div>
                      <p>{r.name}</p>
                      {r.email && <p className="text-xs text-neutral-400 font-normal">{r.email}</p>}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-neutral-700 font-mono">
                  <div className="flex items-center gap-2">
                    <Phone size={14} className="text-neutral-400" />
                    <span>{r.phone}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm font-semibold text-green-600">{r.vpEarned}</td>
                <td className="px-6 py-4 text-sm font-semibold text-red-600">{r.vpRedeemed}</td>
                <td className="px-6 py-4 text-sm font-bold text-orange-600">
                  <div className="flex items-center gap-2">
                    <Award size={14} />
                    <span>{r.vpBalance}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm">
                  <span className={`px-2 py-1 rounded-full text-xs font-bold ${r.vpBlocked ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                    {r.vpBlocked ? 'Blocked' : 'Active'}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-neutral-900 font-bold">Rs. {r.totalPurchases.toFixed(2)}</td>
                <td className="px-6 py-4 text-sm text-neutral-600">{r.purchaseCount}</td>
                <td className="px-6 py-4 text-sm text-neutral-600">
                  <button
                    onClick={() => setHistoryPhone(r.phone)}
                    className="px-2 py-1 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 flex items-center gap-1 text-xs font-semibold"
                  >
                    <FileClock size={12} /> Sales
                  </button>
                </td>
                <td className="px-6 py-4 text-sm text-neutral-600">
                  <div className="flex items-center gap-2">
                    <button onClick={() => openEdit(r)} className="px-2 py-1 rounded-lg border border-neutral-300 hover:bg-neutral-100 flex items-center gap-1 text-xs font-semibold">
                      <Pencil size={12} /> Edit
                    </button>
                    <button
                      onClick={() => toggleBuyerVpBlock(r)}
                      disabled={busy}
                      className={`px-2 py-1 rounded-lg border text-xs font-semibold ${r.vpBlocked ? 'border-green-200 text-green-700 hover:bg-green-50' : 'border-red-200 text-red-700 hover:bg-red-50'} disabled:opacity-50`}
                    >
                      {r.vpBlocked ? 'Unblock VP' : 'Block VP'}
                    </button>
                    <button
                      onClick={() => removeBuyer(r)}
                      disabled={!r.existsInCustomers || busy}
                      className="px-2 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 flex items-center gap-1 text-xs font-semibold disabled:opacity-50"
                    >
                      <Trash2 size={12} /> Remove
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-6 py-12 text-center text-neutral-400 text-sm">
                  No buyers found yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {historyPhone && (
        <div className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-4xl bg-white rounded-2xl border border-neutral-200 shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-neutral-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-neutral-900">Buyer Sales History</h3>
                <p className="text-sm text-neutral-500">{activeBuyer?.name || 'Buyer'} · {historyPhone}</p>
              </div>
              <button onClick={() => setHistoryPhone(null)} className="p-2 rounded-lg hover:bg-neutral-100"><X size={16} /></button>
            </div>

            <div className="max-h-[70vh] overflow-auto">
              <table className="w-full text-left min-w-[860px]">
                <thead className="bg-neutral-50 border-b border-neutral-200 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Items</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Total</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">VP Earned</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">VP Redeemed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {buyerSales.map((s) => (
                    <tr key={s.id} className="hover:bg-neutral-50">
                      <td className="px-4 py-3 text-sm text-neutral-700">
                        {s.timestamp && typeof s.timestamp.toDate === 'function'
                          ? s.timestamp.toDate().toLocaleString()
                          : 'Pending...'}
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-700">
                        {s.items.map((i) => `${i.name} (x${i.quantity})`).join(', ')}
                      </td>
                      <td className="px-4 py-3 text-sm font-bold text-neutral-900">Rs. {s.total.toFixed(2)}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-green-600">{s.vp?.earned || 0}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-red-600">{s.vp?.redeemed || 0}</td>
                    </tr>
                  ))}
                  {buyerSales.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-sm text-neutral-400">No sales found for this buyer.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
