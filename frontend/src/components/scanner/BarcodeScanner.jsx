import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Keyboard, RefreshCw, ScanLine } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { BareInput } from '../ui/Field';
import { InlineAlert } from '../ui/States';
import { SCAN_FORMATS, normalizeScannedCode } from '../../lib/barcode';

/**
 * Camera + manual barcode entry.
 *
 * Fixes over the previous implementation:
 *  - asks for the camera with facingMode first (device lists are empty before
 *    permission on Safari/Firefox), then enumerates for the switch button;
 *  - plays inline + muted so iOS Safari renders the stream;
 *  - uses the native BarcodeDetector when present, ZXing (lazy-loaded) otherwise;
 *  - accepts a code only after two identical consecutive reads and a valid
 *    check digit, then stops the camera — one scan, one callback;
 *  - explains secure-context / permission failures and falls back to typing.
 *
 * onDetected(code) is called with a normalised code. Whether it exists in the
 * catalogue is the caller's job — this component never invents a result.
 */
export function BarcodeScanner({ open, onClose, onDetected, title = 'Scan barcode' }) {
  const [mode, setMode] = useState('camera');
  const [status, setStatus] = useState('idle'); // idle | starting | scanning | error
  const [message, setMessage] = useState(null);
  const [manual, setManual] = useState('');
  const [manualError, setManualError] = useState(null);
  const [cameras, setCameras] = useState([]);
  const [cameraIndex, setCameraIndex] = useState(-1); // -1 = rear camera via facingMode
  const video = useRef(null);
  const stopRef = useRef(() => {});

  const finish = useCallback((code) => {
    stopRef.current();
    navigator.vibrate?.(60);
    onDetected(code);
  }, [onDetected]);

  useEffect(() => {
    if (!open || mode !== 'camera') return undefined;
    let cancelled = false;
    let stream = null;
    let reader = null;
    let frame = 0;
    let last = null;

    const stop = () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      try { reader?.reset(); } catch { /* already stopped */ }
      stream?.getTracks().forEach((t) => t.stop());
      if (video.current) video.current.srcObject = null;
    };
    stopRef.current = stop;

    const candidate = (raw) => {
      const code = normalizeScannedCode(raw);
      if (!code) { setMessage('Code not readable — hold the pack steady and closer.'); last = null; return; }
      if (code === last) finish(code);
      else last = code;
    };

    (async () => {
      setStatus('starting');
      setMessage(null);
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setStatus('error');
        setMessage('The camera only works over HTTPS or on localhost. Use a USB scanner or type the code.');
        setMode('manual');
        return;
      }
      try {
        const constraints = cameraIndex >= 0 && cameras[cameraIndex]
          ? { deviceId: { exact: cameras[cameraIndex].deviceId } }
          : { facingMode: { ideal: 'environment' } };
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false, video: { ...constraints, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        const el = video.current;
        el.srcObject = stream;
        el.muted = true;
        el.setAttribute('playsinline', 'true');
        await el.play();

        if (!cameras.length) {
          const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
          if (!cancelled) setCameras(devices);
        }

        if ('BarcodeDetector' in window) {
          const supported = await window.BarcodeDetector.getSupportedFormats();
          const detector = new window.BarcodeDetector({ formats: SCAN_FORMATS.filter((f) => supported.includes(f)) });
          let lastRun = 0;
          const tick = async (t) => {
            if (cancelled) return;
            if (t - lastRun > 120 && el.readyState >= 2) {
              lastRun = t;
              try {
                const [hit] = await detector.detect(el);
                if (hit && !cancelled) candidate(hit.rawValue);
              } catch { /* frame not ready */ }
            }
            frame = requestAnimationFrame(tick);
          };
          frame = requestAnimationFrame(tick);
        } else {
          const { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } = await import('@zxing/library');
          const hints = new Map([
            [DecodeHintType.POSSIBLE_FORMATS, [
              BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
              BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF, BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX,
            ]],
            [DecodeHintType.TRY_HARDER, true],
          ]);
          reader = new BrowserMultiFormatReader(hints, 120);
          if (cancelled) return;
          reader.decodeFromVideoElementContinuously(el, (result) => {
            if (result && !cancelled) candidate(result.getText());
          }).catch(() => {});
        }
        if (!cancelled) setStatus('scanning');
      } catch (err) {
        if (cancelled) return;
        setStatus('error');
        setMessage(err?.name === 'NotAllowedError'
          ? 'Camera permission was denied. Allow camera access in the browser settings, or type the code.'
          : err?.name === 'NotFoundError' ? 'No camera was found on this device.' : `Could not start the camera (${err?.message || err}).`);
      }
    })();

    return stop;
  }, [open, mode, cameraIndex, cameras, finish]);

  function close() {
    setManual(''); setManualError(null); setMessage(null); setStatus('idle');
    onClose();
  }

  function submitManual(e) {
    e.preventDefault();
    const code = normalizeScannedCode(manual);
    if (!code) { setManualError('That is not a valid barcode — check the digits (the last digit is a checksum).'); return; }
    setManual('');
    finish(code);
  }

  return (
    <Modal open={open} onClose={close} title={title} size="sm"
      description="Point the camera at the barcode, or use a USB scanner anywhere in the app.">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1">
          {[['camera', Camera, 'Camera'], ['manual', Keyboard, 'Type code']].map(([value, Icon, label]) => (
            <button key={value} type="button" onClick={() => setMode(value)}
              className={`flex items-center justify-center gap-2 rounded-md py-1.5 text-[13px] font-medium ${mode === value ? 'bg-surface text-ink shadow-sm' : 'text-ink-3'}`}>
              <Icon size={15} aria-hidden /> {label}
            </button>
          ))}
        </div>

        {mode === 'camera' && (
          <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-black">
            <video ref={video} className="h-full w-full object-cover" playsInline muted autoPlay />
            <div className="pointer-events-none absolute inset-x-[12%] top-1/2 h-[38%] -translate-y-1/2 rounded-md border-2 border-white/80 shadow-[0_0_0_9999px_rgb(0_0_0/0.35)]" aria-hidden>
              <div className="absolute inset-x-2 top-1/2 h-px bg-red-500/80" />
            </div>
            <div className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
              {status === 'starting' ? 'Starting camera…' : status === 'scanning' ? 'Looking for a barcode…' : status === 'error' ? 'Camera unavailable' : ''}
            </div>
            {cameras.length > 1 && (
              <button type="button" onClick={() => setCameraIndex((i) => (i + 1) % cameras.length)}
                className="absolute right-2 top-2 rounded-full bg-black/60 p-2 text-white" aria-label="Switch camera">
                <RefreshCw size={16} aria-hidden />
              </button>
            )}
          </div>
        )}

        {mode === 'manual' && (
          <form onSubmit={submitManual} className="space-y-2">
            <div className="flex gap-2">
              <BareInput
                value={manual}
                onChange={(e) => { setManual(e.target.value); setManualError(null); }}
                placeholder="e.g. 8901234567890"
                inputMode="numeric"
                autoComplete="off"
                data-autofocus
                data-scan-target="true"
                className="code text-base tracking-wider"
                aria-label="Barcode"
              />
              <Button type="submit" icon={ScanLine} disabled={!manual.trim()}>Look up</Button>
            </div>
            {manualError && <p className="text-xs text-danger">{manualError}</p>}
          </form>
        )}

        {message && <InlineAlert tone={status === 'error' ? 'danger' : 'info'}>{message}</InlineAlert>}
      </div>
    </Modal>
  );
}
