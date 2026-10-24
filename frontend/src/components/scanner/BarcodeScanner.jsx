import { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, X, Keyboard, ScanLine, RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';

/**
 * Real camera-based barcode/QR scanner.
 * Uses @zxing/library to decode EAN-13, Code-128, QR, DataMatrix, etc.
 * Falls back to manual text input on devices without a camera.
 *
 * Props:
 *  - isOpen: boolean
 *  - onClose: () => void
 *  - onScan: (code: string) => void
 *  - title?: string
 */
export function BarcodeScanner({ isOpen, onClose, onScan, title = 'Scan Barcode / QR Code' }) {
  const videoRef = useRef(null);
  const readerRef = useRef(null);
  const [mode, setMode] = useState('camera'); // 'camera' | 'manual'
  const [manualCode, setManualCode] = useState('');
  const [error, setError] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState([]);
  const [activeDeviceIdx, setActiveDeviceIdx] = useState(0);
  const [lastScanned, setLastScanned] = useState(null);

  // Initialize the reader
  useEffect(() => {
    if (!isOpen) return;
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;

    // List available video devices
    reader.listVideoInputDevices()
      .then((videoInputDevices) => {
        if (videoInputDevices.length === 0) {
          setMode('manual');
          setError('No camera found. Enter barcode manually.');
        } else {
          setDevices(videoInputDevices);
          setMode('camera');
          setError(null);
        }
      })
      .catch(() => {
        setMode('manual');
        setError('Camera access denied. Enter barcode manually.');
      });

    return () => {
      reader.reset();
      readerRef.current = null;
    };
  }, [isOpen]);

  // Start scanning when in camera mode
  useEffect(() => {
    if (!isOpen || mode !== 'camera' || devices.length === 0) return;
    const reader = readerRef.current;
    if (!reader || !videoRef.current) return;

    setScanning(true);
    setError(null);

    const deviceId = devices[activeDeviceIdx]?.deviceId;

    reader.decodeFromVideoDevice(deviceId, videoRef.current, (result, err) => {
      if (result) {
        const code = result.getText();
        if (code !== lastScanned) {
          setLastScanned(code);
          // Vibrate on supported devices
          if (navigator.vibrate) navigator.vibrate(100);
          onScan(code);
        }
      }
      if (err && !(err instanceof NotFoundException)) {
        // Ignore NotFoundException (no barcode in frame yet)
        console.warn('Scanner error:', err);
      }
    })
    .catch((e) => {
      setError('Could not start camera: ' + e.message);
      setMode('manual');
    });

    return () => {
      reader.reset();
      setScanning(false);
    };
  }, [isOpen, mode, devices, activeDeviceIdx]);

  const switchCamera = useCallback(() => {
    if (devices.length > 1) {
      readerRef.current?.reset();
      setActiveDeviceIdx((prev) => (prev + 1) % devices.length);
    }
  }, [devices]);

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (manualCode.trim()) {
      onScan(manualCode.trim());
      setManualCode('');
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="card w-full max-w-md bg-white dark:bg-surface-800 overflow-hidden relative"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#E2E8F0] dark:border-surface-700">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#0EA5E9]/10 flex items-center justify-center text-[#0EA5E9]">
                <ScanLine size={18} />
              </div>
              <h3 className="text-lg font-bold font-heading text-[#0F172A] dark:text-white">{title}</h3>
            </div>
            <button onClick={onClose} className="p-2 text-surface-400 hover:text-surface-900 dark:hover:text-white hover:bg-surface-100 dark:hover:bg-surface-700 rounded-lg transition-colors">
              <X size={18} />
            </button>
          </div>

          {/* Mode Tabs */}
          <div className="flex gap-1 bg-[#F1F5F9] dark:bg-surface-900 p-1 mx-5 mt-4 rounded-lg">
            <button
              onClick={() => { if (devices.length > 0) setMode('camera'); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-md transition-all ${mode === 'camera' ? 'bg-white dark:bg-surface-700 shadow-sm text-[#0EA5E9]' : 'text-surface-500 hover:text-surface-700'}`}
              disabled={devices.length === 0}
            >
              <Camera size={16} /> Camera
            </button>
            <button
              onClick={() => setMode('manual')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-md transition-all ${mode === 'manual' ? 'bg-white dark:bg-surface-700 shadow-sm text-[#0EA5E9]' : 'text-surface-500 hover:text-surface-700'}`}
            >
              <Keyboard size={16} /> Manual
            </button>
          </div>

          {/* Camera Mode */}
          {mode === 'camera' && (
            <div className="p-5">
              <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3]">
                <video ref={videoRef} className="w-full h-full object-cover" />

                {/* Scanner overlay */}
                <div className="absolute inset-0 pointer-events-none">
                  {/* Scan region box */}
                  <div className="absolute inset-[15%]">
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-[3px] border-l-[3px] border-[#0EA5E9] rounded-tl-lg" />
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-[3px] border-r-[3px] border-[#0EA5E9] rounded-tr-lg" />
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-[3px] border-l-[3px] border-[#0EA5E9] rounded-bl-lg" />
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-[3px] border-r-[3px] border-[#0EA5E9] rounded-br-lg" />

                    {/* Scanning laser line */}
                    <motion.div
                      animate={{ y: ['0%', '100%', '0%'] }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                      className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-[#0EA5E9] to-transparent shadow-[0_0_8px_2px_rgba(14,165,233,0.4)]"
                    />
                  </div>
                </div>

                {/* Camera switch button */}
                {devices.length > 1 && (
                  <button
                    onClick={switchCamera}
                    className="absolute top-3 right-3 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full backdrop-blur-sm transition-colors"
                  >
                    <RefreshCw size={18} />
                  </button>
                )}

                {/* Scanning indicator */}
                {scanning && (
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-sm text-white text-xs font-bold px-4 py-1.5 rounded-full flex items-center gap-2">
                    <div className="w-2 h-2 bg-[#22C55E] rounded-full animate-pulse" />
                    Scanning...
                  </div>
                )}
              </div>
              <p className="text-center text-sm text-surface-500 mt-3 font-medium">
                Point camera at barcode or QR code
              </p>
            </div>
          )}

          {/* Manual Mode */}
          {mode === 'manual' && (
            <form onSubmit={handleManualSubmit} className="p-5 space-y-4">
              <div>
                <label className="form-label">Enter Barcode / Product Code</label>
                <input
                  type="text"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder="e.g. 8901234567890"
                  className="input-field font-mono text-lg text-center tracking-widest"
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full" disabled={!manualCode.trim()}>
                <ScanLine size={16} className="mr-2" /> Look Up
              </Button>
            </form>
          )}

          {/* Error Message */}
          {error && (
            <div className="mx-5 mb-4 p-3 bg-[#FEF2F2] dark:bg-red-900/20 border border-[#FECACA] dark:border-red-800 rounded-lg text-sm text-[#DC2626] font-medium">
              {error}
            </div>
          )}

          {/* Last scanned feedback */}
          {lastScanned && (
            <div className="mx-5 mb-4 p-3 bg-[#F0FDF4] dark:bg-green-900/20 border border-[#BBF7D0] dark:border-green-800 rounded-lg text-sm text-[#16A34A] font-bold flex items-center gap-2">
              <div className="w-2 h-2 bg-[#22C55E] rounded-full" />
              Last scanned: <span className="font-mono">{lastScanned}</span>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
