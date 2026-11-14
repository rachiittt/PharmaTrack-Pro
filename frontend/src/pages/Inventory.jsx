import { useCallback, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Boxes, Download, Plus, ScanLine, Search } from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { useAsync, useDebounced } from '../hooks/useAsync';
import { useBarcodeWedge } from '../hooks/useBarcodeWedge';
import { CATEGORIES, listInventory, lookupBarcode } from '../services/inventory';
import { money, moneyCompact } from '../lib/format';
import { downloadCsv } from '../lib/csv';
import { Button } from '../components/ui/Button';
import { BareInput, BareSelect } from '../components/ui/Field';
import { DataTable, Pagination } from '../components/ui/DataTable';
import { ExpiryBar, PageHeader, Segmented, StockLevel } from '../components/ui/Misc';
import { EmptyState, ErrorState, InlineAlert } from '../components/ui/States';
import { ScheduleBadge, StockBadge, Badge } from '../components/ui/Badge';
import { BarcodeScanner } from '../components/scanner/BarcodeScanner';
import { ProductFormModal } from '../components/inventory/ProductFormModal';

const PAGE = 50;

export default function Inventory() {
  const { pharmacy, branch, can, settings } = useSession();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') || '');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState(params.get('status') || 'all');
  const [page, setPage] = useState(1);
  const [scanOpen, setScanOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(params.get('new') === '1');
  const [newBarcode, setNewBarcode] = useState(null);
  const [notFound, setNotFound] = useState(null);
  const q = useDebounced(search.trim(), 250);

  const { data, error, loading, reload } = useAsync(
    () => listInventory({ pharmacyId: pharmacy.id, branchId: branch?.id ?? null, search: q, category, status, limit: PAGE, offset: (page - 1) * PAGE }),
    [pharmacy.id, branch?.id, q, category, status, page],
  );

  const onCode = useCallback(async (code) => {
    setScanOpen(false);
    try {
      const product = await lookupBarcode(pharmacy.id, code);
      if (product) navigate(`/inventory/${product.id}`);
      else setNotFound(code);
    } catch (e) { toast.error(e.message); }
  }, [pharmacy.id, navigate]);
  useBarcodeWedge(onCode, { enabled: !formOpen && !scanOpen });

  function changeStatus(v) { setStatus(v); setPage(1); setParams(v === 'all' ? {} : { status: v }, { replace: true }); }

  async function exportCsv() {
    try {
      const all = await listInventory({ pharmacyId: pharmacy.id, branchId: branch?.id ?? null, search: q, category, status, limit: 200, offset: 0 });
      downloadCsv(`inventory-${new Date().toISOString().slice(0, 10)}.csv`, all.rows, [
        { label: 'Product', value: 'name' }, { label: 'Generic', value: 'generic_name' }, { label: 'Category', value: 'category' },
        { label: 'Barcode', value: 'barcode' }, { label: 'Sellable qty', value: 'sellable_qty' }, { label: 'Expired qty', value: 'expired_qty' },
        { label: 'Min level', value: 'min_stock_level' }, { label: 'Next expiry', value: 'next_expiry' },
        { label: 'Stock value (cost)', value: 'stock_value' }, { label: 'Rack', value: 'rack_location' }, { label: 'Supplier', value: 'supplier_name' },
      ]);
      if (all.total > 200) toast('Exported the first 200 rows. Use Reports for the full valuation.', { icon: 'ℹ️' });
    } catch (e) { toast.error(e.message); }
  }

  const rows = data?.rows;
  const columns = [
    {
      key: 'name', header: 'Product', render: (r) => (
        <div className="min-w-[200px]">
          <div className="flex items-center gap-2"><span className="font-medium text-ink">{r.name}</span><ScheduleBadge schedule={r.schedule} /></div>
          <div className="text-xs text-ink-3">{[r.generic_name, r.manufacturer].filter(Boolean).join(' · ') || '—'}</div>
        </div>
      ),
    },
    { key: 'category', header: 'Category', hideBelow: 'md', render: (r) => <span className="text-ink-2">{r.category}</span> },
    { key: 'stock', header: 'In stock', align: 'right', render: (r) => <StockLevel qty={r.sellable_qty} min={r.min_stock_level} unit={r.unit} /> },
    { key: 'status', header: '', hideBelow: 'sm', render: (r) => (
      <div className="flex gap-1"><StockBadge status={r.stock_status} />{r.has_expired && <Badge tone="danger">Expired units</Badge>}</div>
    ) },
    { key: 'expiry', header: 'Next expiry', hideBelow: 'md', render: (r) => (r.next_expiry
      ? <ExpiryBar date={r.next_expiry} criticalDays={settings.expiry_critical_days} warningDays={settings.expiry_warning_days} />
      : <span className="text-ink-3">—</span>) },
    { key: 'price', header: 'Price', align: 'right', hideBelow: 'lg', render: (r) => (r.current_price != null ? money(r.current_price) : '—') },
    { key: 'value', header: 'Value', align: 'right', hideBelow: 'lg', render: (r) => moneyCompact(r.stock_value) },
    { key: 'rack', header: 'Rack', hideBelow: 'lg', render: (r) => <span className="code text-ink-2">{r.rack_location || '—'}</span> },
  ];

  return (
    <>
      <PageHeader
        title="Inventory"
        description={`${data?.total ?? '…'} products${branch ? ` · stock shown for ${branch.name}` : ''}`}
        actions={(
          <>
            <Button variant="secondary" icon={Download} onClick={exportCsv}>Export</Button>
            <Button variant="secondary" icon={ScanLine} onClick={() => setScanOpen(true)}>Scan</Button>
            {can('inventory.edit') && <Button icon={Plus} onClick={() => { setNewBarcode(null); setFormOpen(true); }}>Add product</Button>}
          </>
        )}
      />

      {notFound && (
        <div className="mb-4">
          <InlineAlert tone="warning" title={`Barcode ${notFound} is not in your catalogue`}
            action={can('inventory.edit') && <Button size="sm" variant="secondary" onClick={() => { setNewBarcode(notFound); setNotFound(null); setFormOpen(true); }}>Register it</Button>}>
            Scan again if the read looked wrong, or register it as a new product.
          </InlineAlert>
        </div>
      )}

      <div className="rounded-xl border border-line bg-surface">
        <div className="flex flex-col gap-3 border-b border-line p-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden />
            <BareInput value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search name, generic, composition, manufacturer or barcode"
              className="pl-9" aria-label="Search inventory" data-scan-target="true" />
          </div>
          <BareSelect value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} aria-label="Category"
            options={[{ value: '', label: 'All categories' }, ...CATEGORIES]} className="lg:w-44" />
          <Segmented value={status} onChange={changeStatus} options={[
            { value: 'all', label: 'All' }, { value: 'low', label: 'Low' }, { value: 'out', label: 'Out' },
            { value: 'expiring', label: 'Expiring' }, { value: 'expired', label: 'Expired' },
          ]} />
        </div>

        {error ? <ErrorState error={error} onRetry={reload} /> : (
          <>
            <DataTable
              columns={columns}
              rows={rows}
              loading={loading}
              onRowClick={(r) => navigate(`/inventory/${r.id}`)}
              className={loading && rows ? 'opacity-60' : ''}
              empty={(
                <EmptyState icon={Boxes} title={q || category || status !== 'all' ? 'No products match these filters' : 'No products yet'}
                  action={!q && !category && status === 'all' && can('inventory.edit') && <Button icon={Plus} onClick={() => setFormOpen(true)}>Add product</Button>}>
                  {q || category || status !== 'all' ? 'Try a different search or clear the filters.' : 'Add products one by one, or enter a supplier invoice under Purchases.'}
                </EmptyState>
              )}
            />
            <Pagination page={page} pageSize={PAGE} total={data?.total ?? 0} onChange={setPage} />
          </>
        )}
      </div>

      <BarcodeScanner open={scanOpen} onClose={() => setScanOpen(false)} onDetected={onCode} title="Find product by barcode" />
      <ProductFormModal open={formOpen} initialBarcode={newBarcode} onClose={() => { setFormOpen(false); if (params.get('new')) setParams({}, { replace: true }); }}
        onSaved={(p) => { reload(); navigate(`/inventory/${p.id}`); }} />
    </>
  );
}
