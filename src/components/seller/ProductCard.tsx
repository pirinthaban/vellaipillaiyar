import { Product } from '../../types';
import { ShoppingCart } from 'lucide-react';

interface Props {
  product: Product;
  onSelect: (product: Product) => void;
}

export default function ProductCard({ product: p, onSelect }: Props) {
  const primaryImage = p.images?.[0] || p.image || '';

  return (
    <button
      onClick={() => onSelect(p)}
      disabled={p.stock <= 0}
      className={`flex flex-col text-left bg-white p-4 rounded-2xl border border-neutral-200 shadow-sm hover:shadow-md transition-all group ${p.stock <= 0 ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}
    >
      <div className="w-full aspect-square bg-neutral-100 rounded-xl mb-3 flex items-center justify-center overflow-hidden">
        {primaryImage ? (
          <img src={primaryImage} alt={p.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
        ) : (
          <ShoppingCart size={32} className="text-neutral-300" />
        )}
      </div>

      <h3 className="font-bold text-neutral-900 line-clamp-1">{p.name}</h3>

      {p.variations && p.variations.length > 0 && (
        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-tighter mb-1">
          {p.variations.length} Variations Available
        </p>
      )}

      <p className="text-xs text-neutral-500 uppercase tracking-wider mb-2">{p.category}</p>

      <div className="mt-auto flex justify-between items-center">
        <div className="flex flex-col">
          <span className={`text-lg font-bold ${p.discountPrice ? 'text-xs text-neutral-400 line-through' : 'text-neutral-900'}`}>
            Rs. {p.price.toFixed(2)}
          </span>
          {p.discountPrice && (
            <span className="text-lg font-bold text-orange-600">Rs. {p.discountPrice.toFixed(2)}</span>
          )}
        </div>
        <span className={`text-xs font-medium ${p.stock < 10 ? 'text-red-600' : 'text-neutral-400'}`}>
          {p.stock} {p.unit || 'qty'} left
        </span>
      </div>
    </button>
  );
}
