import { useState } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Ban, Printer, Undo2 } from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { useAsync } from '../hooks/useAsync';
import { cancelSale, getSale } from '../services/sales';
import { money, dateTime } from '../lib/format';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/Misc';
import { SaleStatusBadge } from '../components/ui/Badge';
import { ErrorState, InlineAlert, PageLoader } from '../components/ui/States';
import { InvoiceView } from '../components/sales/InvoiceView';
import { ReturnDialog } from '../components/sales/ReturnDialog';

export default function SaleDetail() {
  const { id } = useParams();
  const { can } = useSession();
  const { data: sale, error, reload } = useAsync(() => getSale(id), [id]);
  const [returning, setReturning] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  if (error) return <ErrorState error={error} onRetry={reload} title="Bill not found" />;
  if (!sale) return <PageLoader />;

  const canReturn = can('sales.return') && !['cancelled', 'returned'].includes(sale.status);
  const canCancel = can('sales.cancel') && sale.status === 'completed';

  async function doCancel(reason) {
    try {
      await cancelSale(sale.id, reason);
      toast.success(`${sale.invoice_no} cancelled · stock restored`);
      setCancelling(false);
      reload();
    } catch (e) { toast.error(e.message); }
  }

  return (
    <>
      <div className="no-print">
        <PageHeader back={{ to: '/sales', label: 'Sales' }} title={sale.invoice_no} meta={<SaleStatusBadge status={sale.status} />}
          description={`${dateTime(sale.created_at)} · ${money(sale.total_amount)}`}
          actions={(
            <>
              {canCancel && <Button variant="danger-outline" icon={Ban} onClick={() => setCancelling(true)}>Cancel bill</Button>}
              {canReturn && <Button variant="secondary" icon={Undo2} onClick={() => setReturning(true)}>Return items</Button>}
              <Button icon={Printer} onClick={() => window.print()}>Print / PDF</Button>
            </>
          )} />
        {sale.status === 'cancelled' && (
          <div className="mb-4"><InlineAlert tone="danger" title="This bill was cancelled">{sale.cancel_reason} · {dateTime(sale.cancelled_at)}. All units were returned to stock.</InlineAlert></div>
        )}
      </div>
      <InvoiceView sale={sale} />
      {returning && <ReturnDialog sale={sale} onClose={() => setReturning(false)} onDone={reload} />}
      <ConfirmDialog open={cancelling} onClose={() => setCancelling(false)} onConfirm={doCancel} title={`Cancel ${sale.invoice_no}?`}
        confirmLabel="Cancel bill" requireReason reasonLabel="Why is this bill being cancelled?">
        Every unit on this bill goes back to its batch and the bill is marked cancelled. This is recorded in the audit log and cannot be undone.
      </ConfirmDialog>
    </>
  );
}
