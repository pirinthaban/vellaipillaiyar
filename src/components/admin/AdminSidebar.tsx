import React, { useEffect } from 'react';
import { LayoutDashboard, Package, Users, History, LogOut, X, Menu, FileText, Contact, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { auth } from '../../firebase';
import { signOut } from 'firebase/auth';

type Tab = 'dashboard' | 'products' | 'sellers' | 'buyers' | 'sales' | 'invoice';

interface Props {
  activeTab: Tab;
  isSidebarOpen: boolean;
  isSidebarCollapsed: boolean;
  onTabChange: (tab: Tab) => void;
  onToggleSidebar: (open: boolean) => void;
  onToggleSidebarCollapsed: (open: boolean) => void;
}

export default function AdminSidebar({ activeTab, isSidebarOpen, isSidebarCollapsed, onTabChange, onToggleSidebar, onToggleSidebarCollapsed }: Props) {
  useEffect(() => {
    onToggleSidebar(false);
  }, [activeTab, onToggleSidebar]);

  const navItems: { tab: Tab; icon: React.ReactNode; label: string }[] = [
    { tab: 'dashboard', icon: <LayoutDashboard size={20} />, label: 'Dashboard' },
    { tab: 'products', icon: <Package size={20} />, label: 'Products' },
    { tab: 'sellers', icon: <Users size={20} />, label: 'Sellers' },
    { tab: 'buyers', icon: <Contact size={20} />, label: 'Buyers & VP' },
    { tab: 'sales', icon: <History size={20} />, label: 'Sales History' },
    { tab: 'invoice', icon: <FileText size={20} />, label: 'Invoice Designer' },
  ];

  return (
    <>
      {/* Mobile Header */}
      <div className="lg:hidden fixed inset-x-0 top-0 z-50 flex items-center justify-between border-b border-neutral-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur-sm sm:px-6 sm:py-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-neutral-400">Vellaipillaiyar</p>
          <h1 className="text-base font-bold text-neutral-900 sm:text-lg">Admin Panel</h1>
        </div>
        <button
          onClick={() => onToggleSidebar(!isSidebarOpen)}
          className="rounded-xl border border-neutral-200 bg-white p-2.5 shadow-sm transition-all hover:bg-neutral-50"
          aria-label={isSidebarOpen ? 'Close admin menu' : 'Open admin menu'}
        >
          {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar */}
      <aside className={`
        fixed left-0 bottom-0 top-[64px] z-40 flex w-[88%] max-w-[320px] flex-col border-r border-neutral-200 bg-white shadow-2xl transition-all duration-300 ease-in-out sm:top-[72px] sm:w-[360px] lg:top-0 lg:translate-x-0 lg:shadow-none
        lg:relative lg:bottom-auto lg:max-w-none ${isSidebarCollapsed ? 'lg:w-20' : 'lg:w-64'}
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="hidden items-start justify-between gap-3 border-b border-neutral-200 p-5 sm:p-6 lg:flex">
          <div className={isSidebarCollapsed ? 'lg:sr-only' : ''}>
            <h1 className="text-xl font-bold text-neutral-900">Admin Panel</h1>
            <p className="mt-1 text-xs uppercase tracking-widest text-neutral-500">Vellaipillaiyar</p>
          </div>
          <button
            type="button"
            onClick={() => onToggleSidebarCollapsed(!isSidebarCollapsed)}
            className="rounded-xl border border-neutral-200 p-2 text-neutral-600 transition-all hover:bg-neutral-100 hover:text-neutral-900"
            aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isSidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        <div className="border-b border-neutral-200 px-5 py-5 lg:hidden">
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-neutral-400">Navigation</p>
          <p className="mt-1 text-sm text-neutral-500">Switch between admin sections</p>
        </div>

        <nav className="flex-1 space-y-2 overflow-y-auto px-3 py-4 sm:px-4 sm:py-5 lg:max-h-none">
          {navItems.map(({ tab, icon, label }) => (
            <button
              key={tab}
              onClick={() => { onTabChange(tab); onToggleSidebar(false); }}
                className={`w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition-all ${
                  isSidebarCollapsed ? 'lg:justify-center' : 'lg:justify-start'
                } ${
                activeTab === tab
                  ? 'bg-neutral-900 text-white shadow-lg shadow-neutral-900/20'
                  : 'text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              {icon}
              <span className={isSidebarCollapsed ? 'lg:hidden' : ''}>{label}</span>
            </button>
          ))}
        </nav>

        <div className="border-t border-neutral-200 bg-white p-4 sm:p-5">
          <button
            onClick={() => signOut(auth)}
            className={`w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-red-600 transition-all hover:bg-red-50 ${
              isSidebarCollapsed ? 'lg:justify-center' : 'lg:justify-start'
            }`}
          >
            <LogOut size={20} />
            <span className={isSidebarCollapsed ? 'lg:hidden' : ''}>Logout</span>
          </button>
        </div>
      </aside>

      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 backdrop-blur-[2px] lg:hidden"
          onClick={() => onToggleSidebar(false)}
        />
      )}
    </>
  );
}
