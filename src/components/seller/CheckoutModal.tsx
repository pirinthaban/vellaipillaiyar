import React, { useEffect, useState, useRef } from 'react';
import { X, User, MapPin, Mail, FileText, Download, Phone } from 'lucide-react';
import { CustomerProfile, LoyaltySettings, SaleItem } from '../../types';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

// ── Invoice Settings (mirrors InvoiceBill localStorage) ─────────────────────

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

const DEFAULT_SETTINGS: InvoiceSettings = {
  companyName: 'Vellaipillaiyar',
  logoUrl: '',
  phone: '94774485144',
  email: 'www.pirinthaban@gmail.com',
  address: 'A35, Thevipuram, Mullaitivu.',
  website: 'vellaipillaiyar',
  invoicePrefix: 'INV',
  invoiceNumber: 1001,
  taxRate: 0,
  currency: 'Rs. ',
  footerText: 'Thank you for your business!',
  accentColor: '#171717',
};

const SETTINGS_STORAGE_KEY = 'invoice-settings-v2';

function loadSettings(): InvoiceSettings {
  try {
    const s = localStorage.getItem(SETTINGS_STORAGE_KEY);
    return s ? { ...DEFAULT_SETTINGS, ...JSON.parse(s) } : DEFAULT_SETTINGS;
  } catch { return DEFAULT_SETTINGS; }
}

function saveSettings(s: InvoiceSettings) {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(s));
}

function fmt(n: number, cur: string) { return `${cur}${n.toFixed(2)}`; }
function fmtQty(quantity: number, unit?: string) {
  const isDiscrete = unit === 'qty' || unit === 'pc' || !unit;
  return isDiscrete ? String(Math.round(quantity)) : quantity.toFixed(3);
}

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  cart: SaleItem[];
  total: number;
  loyalty: LoyaltySettings;
  onLookupCustomer: (phone: string) => Promise<CustomerProfile | null>;
  onEnsureCustomerByPhone: (phone: string) => Promise<void>;
  onConfirm: (payload: {
    customer: { name: string; phone: string; email?: string; address?: string };
    vp: { redeemed: number; redeemedAmount: number; earned: number; balance: number };
    payableTotal: number;
  }) => Promise<void>;
  onClose: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CheckoutModal
// ═══════════════════════════════════════════════════════════════════════════════

export default function CheckoutModal({ cart, total, loyalty, onLookupCustomer, onEnsureCustomerByPhone, onConfirm, onClose }: Props) {
  const settings = loadSettings();
  const [clientPhone, setClientPhone] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [isCheckingPhone, setIsCheckingPhone] = useState(false);
  const [isPhoneChecked, setIsPhoneChecked] = useState(false);
  const [lastCheckedPhone, setLastCheckedPhone] = useState('');
  const [customerExists, setCustomerExists] = useState(false);
  const [vpBlocked, setVpBlocked] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [pointBalance, setPointBalance] = useState(0);
  const [redeemPoints, setRedeemPoints] = useState(0);
  const [saving, setSaving] = useState(false);
  const invoiceRef = useRef<HTMLDivElement>(null);

  const invoiceId = `${settings.invoicePrefix}-${settings.invoiceNumber}`;
  const tax = total * (settings.taxRate / 100);
  const maxRedeemPoints = loyalty.redeemEnabled && !vpBlocked ? Math.min(pointBalance, Math.floor(total * loyalty.pointsToRupee)) : 0;
  const clampedRedeemPoints = Math.min(Math.max(0, redeemPoints), maxRedeemPoints);
  const redeemedAmount = clampedRedeemPoints / (loyalty.pointsToRupee || 1);
  const payableSubtotal = Math.max(0, total - redeemedAmount);
  const payableTax = payableSubtotal * (settings.taxRate / 100);
  const grandTotal = payableSubtotal + payableTax;
  const earnedPoints = vpBlocked ? 0 : Math.floor(payableSubtotal * (loyalty.pointsPerRupee || 0));
  const newPointBalance = vpBlocked ? pointBalance : Math.max(0, pointBalance - clampedRedeemPoints + earnedPoints);
  const today = new Date().toLocaleDateString('en-GB');

  const handlePhoneLookup = async () => {
    const phone = clientPhone.trim();
    if (!phone) {
      setLookupError('Enter mobile number first.');
      setIsPhoneChecked(false);
      return;
    }

    setIsCheckingPhone(true);
    setLookupError('');
    setIsPhoneChecked(false);
    try {
      const customer = await onLookupCustomer(phone);
      if (customer) {
        setCustomerExists(true);
        setClientName(customer.name || 'Walk-in Customer');
        setClientAddress(customer.address || '');
        setClientEmail(customer.email || '');
        setVpBlocked(Boolean(customer.vpBlocked));
        setPointBalance(customer.vpBalance || 0);
      } else {
        setCustomerExists(false);
        setVpBlocked(false);
        if (!clientName.trim()) setClientName('Walk-in Customer');
        setPointBalance(0);
      }
      setRedeemPoints(0);
      setIsPhoneChecked(true);
      setLastCheckedPhone(phone);
    } catch (err: any) {
      setLookupError(err?.message || 'Unable to check mobile number.');
    } finally {
      setIsCheckingPhone(false);
    }
  };

  useEffect(() => {
    const phone = clientPhone.trim();
    if (phone.length !== 10) return;
    if (phone === lastCheckedPhone) return;
    if (isCheckingPhone) return;

    const t = setTimeout(() => {
      handlePhoneLookup();
    }, 350);

    return () => clearTimeout(t);
  }, [clientPhone, lastCheckedPhone, isCheckingPhone]);

  const handleConfirm = async () => {
    if (!clientPhone.trim()) {
      setLookupError('Mobile number is required.');
      return;
    }
    if (!isPhoneChecked) {
      setLookupError('Please check mobile number first.');
      return;
    }

    setSaving(true);
    try {
      if (!customerExists) {
        await onEnsureCustomerByPhone(clientPhone.trim());
      }

      await onConfirm({
        customer: {
          name: clientName.trim() || 'Walk-in Customer',
          phone: clientPhone.trim(),
          email: clientEmail.trim() || '',
          address: clientAddress.trim() || '',
        },
        vp: {
          redeemed: clampedRedeemPoints,
          redeemedAmount,
          earned: earnedPoints,
          balance: newPointBalance,
        },
        payableTotal: grandTotal,
      });

      if (invoiceRef.current) {
        const canvas = await html2canvas(invoiceRef.current, {
          scale: 3, useCORS: true, logging: false, backgroundColor: '#ffffff'
        });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: 'a4' });
        const w = pdf.internal.pageSize.getWidth();
        const h = (canvas.height * w) / canvas.width;
        pdf.addImage(imgData, 'PNG', 0, 0, w, h);
        pdf.save(`${invoiceId}.pdf`);

        saveSettings({ ...settings, invoiceNumber: settings.invoiceNumber + 1 });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl my-4">

        {/* Modal Header */}
        <div className="flex justify-between items-center p-6 border-b border-neutral-100">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl" style={{ backgroundColor: settings.accentColor + '15' }}>
              <FileText size={22} style={{ color: settings.accentColor }} />
            </div>
            <div>
              <h2 className="font-bold text-neutral-900 text-lg">Complete Sale</h2>
              <p className="text-xs text-neutral-500">Enter client details to generate invoice</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-full transition-all"><X size={20} /></button>
        </div>

        {/* Client Details Form */}
        <div className="p-6 border-b border-neutral-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-neutral-50">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-1"><Phone size={11} /> Mobile Number</label>
            <div className="flex gap-2">
              <input
                placeholder="0771234567"
                className="p-3 border border-neutral-200 rounded-xl bg-white text-sm focus:bg-white transition-all focus:ring-2 focus:ring-neutral-900 flex-1"
                value={clientPhone}
                onChange={e => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                  setClientPhone(digits);
                  setIsPhoneChecked(false);
                  setCustomerExists(false);
                  setLookupError('');
                }}
              />
              <button
                onClick={handlePhoneLookup}
                disabled={isCheckingPhone}
                className="px-3 rounded-xl bg-neutral-900 text-white text-xs font-bold disabled:opacity-60"
              >
                {isCheckingPhone ? '...' : 'Check'}
              </button>
            </div>
            {lookupError && <span className="text-[11px] text-red-600 font-medium">{lookupError}</span>}
            {isPhoneChecked && !lookupError && (
              <span className={`text-[11px] font-medium ${customerExists ? 'text-green-600' : 'text-amber-600'}`}>
                {customerExists ? 'Customer found' : 'No account. Will create customer on confirm.'}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-1"><User size={11} /> Client Name</label>
            <input 
              placeholder="John Doe / Company" 
              className="p-3 border border-neutral-200 rounded-xl bg-white text-sm focus:bg-white transition-all focus:ring-2 focus:ring-neutral-900 disabled:opacity-60 disabled:bg-neutral-100"
              value={clientName} 
              onChange={e => setClientName(e.target.value)}
              disabled={isPhoneChecked && customerExists}
              title={isPhoneChecked && customerExists ? "Name is locked to customer profile" : ""}
            />
            {isPhoneChecked && customerExists && <span className="text-[11px] text-neutral-500">Name from customer profile (read-only)</span>}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-1"><MapPin size={11} /> Address</label>
            <input 
              placeholder="Client address" 
              className="p-3 border border-neutral-200 rounded-xl text-sm transition-all focus:ring-2 focus:ring-neutral-900 disabled:opacity-100 disabled:bg-neutral-100 disabled:text-neutral-600 disabled:cursor-not-allowed bg-white"
              value={clientAddress} 
              onChange={e => setClientAddress(e.target.value)} 
              disabled={isPhoneChecked && customerExists}
              type="text"
              title={isPhoneChecked && customerExists ? "Address is locked for existing customer" : ""}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-1"><Mail size={11} /> Email</label>
            <input 
              type="email" 
              placeholder="client@email.com" 
              className="p-3 border border-neutral-200 rounded-xl text-sm transition-all focus:ring-2 focus:ring-neutral-900 disabled:opacity-100 disabled:bg-neutral-100 disabled:text-neutral-600 disabled:cursor-not-allowed bg-white"
              value={clientEmail} 
              onChange={e => setClientEmail(e.target.value)} 
              disabled={isPhoneChecked && customerExists}
              title={isPhoneChecked && customerExists ? "Email is locked for existing customer" : ""}
            />
          </div>
          <div className="flex flex-col gap-1 lg:col-span-1 bg-orange-50 rounded-xl p-3 border border-orange-200">
            <label className="text-xs font-bold text-orange-600 uppercase tracking-widest">VP Coins Balance</label>
            <div className="text-2xl font-black text-orange-600">{pointBalance}</div>
            {isPhoneChecked && customerExists && vpBlocked && (
              <div className="text-xs text-red-600 font-semibold">VP is blocked for this buyer by admin.</div>
            )}
            <div className="text-xs text-orange-500">{loyalty.pointsToRupee} Points = LKR 1</div>
            <div className="mt-2">
              <input
                type="number"
                min={0}
                max={maxRedeemPoints}
                value={clampedRedeemPoints}
                onChange={e => setRedeemPoints(Number(e.target.value) || 0)}
                disabled={!loyalty.redeemEnabled || !isPhoneChecked || vpBlocked}
                placeholder="Redeem points"
                className="w-full p-2 border border-orange-200 rounded-lg bg-white text-xs"
              />
            </div>
          </div>
        </div>

        {/* Hidden Invoice Template (rendered for PDF capture) */}
        <div className="overflow-hidden" style={{ height: 0, overflow: 'hidden', position: 'absolute', left: '-9999px' }}>
          <div ref={invoiceRef} style={{ width: '794px', fontFamily: 'Arial, sans-serif', backgroundColor: '#ffffff' }}>
            {/* Header */}
            <div style={{ backgroundColor: settings.accentColor, padding: '40px 48px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                  {settings.logoUrl && (
                    <img src={settings.logoUrl} style={{ width: '64px', height: '64px', objectFit: 'contain', backgroundColor: '#fff', borderRadius: '12px', padding: '4px' }} />
                  )}
                  <div>
                    <div style={{ fontSize: '28px', fontWeight: '900', color: '#fff', letterSpacing: '-1px' }}>{settings.companyName}</div>
                    <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginTop: '4px' }}>{settings.website}</div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px' }}>Invoice</div>
                  <div style={{ fontSize: '26px', fontWeight: '900', color: '#fff', marginTop: '4px' }}>#{invoiceId}</div>
                </div>
              </div>
            </div>

            {/* Meta */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '32px', padding: '32px 48px', borderBottom: '1px solid #f0f0f0' }}>
              <div>
                <div style={{ fontSize: '10px', fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '10px' }}>From</div>
                <div style={{ fontWeight: 700, color: '#111', fontSize: '14px' }}>{settings.companyName}</div>
                <div style={{ color: '#6b7280', fontSize: '12px', marginTop: '6px', lineHeight: '1.6' }}>{settings.address}</div>
                <div style={{ color: '#6b7280', fontSize: '12px' }}>{settings.phone}</div>
                <div style={{ color: '#6b7280', fontSize: '12px' }}>{settings.email}</div>
              </div>
              <div>
                <div style={{ fontSize: '10px', fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '10px' }}>Bill To</div>
                <div style={{ fontWeight: 700, color: '#111', fontSize: '14px' }}>{clientName || 'Walk-in Customer'}</div>
                {clientPhone && <div style={{ color: '#6b7280', fontSize: '12px', marginTop: '6px' }}>{clientPhone}</div>}
                {clientAddress && <div style={{ color: '#6b7280', fontSize: '12px', marginTop: '6px' }}>{clientAddress}</div>}
                {clientEmail && <div style={{ color: '#6b7280', fontSize: '12px' }}>{clientEmail}</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '10px', fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '10px' }}>Details</div>
                <div style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 600 }}>Date</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#111', marginBottom: '8px' }}>{today}</div>
                <div style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 600 }}>Invoice No.</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#111' }}>{invoiceId}</div>
              </div>
            </div>

            {/* Items */}
            <div style={{ padding: '32px 48px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: settings.accentColor + '15' }}>
                    <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: '10px', fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '1.5px' }}>#</th>
                    <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: '10px', fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Description</th>
                    <th style={{ textAlign: 'right', padding: '10px 12px', fontSize: '10px', fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Qty</th>
                    <th style={{ textAlign: 'right', padding: '10px 12px', fontSize: '10px', fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Unit Price</th>
                    <th style={{ textAlign: 'right', padding: '10px 12px', fontSize: '10px', fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((item, idx) => (
                    <tr key={item.variationId || item.productId} style={{ borderBottom: '1px solid #f5f5f5' }}>
                      <td style={{ padding: '12px', color: '#9ca3af', fontFamily: 'monospace', fontSize: '11px' }}>{String(idx + 1).padStart(2, '0')}</td>
                      <td style={{ padding: '12px', fontWeight: 500, color: '#111' }}>{item.name}</td>
                      <td style={{ padding: '12px', textAlign: 'right', color: '#6b7280' }}>{fmtQty(item.quantity, item.unit)} {item.unit || 'qty'}</td>
                      <td style={{ padding: '12px', textAlign: 'right', color: '#6b7280' }}>{fmt(item.price, settings.currency)}</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: '#111' }}>{fmt(item.price * item.quantity, settings.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '32px' }}>
                <div style={{ width: '280px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: '13px', color: '#6b7280' }}>
                    <span>Subtotal</span><span>{fmt(total, settings.currency)}</span>
                  </div>
                  {clampedRedeemPoints > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: '13px', color: '#ea580c' }}>
                      <span>VP Redeem ({clampedRedeemPoints} pts)</span><span>- {fmt(redeemedAmount, settings.currency)}</span>
                    </div>
                  )}
                  {settings.taxRate > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: '13px', color: '#6b7280' }}>
                      <span>Tax ({settings.taxRate}%)</span><span>{fmt(payableTax, settings.currency)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0', borderTop: '2px solid #111', marginTop: '8px' }}>
                    <span style={{ fontWeight: 900, fontSize: '16px', color: '#111' }}>Total</span>
                    <span style={{ fontWeight: 900, fontSize: '22px', color: settings.accentColor }}>{fmt(grandTotal, settings.currency)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '24px 48px 40px', borderTop: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <div style={{ fontSize: '10px', fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '8px' }}>Note</div>
                <div style={{ fontSize: '12px', color: '#6b7280', maxWidth: '380px', lineHeight: '1.6' }}>{settings.footerText}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '10px', fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Authorized Signature</div>
                <div style={{ borderBottom: '2px solid #e5e7eb', width: '160px', marginTop: '40px' }}></div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '6px' }}>{settings.companyName}</div>
              </div>
            </div>
            <div style={{ backgroundColor: '#f9fafb', padding: '14px 48px', textAlign: 'center', fontSize: '10px', color: '#d1d5db', letterSpacing: '1px' }}>
              {invoiceId} · {settings.companyName} · {settings.email} · {settings.phone}
            </div>
          </div>
        </div>

        {/* Cart Summary in Modal */}
        <div className="px-6 py-4 bg-neutral-50 max-h-40 overflow-y-auto">
          <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">Order Summary</p>
          <div className="space-y-1">
            {cart.map(item => (
              <div key={item.variationId || item.productId} className="flex justify-between text-sm">
                <span className="text-neutral-700">{item.name} <span className="text-neutral-400">×{fmtQty(item.quantity, item.unit)}</span></span>
                <span className="font-bold text-neutral-900">{settings.currency}{(item.price * item.quantity).toFixed(2)}</span>
              </div>
            ))}
            {clampedRedeemPoints > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-orange-600">VP Redeem ({clampedRedeemPoints} pts)</span>
                <span className="font-bold text-orange-600">- {settings.currency}{redeemedAmount.toFixed(2)}</span>
              </div>
            )}
          </div>
          <div className="flex justify-between pt-3 mt-3 border-t border-neutral-200 font-bold text-neutral-900">
            <span>Grand Total</span>
            <span style={{ color: settings.accentColor }}>{settings.currency}{grandTotal.toFixed(2)}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-6 flex flex-col sm:flex-row gap-3">
          <button onClick={onClose} className="flex-1 py-3 bg-neutral-100 text-neutral-600 font-bold rounded-xl hover:bg-neutral-200 transition-all text-sm">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="flex-1 py-4 text-white font-bold rounded-xl shadow-lg transition-all text-sm flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ backgroundColor: settings.accentColor }}
          >
            {saving
              ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Processing...</>
              : <><Download size={18} /> Confirm Checkout & Download Invoice</>}
          </button>
        </div>
      </div>
    </div>
  );
}
