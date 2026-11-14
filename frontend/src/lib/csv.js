const BOM = String.fromCharCode(0xfeff);

/** Build and download a CSV file in the browser (UTF-8 BOM so Excel shows ₹ correctly). */
export function downloadCsv(filename, rows, columns) {
  const escape = (v) => {
    if (v == null) return '';
    const s = String(v);
    // Guard against spreadsheet formula injection from product/customer names.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const header = columns.map((c) => escape(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => escape(typeof c.value === 'function' ? c.value(r) : r[c.value])).join(',')).join('\n');
  const blob = new Blob([`${BOM}${header}\n${body}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
