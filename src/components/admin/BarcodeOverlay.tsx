import { Printer, Download, X } from 'lucide-react';
import BarcodeGenerator from 'react-barcode';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { useState } from 'react';

interface SingleProps {
  barcode: string;
  onClose: () => void;
}

interface BatchProps {
  barcodes: string[];
  onClose: () => void;
}

function usePdfGenerator() {
  const [isGenerating, setIsGenerating] = useState(false);

  const generate = async (elementId: string, filename: string) => {
    const element = document.getElementById(elementId);
    if (!element) return;
    setIsGenerating(true);
    try {
      const canvas = await html2canvas(element, { scale: 3, useCORS: true, logging: false, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: canvas.width > canvas.height ? 'landscape' : 'portrait', unit: 'px', format: [canvas.width, canvas.height] });
      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
      pdf.save(`${filename}.pdf`);
    } catch (err) {
      console.error('PDF Generation Error:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  return { isGenerating, generate };
}

export function SingleBarcodeOverlay({ barcode, onClose }: SingleProps) {
  const { isGenerating, generate } = usePdfGenerator();

  return (
    <div className="fixed inset-0 bg-neutral-100 z-[100] flex flex-col print:bg-white">
      <div className="p-4 bg-white border-b border-neutral-200 flex justify-between items-center print:hidden">
        <div className="flex items-center gap-3">
          <Printer className="text-neutral-900" size={24} />
          <h2 className="text-lg font-bold">Print Preview</h2>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex gap-3">
            <button
              type="button"
              disabled={isGenerating}
              onClick={() => generate('single-barcode-preview', `barcode-${barcode}`)}
              className="bg-neutral-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-neutral-800 transition-all shadow-xl flex items-center gap-3 cursor-pointer disabled:opacity-50"
            >
              {isGenerating ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Printer size={20} /><Download size={18} className="opacity-50" /></>}
              <span>{isGenerating ? 'Generating...' : 'Generate PDF'}</span>
            </button>
            <button type="button" onClick={onClose} className="bg-white text-neutral-600 border border-neutral-200 px-6 py-3 rounded-xl font-bold hover:bg-neutral-50 transition-all cursor-pointer">
              Cancel
            </button>
          </div>
          <p className="text-[10px] text-neutral-400 font-medium uppercase tracking-widest">Direct PDF download for your records</p>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-8 flex items-center justify-center print:p-0">
        <div id="single-barcode-preview" className="bg-white shadow-2xl p-16 print:shadow-none print:p-0 border-4 border-black text-center flex flex-col items-center">
          <div className="text-4xl font-black mb-4 tracking-tighter">VELLAIPILLAIYAR</div>
          <div className="mb-4"><BarcodeGenerator value={barcode} width={2} height={100} fontSize={20} background="#ffffff" /></div>
          <div className="text-xl font-bold uppercase tracking-widest">Scan for Price</div>
        </div>
      </div>
    </div>
  );
}

export function BatchBarcodeOverlay({ barcodes, onClose }: BatchProps) {
  const { isGenerating, generate } = usePdfGenerator();

  return (
    <div className="fixed inset-0 bg-neutral-100 z-[100] flex flex-col print:bg-white">
      <div className="p-4 bg-white border-b border-neutral-200 flex justify-between items-center print:hidden">
        <div className="flex items-center gap-3">
          <Printer className="text-neutral-900" size={24} />
          <h2 className="text-lg font-bold">Print Preview ({barcodes.length} Barcodes)</h2>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex gap-3">
            <button
              type="button"
              disabled={isGenerating}
              onClick={() => generate('batch-barcode-preview', `barcodes-batch-${barcodes.length}`)}
              className="bg-neutral-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-neutral-800 transition-all shadow-xl flex items-center gap-3 cursor-pointer disabled:opacity-50"
            >
              {isGenerating ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Printer size={20} /><Download size={18} className="opacity-50" /></>}
              <span>{isGenerating ? 'Generating...' : 'Generate PDF'}</span>
            </button>
            <button type="button" onClick={onClose} className="bg-white text-neutral-600 border border-neutral-200 px-6 py-3 rounded-xl font-bold hover:bg-neutral-50 transition-all cursor-pointer">
              Cancel
            </button>
          </div>
          <p className="text-[10px] text-neutral-400 font-medium uppercase tracking-widest">Direct PDF download for your records</p>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-8 print:p-0">
        <div id="batch-barcode-preview" className="max-w-4xl mx-auto bg-white shadow-2xl p-12 print:shadow-none print:p-0">
          <div className="grid grid-cols-2 gap-8">
            {barcodes.map((barcode, i) => (
              <div key={i} className="border-2 border-black p-6 text-center break-inside-avoid mb-4 flex flex-col items-center">
                <div className="text-xl font-black mb-2 tracking-tighter">VELLAIPILLAIYAR</div>
                <div className="mb-2"><BarcodeGenerator value={barcode} width={1.5} height={60} fontSize={14} background="#ffffff" /></div>
                <div className="text-[10px] font-bold uppercase tracking-widest">Scan for Price</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
