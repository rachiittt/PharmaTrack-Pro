const { Router } = require('express');
const { requireAuth } = require('../middleware/requireAuth');
const { supabaseAdmin } = require('../db/supabase');

const router = Router();
router.use(requireAuth);

// Helper: escape CSV cell values
function csvCell(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsvRow(values) {
  return values.map(csvCell).join(',');
}

// GET /api/reports/inventory — full inventory CSV
router.get('/inventory', async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('medicines')
      .select('name, generic_name, manufacturer, batch_no, category, quantity, min_stock_level, cost_price, selling_price, mrp, expiry_date, barcode, hsn_code, suppliers(name)')
      .eq('user_id', req.user.id)
      .eq('is_archived', false)
      .order('name');

    if (error) throw error;

    const now = new Date();
    const headers = 'Name,Generic Name,Manufacturer,Batch No,Category,Quantity,Min Stock,Cost Price,Selling Price,MRP,Expiry Date,Days Until Expiry,Status,Barcode,HSN Code,Supplier\n';
    const rows = (data || []).map(m => {
      const diffDays = Math.ceil((new Date(m.expiry_date) - now) / 86400000);
      let status = 'Healthy';
      if (diffDays < 0) status = 'Expired';
      else if (diffDays <= 10) status = 'Critical';
      else if (diffDays <= 30) status = 'Warning';
      else if (diffDays <= 60) status = 'Upcoming';

      return toCsvRow([
        m.name, m.generic_name, m.manufacturer, m.batch_no, m.category,
        m.quantity, m.min_stock_level, m.cost_price, m.selling_price, m.mrp,
        m.expiry_date, diffDays, status, m.barcode, m.hsn_code,
        m.suppliers?.name || '',
      ]);
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=inventory_report.csv');
    res.send(headers + rows.join('\n'));
  } catch (err) { next(err); }
});

// GET /api/reports/sales — sales history CSV
router.get('/sales', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    let query = supabaseAdmin
      .from('sales')
      .select('invoice_no, created_at, total_amount, subtotal, tax_amount, discount_pct, payment_method, notes, customers(name, phone)')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);

    const { data, error } = await query;
    if (error) throw error;

    const headers = 'Invoice No,Date,Customer Name,Customer Phone,Subtotal,Tax,Discount %,Total,Payment Method,Notes\n';
    const rows = (data || []).map(s => toCsvRow([
      s.invoice_no,
      new Date(s.created_at).toLocaleDateString('en-IN'),
      s.customers?.name || 'Walk-in',
      s.customers?.phone || '',
      s.subtotal, s.tax_amount, s.discount_pct, s.total_amount,
      s.payment_method, s.notes || '',
    ]));

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=sales_report.csv');
    res.send(headers + rows.join('\n'));
  } catch (err) { next(err); }
});

// GET /api/reports/expiry — expiry-only medicines CSV
router.get('/expiry', async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('medicines')
      .select('name, generic_name, batch_no, quantity, cost_price, selling_price, expiry_date, suppliers(name)')
      .eq('user_id', req.user.id)
      .eq('is_archived', false)
      .lte('expiry_date', new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0])
      .order('expiry_date', { ascending: true });

    if (error) throw error;

    const now = new Date();
    const headers = 'Name,Generic Name,Batch No,Quantity,Cost Price,Selling Price,Expiry Date,Days Until Expiry,Status,Supplier\n';
    const rows = (data || []).map(m => {
      const diffDays = Math.ceil((new Date(m.expiry_date) - now) / 86400000);
      let status = 'Upcoming';
      if (diffDays < 0) status = 'Expired';
      else if (diffDays <= 10) status = 'Critical';
      else if (diffDays <= 30) status = 'Warning';

      return toCsvRow([
        m.name, m.generic_name, m.batch_no, m.quantity,
        m.cost_price, m.selling_price, m.expiry_date, diffDays, status,
        m.suppliers?.name || '',
      ]);
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=expiry_report.csv');
    res.send(headers + rows.join('\n'));
  } catch (err) { next(err); }
});

// GET /api/reports/gst — GST summary by HSN code
router.get('/gst', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    let query = supabaseAdmin
      .from('sales')
      .select('total_amount, tax_amount, sale_items(quantity, unit_price, medicines(name, hsn_code))')
      .eq('user_id', req.user.id);

    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);

    const { data, error } = await query;
    if (error) throw error;

    // Aggregate by HSN code
    const hsnMap = {};
    (data || []).forEach(sale => {
      (sale.sale_items || []).forEach(item => {
        const hsn = item.medicines?.hsn_code || 'Unknown';
        const name = item.medicines?.name || 'Unknown';
        const taxable = item.quantity * item.unit_price;
        if (!hsnMap[hsn]) hsnMap[hsn] = { hsn_code: hsn, medicine: name, taxable_value: 0, tax_amount: 0, invoices: 0 };
        hsnMap[hsn].taxable_value += taxable;
        hsnMap[hsn].invoices++;
      });
    });

    res.json({
      period: { from: from || 'all-time', to: to || 'all-time' },
      summary: Object.values(hsnMap).map(h => ({
        ...h,
        taxable_value: Math.round(h.taxable_value * 100) / 100,
      })),
      total_tax: (data || []).reduce((s, r) => s + parseFloat(r.tax_amount || 0), 0).toFixed(2),
    });
  } catch (err) { next(err); }
});

module.exports = router;
