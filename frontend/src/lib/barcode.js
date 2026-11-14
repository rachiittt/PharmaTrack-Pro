/**
 * Barcode helpers shared by the camera scanner and USB (keyboard-wedge) input.
 */

/** Retail and pharma formats we decode from the camera. */
export const SCAN_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code', 'data_matrix'];

/** GS1 check digit for EAN-8 / UPC-A / EAN-13 / GTIN-14. */
export function hasValidGtinChecksum(code) {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop();
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/**
 * Normalise what a scanner produced. Numeric retail codes must pass their
 * checksum, so a misread never silently matches the wrong product.
 * Returns null when the code should be rejected.
 */
export function normalizeScannedCode(raw) {
  if (!raw) return null;
  let code = String(raw).trim().replace(/\s+/g, '');
  // GS1 DataMatrix / QR on pharma packs: (01)GTIN…  → take the GTIN-14
  const gs1 = code.match(/^(?:\]d2|\]Q3)?\(?01\)?(\d{14})/);
  if (gs1) code = gs1[1];
  // GTIN-14 with a leading packaging-level 0 is the same product as its EAN-13.
  if (/^0\d{13}$/.test(code) && hasValidGtinChecksum(code)) code = code.slice(1);
  if (/^\d+$/.test(code) && [8, 12, 13, 14].includes(code.length)) {
    return hasValidGtinChecksum(code) ? code : null;
  }
  return /^[0-9A-Za-z\-.]{4,64}$/.test(code) ? code : null;
}
