import { Sale, LoginAlert } from '../../types';
import { format, isSameDay, isSameMonth } from 'date-fns';
import { ArrowRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

interface Props {
  sales: Sale[];
  loginAlerts: LoginAlert[];
  onNavigate: (tab: 'products' | 'sellers' | 'buyers' | 'sales') => void;
}

export default function AdminDashboard({ sales, loginAlerts, onNavigate }: Props) {
  const dailyData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const daySales = sales.filter(s => s.timestamp && typeof s.timestamp.toDate === 'function' && isSameDay(s.timestamp.toDate(), d));
    return { name: format(d, 'EEE'), sales: daySales.reduce((acc, s) => acc + s.total, 0), count: daySales.length };
  }).reverse();

  const monthlyData = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const monthSales = sales.filter(s => s.timestamp && typeof s.timestamp.toDate === 'function' && isSameMonth(s.timestamp.toDate(), d));
    return { name: format(d, 'MMM'), sales: monthSales.reduce((acc, s) => acc + s.total, 0), count: monthSales.length };
  }).reverse();

  const totalRevenue = sales.reduce((acc, s) => acc + s.total, 0);
  const totalProfit = sales.reduce((acc, s) => acc + (s.profit || 0), 0);
  const totalSales = sales.length;

  const statCards = [
    { label: 'Total Revenue', value: `Rs. ${totalRevenue.toFixed(2)}` },
    { label: 'Total Profit', value: `Rs. ${totalProfit.toFixed(2)}` },
    { label: 'Total Invoices', value: totalSales.toString() },
    { label: 'Avg. Sale', value: `Rs. ${(totalRevenue / (totalSales || 1)).toFixed(2)}` },
  ];

  return (
    <div className="space-y-8">
      {loginAlerts.length > 0 && (
        <div className="bg-neutral-900 text-white rounded-2xl p-5 shadow-xl border border-neutral-800">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1">Admin Alert</p>
              <h4 className="text-lg font-bold">New login detected</h4>
            </div>
            <div className="text-xs text-white/50 uppercase tracking-widest">
              Showing latest {Math.min(3, loginAlerts.length)} UID alert{loginAlerts.length > 1 ? 's' : ''}
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {loginAlerts.slice(0, 3).map((alert) => (
              <div key={alert.id} className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <p className="text-sm font-bold">{alert.name}</p>
                  <p className="text-xs text-white/60">{alert.email} · {alert.role}</p>
                </div>
                <div className="text-xs text-orange-300 font-mono break-all">UID: {alert.uid}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {statCards.map(({ label, value }) => (
          <div key={label} className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm flex flex-col justify-between">
            <div>
              <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-1">{label}</p>
              <h3 className="text-3xl font-bold text-neutral-900">{value}</h3>
            </div>
            <button
              onClick={() => onNavigate('sales')}
              className="mt-4 text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-neutral-900 flex items-center gap-1 transition-all"
            >
              View History <ArrowRight size={12} />
            </button>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-2xl border border-neutral-200 shadow-sm min-w-0">
          <h4 className="text-lg font-bold text-neutral-900 mb-6">Daily Sales Performance</h4>
          <div className="h-80 min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={320} minHeight={300} debounce={100}>
              <BarChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} cursor={{ fill: '#f5f5f5' }} />
                <Bar dataKey="sales" fill="#171717" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-8 rounded-2xl border border-neutral-200 shadow-sm min-w-0">
          <h4 className="text-lg font-bold text-neutral-900 mb-6">Monthly Revenue Growth</h4>
          <div className="h-80 min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={320} minHeight={300} debounce={100}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                <Line type="monotone" dataKey="sales" stroke="#171717" strokeWidth={3} dot={{ r: 6, fill: '#171717' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
