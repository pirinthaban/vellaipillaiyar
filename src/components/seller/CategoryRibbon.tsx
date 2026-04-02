interface Props {
  categories: string[];
  selected: string;
  onSelect: (cat: string) => void;
}

export default function CategoryRibbon({ categories, selected, onSelect }: Props) {
  return (
    <div
      className="mb-6 overflow-x-auto pb-4 flex gap-3"
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      {categories.map(cat => (
        <button
          key={cat}
          onClick={() => onSelect(cat)}
          className={`flex-shrink-0 px-6 py-3 rounded-2xl font-bold text-sm tracking-widest uppercase transition-all border ${
            selected === cat
              ? 'bg-neutral-900 text-white border-neutral-900 shadow-xl scale-105'
              : 'bg-white text-neutral-400 border-neutral-200 hover:text-neutral-900 hover:border-neutral-300 hover:bg-neutral-50'
          }`}
        >
          {cat === 'All' ? 'All Items' : cat}
        </button>
      ))}
    </div>
  );
}
