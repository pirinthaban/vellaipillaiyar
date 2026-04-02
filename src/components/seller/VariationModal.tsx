import { Product } from '../../types';
import { X } from 'lucide-react';

interface Props {
  product: Product;
  onAddVariation: (product: Product, variation: any) => void;
  onClose: () => void;
}

export default function VariationModal({ product, onAddVariation, onClose }: Props) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white p-8 rounded-2xl max-w-md w-full shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-neutral-900">Select Variation</h3>
          <button onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-full transition-all">
            <X size={20} />
          </button>
        </div>
        <p className="text-sm text-neutral-500 mb-6 font-medium uppercase tracking-widest">{product.name}</p>
        <div className="space-y-3">
          {product.variations?.map(v => (
            <button
              key={v.id}
              onClick={() => onAddVariation(product, v)}
              disabled={v.stock <= 0}
              className={`w-full flex justify-between items-center p-4 rounded-xl border border-neutral-200 hover:border-neutral-900 hover:bg-neutral-50 transition-all group ${v.stock <= 0 ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}
            >
              <div className="text-left">
                <div className="font-bold text-neutral-900 group-hover:text-black">{v.name}</div>
                <div className="text-xs text-neutral-400">{v.stock} {v.unit || product.unit || 'qty'} in stock</div>
              </div>
              <div className="text-right">
                {v.discountPrice ? (
                  <>
                    <div className="text-xs text-neutral-400 line-through">Rs. {v.price.toFixed(2)}</div>
                    <div className="font-bold text-orange-600">Rs. {v.discountPrice.toFixed(2)}</div>
                  </>
                ) : (
                  <div className="font-bold text-neutral-900">Rs. {v.price.toFixed(2)}</div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
