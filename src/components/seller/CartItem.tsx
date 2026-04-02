import { SaleItem } from '../../types';
import { Plus, Minus, Trash2 } from 'lucide-react';

interface Props {
  item: SaleItem;
  onUpdateQuantity: (id: string, delta: number) => void;
  onSetQuantity: (id: string, quantity: number) => void;
  onSetPrice: (id: string, price: number) => void;
  onSetUnit: (id: string, unit: string) => void;
  onRemove: (id: string) => void;
}

export default function CartItem({ item, onUpdateQuantity, onSetQuantity, onSetPrice, onSetUnit, onRemove }: Props) {
  const itemId = item.variationId || item.productId;
  const unit = item.unit || 'qty';
  const isDiscreteUnit = unit === 'qty' || unit === 'pc';
  const quantityStep = isDiscreteUnit ? 1 : 0.001;
  const quantityDisplay = isDiscreteUnit ? String(Math.round(item.quantity)) : item.quantity.toFixed(3);

  return (
    <div className="rounded-xl border border-neutral-200 p-3 sm:p-4 bg-white space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <h4 className="font-bold text-neutral-900 text-sm truncate">{item.name}</h4>
          <p className="text-xs text-neutral-500">
            {quantityDisplay} {unit} x Rs. {item.price.toFixed(2)}
          </p>
        </div>
        <button onClick={() => onRemove(itemId)} className="text-red-400 hover:text-red-600 transition-colors p-1">
          <Trash2 size={18} />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <select
          value={unit}
          onChange={(e) => onSetUnit(itemId, e.target.value)}
          className="p-2.5 border border-neutral-200 rounded-lg text-xs bg-white"
        >
          {['qty', 'pc', 'kg', 'lb', 'ft', 'm', 'yd'].map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
        <input
          type="number"
          min={isDiscreteUnit ? 1 : 0}
          step={quantityStep}
          value={item.quantity}
          onChange={(e) => onSetQuantity(itemId, Number(e.target.value) || 0)}
          className="p-2.5 border border-neutral-200 rounded-lg text-xs bg-white"
        />
        <input
          type="number"
          min={0}
          step={0.01}
          value={item.price}
          onChange={(e) => onSetPrice(itemId, Number(e.target.value) || 0)}
          className="p-2.5 border border-neutral-200 rounded-lg text-xs bg-white"
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 bg-neutral-100 p-1 rounded-lg">
          <button onClick={() => onUpdateQuantity(itemId, -1)} className="p-2 hover:bg-white rounded-md transition-all">
            <Minus size={14} />
          </button>
          <span className="text-sm font-bold min-w-[72px] text-center">{quantityDisplay}</span>
          <button onClick={() => onUpdateQuantity(itemId, 1)} className="p-2 hover:bg-white rounded-md transition-all">
            <Plus size={14} />
          </button>
        </div>

        <span className="text-sm sm:text-base font-bold text-neutral-900 whitespace-nowrap">
          Rs. {(item.price * item.quantity).toFixed(2)}
        </span>
      </div>
    </div>
  );
}
