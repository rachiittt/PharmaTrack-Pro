import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUp, Info, Sparkles } from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { useAsync } from '../hooks/useAsync';
import { aiStatus, askAssistant } from '../services/ai';
import { expiryRisk, reorderSuggestions } from '../services/insights';
import { money, expiryShort } from '../lib/format';
import { Button } from '../components/ui/Button';
import { Panel } from '../components/ui/Panel';
import { DataTable } from '../components/ui/DataTable';
import { PageHeader, Segmented } from '../components/ui/Misc';
import { EmptyState, ErrorState, InlineAlert, Spinner } from '../components/ui/States';

const SUGGESTIONS = [
  'Which medicines are running low and what should I reorder this week?',
  'What stock is at risk of expiring in the next 3 months, and how much money is that?',
  'How did sales do in the last 30 days compared to before?',
  'Which products haven’t sold in months?',
];

/** Very small markdown renderer: paragraphs, bold, bullet lists and pipe tables. */
function Markdown({ text }) {
  const blocks = text.split(/\n{2,}/);
  const inline = (s) => s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part));
  return (
    <div className="space-y-3 text-sm leading-relaxed text-ink">
      {blocks.map((b, i) => {
        const lines = b.trim().split('\n');
        if (lines.length > 1 && lines.every((l) => l.trim().startsWith('|'))) {
          const rows = lines.filter((l) => !/^\|\s*-/.test(l.trim())).map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
          return (
            <div key={i} className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-[13px]">
                <thead className="bg-surface-2"><tr>{rows[0].map((c, j) => <th key={j} className="px-3 py-1.5 text-left font-semibold">{c}</th>)}</tr></thead>
                <tbody>{rows.slice(1).map((r, j) => <tr key={j} className="border-t border-line">{r.map((c, k) => <td key={k} className="px-3 py-1.5 num">{inline(c)}</td>)}</tr>)}</tbody>
              </table>
            </div>
          );
        }
        if (lines.every((l) => /^\s*[-*] /.test(l))) {
          return <ul key={i} className="list-disc space-y-1 pl-5">{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*[-*] /, ''))}</li>)}</ul>;
        }
        return <p key={i}>{lines.map((l, j) => <span key={j}>{inline(l.replace(/^#+\s*/, ''))}{j < lines.length - 1 && <br />}</span>)}</p>;
      })}
    </div>
  );
}

export default function Assistant() {
  const { pharmacy, branch } = useSession();
  const status = useAsync(() => aiStatus(pharmacy.id), [pharmacy.id]);
  const [view, setView] = useState('reorder');
  const reorder = useAsync(() => reorderSuggestions(pharmacy.id, branch?.id ?? null), [pharmacy.id, branch?.id]);
  const risk = useAsync(() => expiryRisk(pharmacy.id, branch?.id ?? null), [pharmacy.id, branch?.id]);
  const [question, setQuestion] = useState('');
  const [thread, setThread] = useState([]);
  const [asking, setAsking] = useState(false);
  const input = useRef(null);
  const configured = status.data?.configured;

  async function ask(q) {
    const text = (q ?? question).trim();
    if (text.length < 3 || asking) return;
    setQuestion('');
    setThread((t) => [...t, { role: 'user', text }]);
    setAsking(true);
    try {
      const res = await askAssistant(pharmacy.id, text, branch?.id ?? null);
      setThread((t) => [...t, { role: 'assistant', text: res.answer, tools: res.tools_used }]);
    } catch (e) {
      setThread((t) => [...t, { role: 'error', text: e.message }]);
    } finally {
      setAsking(false);
      input.current?.focus();
    }
  }

  return (
    <>
      <PageHeader title="Assistant" description="Answers from your own stock and sales data. Suggestions only — nothing changes until you act." />

      <div className="grid gap-4 xl:grid-cols-[1fr_440px]">
        <Panel padded={false} className="flex min-h-[520px] flex-col">
          {status.error && !configured && <div className="p-4"><ErrorState compact error={status.error} title="Assistant unavailable" onRetry={status.reload} /></div>}
          {status.data && !configured && (
            <div className="p-4"><InlineAlert tone="info" icon={Info} title="The AI assistant isn't enabled on this server">
              Set <span className="code">ANTHROPIC_API_KEY</span> on the backend to turn it on. The reorder and expiry-risk tables on the right work without it.
            </InlineAlert></div>
          )}
          <div className="flex-1 space-y-5 overflow-y-auto scroll-thin p-5" aria-live="polite">
            {thread.length === 0 && (
              <div className="py-6">
                <div className="mb-4 flex items-center gap-2 text-ink-2"><Sparkles size={16} className="text-primary" aria-hidden /><span className="text-sm font-medium">Try asking</span></div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" disabled={!configured} onClick={() => ask(s)}
                      className="rounded-lg border border-line px-3 py-2.5 text-left text-[13px] text-ink-2 hover:border-line-strong hover:bg-surface-2 disabled:opacity-50">{s}</button>
                  ))}
                </div>
                <p className="mt-5 text-xs text-ink-3">The assistant reads stock, expiry, purchase and sales totals for {pharmacy.name}. It does not see customer details or prescriptions, and it does not give medical advice.</p>
              </div>
            )}
            {thread.map((m, i) => (
              m.role === 'user'
                ? <div key={i} className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-primary-soft px-4 py-2.5 text-sm text-primary-ink">{m.text}</div>
                : m.role === 'error'
                  ? <InlineAlert key={i} tone="danger">{m.text}</InlineAlert>
                  : (
                    <div key={i} className="max-w-full">
                      <Markdown text={m.text} />
                      {m.tools?.length > 0 && <p className="mt-2 text-[11px] text-ink-3">Based on: {m.tools.map((t) => t.replace(/^get_/, '').replace(/_/g, ' ')).join(', ')}</p>}
                    </div>
                  )
            ))}
            {asking && <div className="flex items-center gap-2 text-sm text-ink-3"><Spinner size={15} /> Looking at your data…</div>}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); ask(); }} className="border-t border-line p-3">
            <div className="flex items-end gap-2 rounded-xl border border-line-strong bg-surface px-3 py-2 focus-within:border-primary">
              <textarea ref={input} value={question} onChange={(e) => setQuestion(e.target.value)} rows={1} maxLength={500} disabled={!configured}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }}
                placeholder={configured ? 'Ask about stock, expiry, reordering or sales…' : 'Assistant not enabled'}
                aria-label="Question" className="max-h-32 flex-1 resize-none bg-transparent py-1 text-sm focus:outline-none" />
              <Button type="submit" size="sm" icon={ArrowUp} disabled={!configured || question.trim().length < 3} loading={asking} aria-label="Ask" />
            </div>
          </form>
        </Panel>

        <Panel title="Computed from your data" description="Last 60 days of sales; no AI involved." padded={false}
          actions={<Segmented size="sm" value={view} onChange={setView} options={[{ value: 'reorder', label: 'Reorder' }, { value: 'risk', label: 'Expiry risk' }]} />}>
          {view === 'reorder' ? (
            reorder.error ? <ErrorState compact error={reorder.error} onRetry={reorder.reload} /> : (
              <DataTable loading={reorder.loading} rows={reorder.data} rowKey="product_id" columns={[
                { key: 'name', header: 'Product', render: (r) => <Link to={`/inventory/${r.product_id}`} className="hover:underline">{r.name}<span className="block text-xs text-ink-3">{r.supplier_name || 'No supplier'}</span></Link> },
                { key: 'stock', header: 'Stock', align: 'right', render: (r) => r.sellable_qty },
                { key: 'cover', header: 'Days left', align: 'right', render: (r) => (r.days_of_cover == null ? '—' : r.days_of_cover) },
                { key: 'suggested_qty', header: 'Order', align: 'right', render: (r) => <span className="font-semibold">{r.suggested_qty}</span> },
              ]} empty={<EmptyState compact title="Nothing to reorder">Stock covers the next 35 days at the current sales rate.</EmptyState>} />
            )
          ) : (
            risk.error ? <ErrorState compact error={risk.error} onRetry={risk.reload} /> : (
              <DataTable loading={risk.loading} rows={risk.data} rowKey="batch_id" columns={[
                { key: 'name', header: 'Batch', render: (r) => <span>{r.name}<span className="code block text-xs text-ink-3">{r.batch_no} · exp {expiryShort(r.expiry_date)}</span></span> },
                { key: 'units', header: 'Unsold at expiry', align: 'right', render: (r) => `${r.units_at_risk} / ${r.quantity}` },
                { key: 'value', header: 'At risk', align: 'right', render: (r) => <span className="font-semibold">{money(r.value_at_risk)}</span> },
              ]} empty={<EmptyState compact title="No expiry risk found" />} />
            )
          )}
        </Panel>
      </div>
    </>
  );
}
