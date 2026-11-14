import { useEffect, useRef } from 'react';
import { normalizeScannedCode } from '../lib/barcode';

/**
 * USB / Bluetooth barcode scanners act as keyboards: they "type" the code very
 * fast and press Enter. This listens globally and reports a scan when a burst
 * of ≥6 characters arrives with <40 ms between keys, ending in Enter.
 * Typing into ordinary form fields is ignored unless the field opts in with
 * data-scan-target.
 */
export function useBarcodeWedge(onScan, { enabled = true } = {}) {
  const buffer = useRef('');
  const last = useRef(0);
  const handler = useRef(onScan);
  useEffect(() => { handler.current = onScan; }, [onScan]);

  useEffect(() => {
    if (!enabled) return undefined;
    function onKeyDown(e) {
      const target = e.target;
      const isField = target instanceof HTMLElement
        && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      if (isField && !target.dataset.scanTarget) return;

      const now = performance.now();
      if (now - last.current > 40) buffer.current = '';
      last.current = now;

      if (e.key === 'Enter') {
        const code = buffer.current;
        buffer.current = '';
        if (code.length >= 6) {
          const normalized = normalizeScannedCode(code);
          if (normalized) {
            e.preventDefault();
            e.stopPropagation();
            if (isField && 'value' in target) {
              // Clear the characters the scanner typed into the field.
              const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(target), 'value')?.set;
              setter?.call(target, '');
              target.dispatchEvent(new Event('input', { bubbles: true }));
            }
            handler.current(normalized);
          }
        }
        return;
      }
      if (e.key.length === 1) buffer.current += e.key;
    }
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [enabled]);
}
