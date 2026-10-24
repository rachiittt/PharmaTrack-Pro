import * as XLSX from 'xlsx';

/**
 * Parse Excel/CSV file into array of medicine objects
 */
export function parseExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target.result, { type: 'binary', cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet);
        resolve(data);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsBinaryString(file);
  });
}

/**
 * Validate rows and return enriched data with status
 */
export function validateRows(rows) {
  const batchNos = new Set();
  return rows.map((row, index) => {
    const errors = [];
    const warnings = [];

    // Required fields
    if (!row['Medicine Name']) errors.push('Medicine Name is required');
    if (!row['Batch No']) errors.push('Batch No is required');
    if (!row['Category']) errors.push('Category is required');
    if (!row['Quantity'] && row['Quantity'] !== 0) errors.push('Quantity is required');
    if (!row['Cost Price']) errors.push('Cost Price is required');
    if (!row['Selling Price']) errors.push('Selling Price is required');
    if (!row['Expiry Date']) errors.push('Expiry Date is required');

    // Duplicate batch check
    if (row['Batch No']) {
      if (batchNos.has(row['Batch No'])) errors.push('Duplicate Batch No in file');
      batchNos.add(row['Batch No']);
    }

    // Price warnings
    if (row['Selling Price'] && row['Cost Price'] && parseFloat(row['Selling Price']) < parseFloat(row['Cost Price'])) {
      warnings.push('Selling price below cost');
    }
    if (row['MRP'] && row['Selling Price'] && parseFloat(row['Selling Price']) > parseFloat(row['MRP'])) {
      warnings.push('Selling price above MRP');
    }

    // Valid categories
    const validCategories = ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Topical', 'Other'];
    if (row['Category'] && !validCategories.includes(row['Category'])) {
      errors.push(`Invalid category: ${row['Category']}`);
    }

    // Parse expiry date
    let expiryDate = row['Expiry Date'];
    if (expiryDate instanceof Date) {
      expiryDate = expiryDate.toISOString().split('T')[0];
    } else if (typeof expiryDate === 'string' && expiryDate.includes('/')) {
      const parts = expiryDate.split('/');
      if (parts.length === 3) {
        expiryDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }

    const status = errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'valid';

    return {
      rowIndex: index + 1,
      status,
      errors,
      warnings,
      data: {
        name: row['Medicine Name'] || '',
        generic_name: row['Generic Name'] || '',
        manufacturer: row['Manufacturer'] || '',
        batch_no: row['Batch No'] || '',
        category: row['Category'] || 'Other',
        quantity: parseInt(row['Quantity']) || 0,
        min_stock_level: parseInt(row['Min Stock Level']) || 10,
        unit: row['Unit'] || 'strips',
        cost_price: parseFloat(row['Cost Price']) || 0,
        selling_price: parseFloat(row['Selling Price']) || 0,
        mrp: row['MRP'] ? parseFloat(row['MRP']) : undefined,
        expiry_date: expiryDate || '',
        hsn_code: row['HSN Code'] || '',
        barcode: row['Barcode'] || '',
      },
    };
  });
}

/**
 * Generate template download
 */
export function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Medicine Name', 'Generic Name', 'Manufacturer', 'Batch No', 'Category', 'Quantity', 'Min Stock Level', 'Unit', 'Cost Price', 'Selling Price', 'MRP', 'Expiry Date', 'Supplier Name', 'HSN Code', 'Barcode'],
    ['Dolo 650', 'Paracetamol', 'Micro Labs', 'DL-2024-001', 'Tablet', 100, 10, 'strips', 22, 28, 30, '31/12/2025', 'Sun Pharma', '30049099', '8901234567890'],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Medicines');
  XLSX.writeFile(wb, 'SPMS_Medicine_Import_Template.xlsx');
}

/**
 * Build CSV error report
 */
export function buildErrorReport(validatedRows) {
  const errors = validatedRows.filter(r => r.status === 'error');
  const lines = ['Row,Field,Error'];
  errors.forEach(r => {
    r.errors.forEach(err => {
      lines.push(`${r.rowIndex},"${r.data.name || 'Unknown'}","${err}"`);
    });
  });
  return lines.join('\n');
}
