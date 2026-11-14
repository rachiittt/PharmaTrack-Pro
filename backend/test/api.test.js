'use strict';

// Backend tests with injected fakes for Supabase and Anthropic — no network.
// Database behaviour (RLS, RPCs) is tested separately in supabase/tests.

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { loadConfig } = require('../src/config');
const { askAssistant } = require('../src/services/ai/assistant');
const { runTool } = require('../src/services/ai/tools');
const { buildDraft, normalizeExpiry, normalizeDate } = require('../src/services/ai/invoiceExtraction');

const PHARMACY = '11111111-1111-4111-8111-111111111111';
const config = loadConfig({
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key-0123456789abcdef',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key-0123456789abcdef',
  NODE_ENV: 'test',
});

/** Minimal PostgREST-style query builder that resolves to a canned result. */
function query(result, calls) {
  const q = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'then') return (res, rej) => Promise.resolve(result()).then(res, rej);
      return (...args) => { calls?.push([prop, ...args]); return q; };
    },
  });
  return q;
}

function fakeSupabase({ role = 'owner', tables = {} } = {}) {
  const inserts = [];
  const userDb = {
    from: (table) => query(() => {
      if (table === 'pharmacy_members') {
        return { data: role ? { role, branch_id: null, is_active: true, pharmacies: { status: 'active' } } : null, error: null };
      }
      return { data: tables[table] ?? null, error: null };
    }),
    rpc: async () => ({ data: null, error: null }),
  };
  const admin = {
    auth: {
      getUser: async (token) => (token === 'valid-token'
        ? { data: { user: { id: 'user-1', email: 'u@test' } }, error: null }
        : { data: { user: null }, error: { message: 'invalid JWT' } }),
      admin: {
        inviteUserByEmail: async (email) => ({ data: { user: { id: 'new-user', email } }, error: null }),
        createUser: async ({ email }) => ({ data: { user: { id: 'new-user', email } }, error: null }),
      },
    },
    from: (table) => {
      const calls = [];
      return query(() => {
        const insert = calls.find((c) => c[0] === 'insert');
        if (insert) inserts.push([table, insert[1]]);
        if (table === 'profiles') return { data: null, error: null };
        if (table === 'pharmacy_members' && !insert) return { data: null, error: null };
        if (table === 'pharmacy_members') return { data: { id: 'm1', ...insert[1] }, error: null };
        return { data: null, error: null, count: 0 };
      }, calls);
    },
  };
  return { admin, forUser: () => userDb, inserts };
}

async function withServer(app, fn) {
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { return await fn(base); } finally { server.closeAllConnections(); server.close(); }
}

const post = (url, body, token = 'valid-token') => fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
  body: JSON.stringify(body),
});

describe('configuration', () => {
  test('rejects missing Supabase credentials', () => {
    assert.throws(() => loadConfig({}), /SUPABASE_URL/);
  });
  test('treats an empty ANTHROPIC_API_KEY as not configured', () => {
    const c = loadConfig({ ...config, ANTHROPIC_API_KEY: '' });
    assert.equal(c.ANTHROPIC_API_KEY, undefined);
  });
});

describe('authentication and roles', () => {
  test('health check is public', async () => {
    await withServer(createApp({ config, supabase: fakeSupabase() }), async (base) => {
      const res = await fetch(`${base}/api/health`);
      assert.equal(res.status, 200);
    });
  });

  test('requests without a token are rejected', async () => {
    await withServer(createApp({ config, supabase: fakeSupabase() }), async (base) => {
      const res = await post(`${base}/api/pharmacies/${PHARMACY}/members`, {}, null);
      assert.equal(res.status, 401);
    });
  });

  test('the old demo token no longer grants access', async () => {
    await withServer(createApp({ config, supabase: fakeSupabase() }), async (base) => {
      const res = await post(`${base}/api/pharmacies/${PHARMACY}/members`, {}, 'demo_token_123');
      assert.equal(res.status, 401);
    });
  });

  test('non-members get 403', async () => {
    await withServer(createApp({ config, supabase: fakeSupabase({ role: null }) }), async (base) => {
      const res = await post(`${base}/api/pharmacies/${PHARMACY}/members`, { email: 'a@b.co', full_name: 'Ann', role: 'cashier' });
      assert.equal(res.status, 403);
    });
  });

  test('only owners can invite staff', async () => {
    await withServer(createApp({ config, supabase: fakeSupabase({ role: 'manager' }) }), async (base) => {
      const res = await post(`${base}/api/pharmacies/${PHARMACY}/members`, { email: 'a@b.co', full_name: 'Ann', role: 'cashier' });
      assert.equal(res.status, 403);
    });
  });

  test('invalid pharmacy ids are rejected', async () => {
    await withServer(createApp({ config, supabase: fakeSupabase() }), async (base) => {
      const res = await post(`${base}/api/pharmacies/not-a-uuid/members`, {});
      assert.equal(res.status, 400);
    });
  });
});

describe('staff invitations', () => {
  test('owners cannot invite another owner through the API', async () => {
    await withServer(createApp({ config, supabase: fakeSupabase() }), async (base) => {
      const res = await post(`${base}/api/pharmacies/${PHARMACY}/members`, { email: 'a@b.co', full_name: 'Ann', role: 'owner' });
      assert.equal(res.status, 400);
      assert.equal((await res.json()).code, 'VALIDATION_ERROR');
    });
  });

  test('an owner invites a cashier; membership and audit rows are written', async () => {
    const supabase = fakeSupabase();
    await withServer(createApp({ config, supabase }), async (base) => {
      const res = await post(`${base}/api/pharmacies/${PHARMACY}/members`, { email: 'New@Shop.in', full_name: 'Nina', role: 'cashier' });
      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.invited, true);
      assert.equal(body.member.profile.email, 'new@shop.in');
    });
    const tables = supabase.inserts.map(([t]) => t);
    assert.deepEqual(tables, ['pharmacy_members', 'audit_logs']);
    assert.equal(supabase.inserts[0][1].role, 'cashier');
    assert.equal(supabase.inserts[0][1].pharmacy_id, PHARMACY);
  });
});

describe('AI endpoints', () => {
  test('return 503 when no Anthropic key is configured', async () => {
    await withServer(createApp({ config, supabase: fakeSupabase() }), async (base) => {
      const res = await post(`${base}/api/pharmacies/${PHARMACY}/ai/ask`, { question: 'What is low on stock?' });
      assert.equal(res.status, 503);
      assert.equal((await res.json()).code, 'AI_NOT_CONFIGURED');
    });
  });

  test('cashiers cannot use the assistant', async () => {
    await withServer(createApp({ config, supabase: fakeSupabase({ role: 'cashier' }), anthropic: {} }), async (base) => {
      const res = await post(`${base}/api/pharmacies/${PHARMACY}/ai/ask`, { question: 'What is low on stock?' });
      assert.equal(res.status, 403);
    });
  });

  test('invoice files must belong to the caller\'s pharmacy', async () => {
    await withServer(createApp({ config, supabase: fakeSupabase(), anthropic: {} }), async (base) => {
      const res = await post(`${base}/api/pharmacies/${PHARMACY}/ai/invoice-extract`, { file_path: 'other-pharmacy/inv.pdf' });
      assert.equal(res.status, 403);
    });
  });
});

describe('assistant tool loop', () => {
  function fakeClient(responses) {
    const requests = [];
    return {
      requests,
      beta: { messages: { create: async (req) => { requests.push(structuredClone(req)); return responses.shift(); } } },
    };
  }

  test('runs tools with the caller\'s database client and returns the final answer', async () => {
    const rpcCalls = [];
    const db = {
      rpc: async (fn, args) => {
        rpcCalls.push([fn, args]);
        return { data: { thresholds: {}, expired: [], expiring_critical: [], expiring_warning: [], low_stock: [{ name: 'Dolo 650', sellable_qty: 3, min_stock_level: 40, secret: 'x' }], out_of_stock: [], slow_moving: [], dead_stock: [] }, error: null };
      },
    };
    const client = fakeClient([
      { stop_reason: 'tool_use', usage: { input_tokens: 10, output_tokens: 5 },
        content: [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'tool_use', id: 't1', name: 'get_stock_alerts', input: {} }] },
      { stop_reason: 'end_turn', usage: { input_tokens: 20, output_tokens: 8 }, content: [{ type: 'text', text: 'Dolo 650 is low (3 left).' }] },
    ]);
    const out = await askAssistant({ client, model: 'claude-opus-5-5', db, ctx: { pharmacyId: PHARMACY, branchId: null }, question: 'What is low?' });
    assert.equal(out.answer, 'Dolo 650 is low (3 left).');
    assert.deepEqual(out.toolsUsed, ['get_stock_alerts']);
    assert.equal(rpcCalls[0][0], 'stock_alerts');
    assert.equal(rpcCalls[0][1].p_pharmacy_id, PHARMACY);
    // Assistant turn is passed back unchanged, tool results follow in one user message.
    const second = client.requests[1].messages;
    assert.equal(second[1].content[0].type, 'thinking');
    assert.equal(second[2].content[0].type, 'tool_result');
    assert.ok(!second[2].content[0].content.includes('secret'), 'only whitelisted fields reach the model');
    assert.equal(client.requests[0].model, 'claude-opus-5-5');
    assert.equal(client.requests[0].tool_choice.type, 'auto');
    assert.deepEqual(out.usage, { input_tokens: 30, output_tokens: 13 });
  });

  test('refusals become a scoped explanation, not an error', async () => {
    const client = fakeClient([{ stop_reason: 'refusal', content: [], usage: {} }]);
    const out = await askAssistant({ client, model: 'm', db: {}, ctx: { pharmacyId: PHARMACY }, question: 'What dose of X should I take?' });
    assert.equal(out.status, 'rejected');
    assert.match(out.answer, /pharmacist or doctor/);
  });

  test('invalid or unknown tool calls are returned to the model as errors', async () => {
    const bad = await runTool({}, { pharmacyId: PHARMACY }, 'get_sales_summary', { days: 9999 });
    assert.equal(bad.isError, true);
    const unknown = await runTool({}, { pharmacyId: PHARMACY }, 'adjust_stock', {});
    assert.equal(unknown.isError, true);
  });

  test('sales summary never forwards customer names', async () => {
    const db = { rpc: async () => ({ data: { today: {}, recent_sales: [{ customer_name: 'Anita' }] }, error: null }) };
    const out = await runTool(db, { pharmacyId: PHARMACY }, 'get_sales_summary', { days: 30 });
    assert.ok(!out.content.includes('Anita'));
  });
});

describe('invoice draft building', () => {
  test('normalises printed expiry formats to the last day of the month', () => {
    assert.equal(normalizeExpiry('08/27'), '2027-08-31');
    assert.equal(normalizeExpiry('2/2028'), '2028-02-29');
    assert.equal(normalizeExpiry('AUG-27'), '2027-08-31');
    assert.equal(normalizeExpiry('2027-06'), '2027-06-30');
    assert.equal(normalizeExpiry('2027-06-15'), '2027-06-15');
    assert.equal(normalizeExpiry('13/27'), null);
    assert.equal(normalizeExpiry('soon'), null);
    assert.equal(normalizeDate('05/11/2026'), '2026-11-05');
  });

  test('matches catalogue products and flags lines that need review', () => {
    const draft = buildDraft({
      supplier_name: 'Metro', supplier_gstin: null, invoice_no: 'A-1', invoice_date: '2026-11-01',
      lines: [
        { product_name: 'DOLO 650 TAB', batch_no: 'B1', expiry: '09/27', quantity: 10, free_quantity: null, purchase_price: 20, mrp: 30, gst_rate: 12 },
        { product_name: 'Unknown Syrup', batch_no: null, expiry: '01/20', quantity: null, free_quantity: null, purchase_price: 50, mrp: 40, gst_rate: 7 },
      ],
    }, [{ id: 'p1', name: 'Dolo 650 Tablet' }], new Date('2026-11-14'));
    assert.equal(draft.requires_review, true);
    assert.equal(draft.lines[0].product_id, 'p1');
    assert.deepEqual(draft.lines[0].warnings, []);
    const w = draft.lines[1].warnings.join(' | ');
    for (const expected of ['No matching product', 'Batch number missing', 'Already expired', 'Quantity missing', 'higher than MRP']) {
      assert.match(w, new RegExp(expected));
    }
    assert.equal(draft.lines[1].gst_rate, null);
  });
});

before(() => {});
after(() => {});
