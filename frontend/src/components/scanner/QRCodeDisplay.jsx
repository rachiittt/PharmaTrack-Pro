import { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Printer, Copy, QrCode, Check } from 'lucide-react';
import { Button } from '../ui/Button';

/**
 * QR Code Display — generates and shows a QR code from any data.
 * Supports download (PNG), print, and copy-to-clipboard.
 *
 * Props:
 *  - isOpen: boolean
 *  - onClose: () => void
 *  - data: string | object — the content to encode in the QR code
 *  - title?: string — modal title
 *  - subtitle?: string — description text
 *  - filename?: string — download filename prefix
 */
export function QRCodeDisplay({ isOpen, onClose, data, title = 'QR Code', subtitle, filename = 'qrcode' }) {
  const canvasRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState(null);

  const qrContent = typeof data === 'object' ? JSON.stringify(data) : String(data || '');

  useEffect(() => {
    if (!isOpen || !qrContent) return;

    // Generate QR code to canvas
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, qrContent, {
        width: 280,
        margin: 2,
        color: { dark: '#0F172A', light: '#FFFFFF' },
        errorCorrectionLevel: 'M',
      });
    }

    // Also generate data URL for download
    QRCode.toDataURL(qrContent, {
      width: 600,
      margin: 2,
      color: { dark: '#0F172A', light: '#FFFFFF' },
      errorCorrectionLevel: 'M',
    }).then(url => setQrDataUrl(url)).catch(console.error);
  }, [isOpen, qrContent]);

  const handleDownload = () => {
    if (!qrDataUrl) return;
    const link = document.createElement('a');
    link.download = `${filename}_qr.png`;
    link.href = qrDataUrl;
    link.click();
  };

  const handlePrint = () => {
    if (!qrDataUrl) return;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html><head><title>Print QR Code</title>
      <style>
        body { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; font-family: system-ui, sans-serif; }
        img { max-width: 300px; }
        h2 { font-size: 16px; color: #333; margin-bottom: 4px; }
        p { font-size: 12px; color: #666; margin-top: 0; }
      </style></head><body>
        <h2>${title}</h2>
        ${subtitle ? `<p>${subtitle}</p>` : ''}
        <img src="${qrDataUrl}" />
        <script>setTimeout(() => { window.print(); window.close(); }, 300);</script>
      </body></html>
    `);
    printWindow.document.close();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(qrContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = qrContent;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/40"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-sm card flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#E2E8F0] dark:border-surface-700">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#0EA5E9]/10 flex items-center justify-center text-[#0EA5E9]">
                <QrCode size={18} />
              </div>
              <div>
                <h3 className="text-base font-bold font-heading text-[#0F172A] dark:text-white">{title}</h3>
                {subtitle && <p className="text-xs text-surface-500 mt-0.5">{subtitle}</p>}
              </div>
            </div>
            <button onClick={onClose} className="p-2 text-surface-400 hover:text-surface-900 dark:hover:text-white hover:bg-surface-100 dark:hover:bg-surface-700 rounded-lg transition-colors">
              <X size={18} />
            </button>
          </div>

          {/* QR Code */}
          <div className="p-6 flex flex-col items-center">
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-[#E2E8F0]">
              <canvas ref={canvasRef} />
            </div>

            {/* Data Preview */}
            <div className="mt-4 w-full bg-[#F8FAFC] dark:bg-surface-900 rounded-lg p-3 border border-[#E2E8F0] dark:border-surface-700">
              <p className="text-xs text-surface-400 font-bold uppercase tracking-wider mb-1">Encoded Data</p>
              <p className="text-xs text-surface-600 dark:text-surface-300 font-mono break-all line-clamp-3">{qrContent}</p>
            </div>
          </div>

          {/* Actions */}
          <div className="px-5 pb-5 grid grid-cols-3 gap-2">
            <Button variant="outline" size="sm" onClick={handleDownload} className="flex-col gap-1 py-3 h-auto">
              <Download size={18} />
              <span className="text-[11px]">Download</span>
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint} className="flex-col gap-1 py-3 h-auto">
              <Printer size={18} />
              <span className="text-[11px]">Print</span>
            </Button>
            <Button variant="outline" size="sm" onClick={handleCopy} className="flex-col gap-1 py-3 h-auto">
              {copied ? <Check size={18} className="text-[#22C55E]" /> : <Copy size={18} />}
              <span className="text-[11px]">{copied ? 'Copied!' : 'Copy'}</span>
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

/**
 * Inline QR Code — renders a small QR code inline (no modal).
 * Use for embedding in receipts, tables, etc.
 */
export function InlineQRCode({ data, size = 80, className = '' }) {
  const canvasRef = useRef(null);
  const qrContent = typeof data === 'object' ? JSON.stringify(data) : String(data || '');

  useEffect(() => {
    if (canvasRef.current && qrContent) {
      QRCode.toCanvas(canvasRef.current, qrContent, {
        width: size,
        margin: 1,
        color: { dark: '#0F172A', light: '#FFFFFF' },
        errorCorrectionLevel: 'L',
      });
    }
  }, [qrContent, size]);

  return <canvas ref={canvasRef} className={className} />;
}
