import { CustomerProfile, Sale } from '../../types';

interface Props {
  sales: Sale[];
  customers: CustomerProfile[];
}

export default function AdminSales({ sales, customers }: Props) {
  const sorted = [...sales].sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

  const normalizePhone = (input?: string) => {
    const digits = (input || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('94') && digits.length === 11) return `0${digits.slice(2)}`;
    if (digits.length === 9) return `0${digits}`;
    if (digits.length > 10) return digits.slice(-10);
    return digits;
  };

  const customerNameByPhone = new Map<string, string>();
  customers.forEach((c) => {
    const phone = normalizePhone(c.phone || c.id);
    if (!phone) return;
    if (c.name?.trim()) customerNameByPhone.set(phone, c.name.trim());
  });

  // Fallback from latest sales when profile name is unavailable.
  sorted.forEach((s) => {
    const phone = normalizePhone(s.customer?.phone);
    if (!phone || customerNameByPhone.has(phone)) return;
    const candidate = (s.customer?.name || '').trim();
    if (candidate && candidate.toLowerCase() !== 'walk-in customer') {
      customerNameByPhone.set(phone, candidate);
    }
  });

  return (
    <div className="space-y-6">
      <h2 className="text-xl sm:text-2xl font-bold text-neutral-900">Sales History</h2>

      <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
        <table className="w-full text-left min-w-[920px]">
          <thead className="bg-neutral-50 border-b border-neutral-200">
            <tr>
              <th className="px-6 py-4 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Date</th>
              <th className="px-6 py-4 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Customer</th>
              <th className="px-6 py-4 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Items</th>
              <th className="px-6 py-4 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Total</th>
              <th className="px-6 py-4 text-xs font-semibold text-neutral-500 uppercase tracking-wider">VP Earned</th>
              <th className="px-6 py-4 text-xs font-semibold text-neutral-500 uppercase tracking-wider">VP Redeemed</th>
              <th className="px-6 py-4 text-xs font-semibold text-neutral-500 uppercase tracking-wider">VP Balance</th>
              <th className="px-6 py-4 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Profit</th>
              <th className="px-6 py-4 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Seller ID</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {sorted.map(s => {
              const normalizedPhone = normalizePhone(s.customer?.phone);
              const canonicalName = customerNameByPhone.get(normalizedPhone) || s.customer?.name || 'Walk-in Customer';

              return (
                <tr key={s.id} className="hover:bg-neutral-50 transition-colors">
                  <td className="px-4 sm:px-6 py-4 text-sm text-neutral-600">
                    {s.timestamp && typeof s.timestamp.toDate === 'function'
                      ? s.timestamp.toDate().toLocaleString()
                      : 'Pending...'}
                  </td>
                  <td className="px-4 sm:px-6 py-4 text-sm text-neutral-700">
                    <div className="font-semibold text-neutral-900">{canonicalName}</div>
                    <div className="text-xs text-neutral-500 font-mono">{normalizedPhone || '-'}</div>
                  </td>
                  <td className="px-4 sm:px-6 py-4 text-sm text-neutral-600">
                    {s.items.map(i => `${i.name} (×${i.quantity})`).join(', ')}
                  </td>
                  <td className="px-4 sm:px-6 py-4 text-sm text-neutral-900 font-bold whitespace-nowrap">
                    Rs. {s.total.toFixed(2)}
                  </td>
                  <td className="px-4 sm:px-6 py-4 text-sm text-green-600 font-bold">
                    {s.vp?.earned || 0}
                  </td>
                  <td className="px-4 sm:px-6 py-4 text-sm text-red-600 font-bold">
                    {s.vp?.redeemed || 0}
                  </td>
                  <td className="px-4 sm:px-6 py-4 text-sm text-orange-600 font-bold">
                    {s.vp?.balance || 0}
                  </td>
                  <td className="px-4 sm:px-6 py-4 text-sm text-green-600 font-bold whitespace-nowrap">
                    Rs. {(s.profit || 0).toFixed(2)}
                  </td>
                  <td className="px-4 sm:px-6 py-4 text-xs text-neutral-400 font-mono">
                    {s.sellerId}
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={9} className="px-6 py-12 text-center text-neutral-400 text-sm">
                  No sales recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
