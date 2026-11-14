import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Archive, ArchiveRestore, ClipboardList, Pencil, SlidersHorizontal } from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { useAsync } from '../hooks/useAsync';
import { getProduct, listBatches, listMovements, setArchived } from '../services/inventory';
import { money, dateTime, number } from '../lib/format';
import { Button } from '../components/ui/Button';
import { Panel, DetailList } from '../components/ui/Panel';
import { DataTable } from '../components/ui/DataTable';
import { ExpiryBar, PageHeader, Stat } from '../components/ui/Misc';
import { Badge, ScheduleBadge } from '../components/ui/Badge';
import { ConfirmDialog } from '../components/ui/Modal';
import { EmptyState, ErrorState, PageLoader } from '../components/ui/States';
import { ProductFormModal } from '../components/inventory/ProductFormModal';
import { AdjustStockModal } from '../components/inventory/AdjustStockModal';

const MOVEMENT = {
  opening: ['neutral', 'Opening stock'], purchase: ['success', 'Purchase'], sale: ['info', 'Sale'],
  sale_return: ['caution', 'Return'], sale_cancel: ['caution', 'Bill cancelled'], adjustment: ['neutral', 'Adjustment'],
  damage: ['danger', 'Damage'], expired_writeoff: ['danger', 'Expired write-off'], transfer: ['neutral', 'Transfer'],
};

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can, settings, branch } = useSession();
  const [editing, setEditing] = useState(false);
  const [adjusting, setAdjusting] = useState(null);
  const [confirmArchive, setConfirmArchive] = useState(false);

  const product = useAsync(() => getProduct(id), [id]);
  const batches = useAsync(() => listBatches(id), [id]);
  const movements = useAsync(() => (can('stock.adjust') ? listMovements(id) : Promise.resolve([])), [id]);
  const reloadAll = () => { product.reload(); batches.reload(); movements.reload(); };

  if (product.error) return <ErrorState error={product.error} onRetry={product.reload} title="Product not found" />;
  if (!product.data) return <PageLoader />;
  const p = product.data;
  const rows = batches.data || [];
  const branchRows = branch ? rows.filter((b) => b.branch_id === branch.id) : rows;
  const today = new Date().toISOString().slice(0, 10);
  const sellable = branchRows.filter((b) => b.expiry_date >= today).reduce((s, b) => s + b.quantity, 0);
  const expired = branchRows.filter((b) => b.expiry_date < today).reduce((s, b) => s + b.quantity, 0);
  const value = branchRows.reduce((s, b) => s + b.quantity * Number(b.purchase_price), 0);

  async function toggleArchive() {
    try {
      await setArchived(p.id, !p.is_archived);
      toast.success(p.is_archived ? 'Product restored' : 'Product archived — it no longer appears in billing');
      setConfirmArchive(false);
      product.reload();
    } catch (e) { toast.error(e.message); }
  }

  return (
    <>
      <PageHeader
        back={{ to: '/inventory', label: 'Inventory' }}
        title={p.name}
        meta={<><ScheduleBadge schedule={p.schedule} />{p.is_archived && <Badge tone="neutral">Archived</Badge>}</>}
        description={[p.generic_name, p.composition, p.manufacturer].filter(Boolean).join(' · ')}
        actions={can('inventory.edit') && (
          <>
            <Button variant="secondary" icon={p.is_archived ? ArchiveRestore : Archive} onClick={() => (p.is_archived ? toggleArchive() : setConfirmArchive(true))}>
              {p.is_archived ? 'Restore' : 'Archive'}
            </Button>
            <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>Edit</Button>
            {can('purchases.create') && <Button icon={ClipboardList} onClick={() => navigate(`/purchases/new?product=${p.id}`)}>Receive stock</Button>}
          </>
        )}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={`Sellable${branch ? ` · ${branch.name}` : ''}`} value={`${number(sellable)} ${p.unit}`} tone={sellable === 0 ? 'danger' : sellable <= p.min_stock_level ? 'warning' : 'success'}
          sub={`minimum ${p.min_stock_level}`} />
        <Stat label="Expired on shelf" value={number(expired)} tone={expired ? 'danger' : undefined} sub={expired ? 'write off from the batch below' : 'none'} />
        <Stat label="Stock value (cost)" value={money(value)} />
        <Stat label="Active batches" value={branchRows.filter((b) => b.quantity > 0).length} sub="issued first-expiry-first-out" />
      </div>

      <Panel className="mt-4" title="Batches" description="Billing always uses the earliest non-expired batch first." padded={false}>
        {batches.error ? <ErrorState compact error={batches.error} onRetry={batches.reload} /> : (
          <DataTable
            loading={batches.loading}
            rows={rows}
            rowClassName={(b) => (b.quantity === 0 ? 'opacity-50' : '')}
            columns={[
              { key: 'batch_no', header: 'Batch', render: (b) => <span className="code font-medium">{b.batch_no}</span> },
              { key: 'branch', header: 'Branch', hideBelow: 'md', render: (b) => b.branches?.name },
              { key: 'expiry', header: 'Expiry', render: (b) => <ExpiryBar date={b.expiry_date} criticalDays={settings.expiry_critical_days} warningDays={settings.expiry_warning_days} /> },
              { key: 'quantity', header: 'Qty', align: 'right', render: (b) => <span className="font-medium">{b.quantity}</span> },
              { key: 'purchase_price', header: 'Cost', align: 'right', hideBelow: 'sm', render: (b) => money(b.purchase_price) },
              { key: 'selling_price', header: 'Selling', align: 'right', render: (b) => money(b.selling_price) },
              { key: 'mrp', header: 'MRP', align: 'right', hideBelow: 'sm', render: (b) => money(b.mrp) },
              { key: 'supplier', header: 'Supplier', hideBelow: 'lg', render: (b) => b.suppliers?.name ?? '—' },
              { key: 'actions', header: '', render: (b) => can('stock.adjust') && b.quantity > 0 && (
                <Button size="xs" variant={b.expiry_date < today ? 'danger-outline' : 'ghost'} icon={SlidersHorizontal}
                  onClick={() => setAdjusting({ batch: b, type: b.expiry_date < today ? 'expired_writeoff' : 'adjustment' })}>
                  {b.expiry_date < today ? 'Write off' : 'Adjust'}
                </Button>
              ) },
            ]}
            empty={<EmptyState compact title="No batches yet">Receive stock through Purchases to create the first batch.</EmptyState>}
          />
        )}
      </Panel>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel title="Details" className="xl:col-span-1">
          <DetailList columns={2} items={[
            { label: 'Category', value: p.category },
            { label: 'Schedule', value: p.schedule },
            { label: 'Barcode', value: p.barcode ? <span className="code">{p.barcode}</span> : null },
            { label: 'Rack', value: p.rack_location },
            { label: 'HSN', value: p.hsn_code },
            { label: 'GST', value: `${Number(p.gst_rate)}%` },
            { label: 'Unit / pack', value: `${p.unit} × ${p.pack_size}` },
            { label: 'Usual supplier', value: p.suppliers?.name },
          ]} />
        </Panel>
        {can('stock.adjust') && (
          <Panel title="Stock history" description="Every change to this product's stock" className="xl:col-span-2" padded={false}>
            <DataTable
              loading={movements.loading}
              rows={movements.data}
              columns={[
                { key: 'created_at', header: 'When', render: (m) => <span className="whitespace-nowrap text-ink-2">{dateTime(m.created_at)}</span> },
                { key: 'type', header: 'Type', render: (m) => { const [tone, label] = MOVEMENT[m.movement_type] ?? ['neutral', m.movement_type]; return <Badge tone={tone}>{label}</Badge>; } },
                { key: 'batch', header: 'Batch', hideBelow: 'sm', render: (m) => <span className="code">{m.medicine_batches?.batch_no}</span> },
                { key: 'change', header: 'Change', align: 'right', render: (m) => <span className={m.quantity_change > 0 ? 'text-success' : 'text-ink'}>{m.quantity_change > 0 ? '+' : ''}{m.quantity_change}</span> },
                { key: 'balance', header: 'Balance', align: 'right', hideBelow: 'sm', render: (m) => m.balance_after },
                { key: 'reason', header: 'Reference', hideBelow: 'md', render: (m) => <span className="text-ink-3">{m.reason || '—'}</span> },
                { key: 'by', header: 'By', hideBelow: 'lg', render: (m) => m.profiles?.full_name || '—' },
              ]}
              empty={<EmptyState compact title="No stock movements yet" />}
            />
          </Panel>
        )}
      </div>

      <ProductFormModal open={editing} product={p} onClose={() => setEditing(false)} onSaved={reloadAll} />
      {adjusting && <AdjustStockModal batch={adjusting.batch} defaultType={adjusting.type} productName={p.name} onClose={() => setAdjusting(null)} onDone={reloadAll} />}
      <ConfirmDialog open={confirmArchive} onClose={() => setConfirmArchive(false)} onConfirm={toggleArchive} title={`Archive ${p.name}?`} confirmLabel="Archive" tone="primary">
        Archived products disappear from billing and search. Their batches, sales and history are kept, and you can restore the product at any time.
      </ConfirmDialog>
    </>
  );
}
