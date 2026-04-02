import React, { useState, useRef, useEffect } from 'react';
import { Download, Printer, Upload, Plus, Trash2, RefreshCw, Eye, Settings } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

// ── Types ──────────────────────────────────────────────────────────────────

interface InvoiceSettings {
  companyName: string;
  logoUrl: string;
  phone: string;
  email: string;
  address: string;
  website: string;
  invoicePrefix: string;
  invoiceNumber: number;
  taxRate: number;
  currency: string;
  footerText: string;
  accentColor: string;
}

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  price: number;
}

interface InvoiceMeta {
  clientName: string;
  clientAddress: string;
  clientEmail: string;
  date: string;
  dueDate: string;
}

const DEFAULT_SETTINGS: InvoiceSettings = {
  companyName: 'Vellaipillaiyar',
  logoUrl: '',
  phone: '94774485144',
  email: 'www.pirinthaban@gmail.com',
  address: 'A35, Thevipuram, Mullaitivu.',
  website: 'vellaipillaiyar',
  invoicePrefix: 'INV',
  invoiceNumber: 1001,
  taxRate: 10,
  currency: 'Rs. ',
  footerText: 'Thank you for your business! Payment is due within 30 days.',
  accentColor: '#171717',
};

const SETTINGS_STORAGE_KEY = 'invoice-settings-v2';

const EMPTY_ITEM = (): LineItem => ({
  id: Date.now().toString(),
  description: '',
  quantity: 1,
  price: 0,
});

// ── Helper ─────────────────────────────────────────────────────────────────

function fmt(n: number, currency: string) {
  return `${currency}${n.toFixed(2)}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// InvoiceBill Component
// ══════════════════════════════════════════════════════════════════════════════

export default function InvoiceBill() {
  const [settings, setSettings] = useState<InvoiceSettings>(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch { return DEFAULT_SETTINGS; }
  });

  const [meta, setMeta] = useState<InvoiceMeta>({
    clientName: '',
    clientAddress: '',
    clientEmail: '',
    date: new Date().toISOString().split('T')[0],
    dueDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
  });

  const [items, setItems] = useState<LineItem[]>([EMPTY_ITEM()]);
  const [activePanel, setActivePanel] = useState<'settings' | 'invoice'>('invoice');
  const [isGenerating, setIsGenerating] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  // Persist settings
  useEffect(() => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const set = (k: keyof InvoiceSettings, v: any) => setSettings(prev => ({ ...prev, [k]: v }));
  const setM = (k: keyof InvoiceMeta, v: string) => setMeta(prev => ({ ...prev, [k]: v }));

  const addItem = () => setItems(prev => [...prev, EMPTY_ITEM()]);
  const removeItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id));
  const updateItem = (id: string, field: keyof LineItem, value: any) =>
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));

  const subtotal = items.reduce((s, i) => s + i.quantity * i.price, 0);
  const tax = subtotal * (settings.taxRate / 100);
  const total = subtotal + tax;

  const invoiceId = `${settings.invoicePrefix}-${settings.invoiceNumber}`;

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => set('logoUrl', ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleGeneratePDF = async () => {
    if (!previewRef.current) return;
    setIsGenerating(true);
    try {
      const canvas = await html2canvas(previewRef.current, {
        scale: 3, useCORS: true, logging: false, backgroundColor: '#ffffff'
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: 'a4' });
      const w = pdf.internal.pageSize.getWidth();
      const h = (canvas.height * w) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, w, h);
      pdf.save(`${invoiceId}.pdf`);
      // Increment invoice number after successful generation
      set('invoiceNumber', settings.invoiceNumber + 1);
    } catch (err) {
      console.error('PDF generation failed:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full gap-6">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-neutral-900">Invoice Designer</h2>
          <p className="text-sm text-neutral-500 mt-0.5">Design your template, fill client details, generate PDF</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <button
            onClick={() => setActivePanel(activePanel === 'settings' ? 'invoice' : 'settings')}
            className={`flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-bold text-sm border transition-all w-full sm:w-auto ${activePanel === 'settings' ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50'}`}
          >
            {activePanel === 'settings' ? <><Eye size={18} /> Preview</> : <><Settings size={18} /> Settings</>}
          </button>
          <button
            onClick={handleGeneratePDF}
            disabled={isGenerating}
            className="flex items-center justify-center gap-2 px-6 py-2 bg-neutral-900 text-white rounded-xl font-bold text-sm hover:bg-neutral-800 transition-all shadow-lg disabled:opacity-60 w-full sm:w-auto"
          >
            {isGenerating
              ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Generating...</>
              : <><Download size={18} /> Generate PDF</>}
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">

        {/* ── Left Panel: Settings or Client/Items ─────────────────────── */}
        <div className="w-full lg:w-80 shrink-0 space-y-4 overflow-y-auto">

          {activePanel === 'settings' ? (
            /* Company Settings */
            <div className="bg-white rounded-2xl border border-neutral-200 p-6 space-y-5">
              <h3 className="font-bold text-neutral-900 border-b pb-3">Company Settings</h3>

              {/* Logo Upload */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Logo</label>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 bg-neutral-100 rounded-xl flex items-center justify-center overflow-hidden border-2 border-dashed border-neutral-200">
                    {settings.logoUrl ? <img src={settings.logoUrl} className="w-full h-full object-contain" /> : <Upload size={20} className="text-neutral-300" />}
                  </div>
                  <label className="cursor-pointer px-3 py-2 bg-neutral-100 rounded-lg text-xs font-bold hover:bg-neutral-200 transition-all">
                    Upload Logo
                    <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                  </label>
                  {settings.logoUrl && <button onClick={() => set('logoUrl', '')} className="text-red-400 hover:text-red-600"><Trash2 size={16} /></button>}
                </div>
              </div>

              {[
                { label: 'Company Name', key: 'companyName' as const, type: 'text', placeholder: 'Vellaipillaiyar' },
                { label: 'Phone', key: 'phone' as const, type: 'text', placeholder: '94774485144' },
                { label: 'Email', key: 'email' as const, type: 'email', placeholder: 'www.pirinthaban@gmail.com' },
                { label: 'Address', key: 'address' as const, type: 'text', placeholder: 'A35, Thevipuram, Mullaitivu.' },
                { label: 'Website', key: 'website' as const, type: 'text', placeholder: 'vellaipillaiyar' },
              ].map(({ label, key, type, placeholder }) => (
                <div key={key} className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">{label}</label>
                  <input type={type} placeholder={placeholder} className="p-3 border border-neutral-200 rounded-xl bg-neutral-50 text-sm focus:bg-white transition-all"
                    value={settings[key] as string} onChange={e => set(key, e.target.value)} />
                </div>
              ))}

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Prefix</label>
                  <input type="text" placeholder="INV" className="p-3 border border-neutral-200 rounded-xl bg-neutral-50 text-sm focus:bg-white transition-all"
                    value={settings.invoicePrefix} onChange={e => set('invoicePrefix', e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Next No.</label>
                  <input type="number" className="p-3 border border-neutral-200 rounded-xl bg-neutral-50 text-sm focus:bg-white transition-all"
                    value={settings.invoiceNumber} onChange={e => set('invoiceNumber', parseInt(e.target.value) || 1)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Tax %</label>
                  <input type="number" min="0" max="100" className="p-3 border border-neutral-200 rounded-xl bg-neutral-50 text-sm focus:bg-white transition-all"
                    value={settings.taxRate} onChange={e => set('taxRate', parseFloat(e.target.value) || 0)} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Currency</label>
                  <select className="p-3 border border-neutral-200 rounded-xl bg-neutral-50 text-sm focus:bg-white transition-all"
                    value={settings.currency} onChange={e => set('currency', e.target.value)}>
                    <option value="Rs. ">Rs. LKR (Sri Lanka)</option>
                    <option value="$">$ USD</option>
                    <option value="€">€ EUR</option>
                    <option value="£">£ GBP</option>
                    <option value="₹">₹ INR</option>
                    <option value="¥">¥ JPY</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Accent Color</label>
                <div className="flex gap-3 items-center">
                  <input type="color" className="w-12 h-10 rounded-lg border border-neutral-200 cursor-pointer"
                    value={settings.accentColor} onChange={e => set('accentColor', e.target.value)} />
                  <span className="text-sm text-neutral-500 font-mono">{settings.accentColor}</span>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Footer / Ending Text</label>
                <textarea className="p-3 border border-neutral-200 rounded-xl bg-neutral-50 text-sm focus:bg-white transition-all h-24 resize-none"
                  value={settings.footerText} onChange={e => set('footerText', e.target.value)} />
              </div>

              <button onClick={() => setSettings(DEFAULT_SETTINGS)} className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold text-neutral-400 hover:text-neutral-700 hover:bg-neutral-50 rounded-lg transition-all">
                <RefreshCw size={14} /> Reset to defaults
              </button>
            </div>
          ) : (
            /* Client & Items */
            <>
              <div className="bg-white rounded-2xl border border-neutral-200 p-6 space-y-4">
                <h3 className="font-bold text-neutral-900 border-b pb-3">Client Details</h3>
                {[
                  { label: 'Client Name', key: 'clientName' as const, placeholder: 'John Doe / Company Ltd' },
                  { label: 'Client Address', key: 'clientAddress' as const, placeholder: '456 Client Street' },
                  { label: 'Client Email', key: 'clientEmail' as const, placeholder: 'client@email.com' },
                ].map(({ label, key, placeholder }) => (
                  <div key={key} className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">{label}</label>
                    <input placeholder={placeholder} className="p-3 border border-neutral-200 rounded-xl bg-neutral-50 text-sm focus:bg-white transition-all"
                      value={meta[key]} onChange={e => setM(key, e.target.value)} />
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Date</label>
                    <input type="date" className="p-3 border border-neutral-200 rounded-xl bg-neutral-50 text-sm focus:bg-white transition-all"
                      value={meta.date} onChange={e => setM('date', e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Due Date</label>
                    <input type="date" className="p-3 border border-neutral-200 rounded-xl bg-neutral-50 text-sm focus:bg-white transition-all"
                      value={meta.dueDate} onChange={e => setM('dueDate', e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-neutral-200 p-6 space-y-4">
                <div className="flex justify-between items-center border-b pb-3">
                  <h3 className="font-bold text-neutral-900">Line Items</h3>
                  <button onClick={addItem} className="flex items-center gap-1 text-xs font-bold text-neutral-900 hover:underline">
                    <Plus size={14} /> Add Item
                  </button>
                </div>
                {items.map((item, idx) => (
                  <div key={item.id} className="space-y-2 pb-4 border-b border-neutral-100 last:border-0 last:pb-0">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-neutral-400 uppercase">Item {idx + 1}</span>
                      {items.length > 1 && <button onClick={() => removeItem(item.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>}
                    </div>
                    <input placeholder="Description" className="w-full p-2 text-sm border border-neutral-200 rounded-lg bg-neutral-50"
                      value={item.description} onChange={e => updateItem(item.id, 'description', e.target.value)} />
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-neutral-400 uppercase">Qty</label>
                        <input type="number" min="1" className="p-2 text-sm border border-neutral-200 rounded-lg bg-neutral-50"
                          value={item.quantity} onChange={e => updateItem(item.id, 'quantity', parseInt(e.target.value) || 1)} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-neutral-400 uppercase">Unit Price</label>
                        <input type="number" min="0" step="0.01" className="p-2 text-sm border border-neutral-200 rounded-lg bg-neutral-50"
                          value={item.price} onChange={e => updateItem(item.id, 'price', parseFloat(e.target.value) || 0)} />
                      </div>
                    </div>
                    <div className="text-right text-sm font-bold text-neutral-700">
                      = {fmt(item.quantity * item.price, settings.currency)}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── Right: Live Invoice Preview ──────────────────────────────── */}
        <div className="flex-1 overflow-auto">
          <div className="min-w-[320px] sm:min-w-[520px] lg:min-w-[600px]">
            <div
              ref={previewRef}
              className="bg-white shadow-2xl rounded-2xl overflow-hidden"
              style={{ fontFamily: 'Arial, sans-serif' }}
            >
              {/* Invoice Header */}
              <div className="px-12 py-10" style={{ backgroundColor: settings.accentColor }}>
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-5">
                    {settings.logoUrl && (
                      <div className="w-16 h-16 bg-white rounded-xl flex items-center justify-center overflow-hidden">
                        <img src={settings.logoUrl} className="w-full h-full object-contain" />
                      </div>
                    )}
                    <div>
                      <h1 className="text-3xl font-black text-white tracking-tight">{settings.companyName}</h1>
                      <p className="text-white/70 text-sm mt-1">{settings.website}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-white/60 text-xs font-bold uppercase tracking-widest mb-1">Invoice</div>
                    <div className="text-white text-3xl font-black">#{invoiceId}</div>
                  </div>
                </div>
              </div>

              {/* Meta Block */}
              <div className="px-12 py-8 grid grid-cols-3 gap-8 border-b border-neutral-100">
                {/* From */}
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-3">From</p>
                  <p className="font-bold text-neutral-900">{settings.companyName}</p>
                  <p className="text-sm text-neutral-500 mt-1 leading-relaxed">{settings.address}</p>
                  <p className="text-sm text-neutral-500">{settings.phone}</p>
                  <p className="text-sm text-neutral-500">{settings.email}</p>
                </div>
                {/* To */}
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-3">Bill To</p>
                  <p className="font-bold text-neutral-900">{meta.clientName || 'Client Name'}</p>
                  <p className="text-sm text-neutral-500 mt-1 leading-relaxed">{meta.clientAddress || 'Client Address'}</p>
                  <p className="text-sm text-neutral-500">{meta.clientEmail || 'client@email.com'}</p>
                </div>
                {/* Dates */}
                <div className="text-right">
                  <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-3">Details</p>
                  <div className="space-y-1">
                    <div>
                      <p className="text-[10px] font-bold uppercase text-neutral-400">Date</p>
                      <p className="text-sm font-bold text-neutral-900">{meta.date}</p>
                    </div>
                    <div className="mt-2">
                      <p className="text-[10px] font-bold uppercase text-neutral-400">Due Date</p>
                      <p className="text-sm font-bold text-neutral-900">{meta.dueDate}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <div className="px-12 py-8">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ backgroundColor: settings.accentColor + '12' }}>
                      <th className="text-left py-3 px-4 text-[10px] font-black uppercase tracking-widest text-neutral-500 rounded-l-lg">#</th>
                      <th className="text-left py-3 px-4 text-[10px] font-black uppercase tracking-widest text-neutral-500">Description</th>
                      <th className="text-right py-3 px-4 text-[10px] font-black uppercase tracking-widest text-neutral-500">Qty</th>
                      <th className="text-right py-3 px-4 text-[10px] font-black uppercase tracking-widest text-neutral-500">Unit Price</th>
                      <th className="text-right py-3 px-4 text-[10px] font-black uppercase tracking-widest text-neutral-500 rounded-r-lg">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={item.id} className="border-b border-neutral-50">
                        <td className="py-4 px-4 text-neutral-400 font-mono text-xs">{String(idx + 1).padStart(2, '0')}</td>
                        <td className="py-4 px-4 text-neutral-900 font-medium">{item.description || <span className="text-neutral-300 italic">Item description</span>}</td>
                        <td className="py-4 px-4 text-right text-neutral-600">{item.quantity}</td>
                        <td className="py-4 px-4 text-right text-neutral-600">{fmt(item.price, settings.currency)}</td>
                        <td className="py-4 px-4 text-right font-bold text-neutral-900">{fmt(item.quantity * item.price, settings.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Totals */}
                <div className="flex justify-end mt-8">
                  <div className="w-72 space-y-3">
                    <div className="flex justify-between text-sm text-neutral-500">
                      <span>Subtotal</span>
                      <span>{fmt(subtotal, settings.currency)}</span>
                    </div>
                    {settings.taxRate > 0 && (
                      <div className="flex justify-between text-sm text-neutral-500">
                        <span>Tax ({settings.taxRate}%)</span>
                        <span>{fmt(tax, settings.currency)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center pt-3 border-t-2 border-neutral-900">
                      <span className="font-black text-neutral-900 text-lg">Total</span>
                      <span className="font-black text-2xl" style={{ color: settings.accentColor }}>{fmt(total, settings.currency)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-12 py-8 mt-4 border-t border-neutral-100">
                <div className="flex justify-between items-center">
                  <div className="max-w-md">
                    <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-2">Note</p>
                    <p className="text-sm text-neutral-500 leading-relaxed">{settings.footerText}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-2">Authorized Signature</div>
                    <div className="w-40 border-b-2 border-neutral-300 mt-8" />
                    <div className="text-xs text-neutral-400 mt-1">{settings.companyName}</div>
                  </div>
                </div>
                <div className="mt-8 pt-6 border-t border-neutral-100 flex justify-center">
                  <p className="text-[10px] text-neutral-300 font-mono tracking-widest">
                    {invoiceId} · {settings.companyName} · {settings.email} · {settings.phone}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
