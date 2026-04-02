import { SaleItem } from '../../types';
import { ShoppingCart, X, CheckCircle, AlertCircle } from 'lucide-react';
import CartItem from './CartItem';

interface Props {
  cart: SaleItem[];
  isCartOpen: boolean;
  isCheckingOut: boolean;
  success: boolean;
  checkoutError: string | null;
  onClose: () => void;
  onUpdateQuantity: (id: string, delta: number) => void;
  onSetQuantity: (id: string, quantity: number) => void;
  onSetPrice: (id: string, price: number) => void;
  onSetUnit: (id: string, unit: string) => void;
  onRemove: (id: string) => void;
  onCheckout: () => void;
  onClearError: () => void;
}

export default function CartSidebar({
  cart, isCartOpen, isCheckingOut, success, checkoutError,
  onClose, onUpdateQuantity, onSetQuantity, onSetPrice, onSetUnit, onRemove, onCheckout, onClearError,
}: Props) {
  const total = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const itemCount = cart.reduce((sum, i) => sum + i.quantity, 0);
  const itemCountText = Number.isInteger(itemCount) ? String(itemCount) : itemCount.toFixed(3);

  return (
    <aside className={`
      fixed inset-y-0 right-0 z-50 w-full sm:w-[420px] bg-white border-l border-neutral-200 flex flex-col shadow-2xl transition-transform duration-300 ease-in-out
      lg:relative lg:translate-x-0
      ${isCartOpen ? 'translate-x-0' : 'translate-x-full'}
    `}>
      {/* Header */}
      <div className="p-4 sm:p-6 border-b border-neutral-200 flex justify-between items-center gap-2">
        <h2 className="text-lg sm:text-xl font-bold text-neutral-900 flex items-center gap-2">
          <ShoppingCart size={24} />
          Current Sale
        </h2>
        <div className="flex items-center gap-3">
          <span className="bg-neutral-100 text-neutral-600 px-2 py-1 rounded-lg text-xs font-bold">
            {itemCountText} items
          </span>
          <button onClick={onClose} className="lg:hidden p-2 hover:bg-neutral-100 rounded-full">
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-3 sm:space-y-4">
        {cart.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-neutral-400 space-y-4">
            <ShoppingCart size={48} strokeWidth={1} />
            <p>Your cart is empty</p>
          </div>
        ) : (
          cart.map(item => (
            <CartItem
              key={item.variationId || item.productId}
              item={item}
              onUpdateQuantity={onUpdateQuantity}
              onSetQuantity={onSetQuantity}
              onSetPrice={onSetPrice}
              onSetUnit={onSetUnit}
              onRemove={onRemove}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="p-4 sm:p-6 border-t border-neutral-200 bg-neutral-50 space-y-3 sm:space-y-4">
        {checkoutError && (
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Checkout Failed</p>
              <p className="text-xs mt-1 text-red-600">{checkoutError}</p>
            </div>
            <button onClick={onClearError} className="ml-auto shrink-0 hover:text-red-900"><X size={16} /></button>
          </div>
        )}

        <div className="flex justify-between items-center text-sm text-neutral-600">
          <span>Subtotal</span>
          <span>Rs. {total.toFixed(2)}</span>
        </div>
        <div className="flex justify-between items-center text-lg sm:text-xl font-bold text-neutral-900">
          <span>Total</span>
          <span>Rs. {total.toFixed(2)}</span>
        </div>

        <button
          onClick={onCheckout}
          disabled={cart.length === 0 || isCheckingOut}
          className={`w-full py-3.5 sm:py-4 rounded-xl font-bold text-white transition-all flex items-center justify-center gap-2 shadow-lg ${
            success ? 'bg-green-600' : 'bg-neutral-900 hover:bg-neutral-800'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {isCheckingOut ? (
            <><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" /> Processing...</>
          ) : success ? (
            <><CheckCircle size={20} /> Sale Completed!</>
          ) : (
            'Complete Checkout'
          )}
        </button>
      </div>
    </aside>
  );
}
