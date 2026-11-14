'use strict';

const { anthropicTools, runTool } = require('./tools');

const SYSTEM_PROMPT = `You are the inventory and business assistant inside PharmaTrack Pro, a pharmacy management system used by pharmacy owners and staff in India.

You answer questions about this pharmacy's own operations: stock levels, expiry, reordering, purchases and sales performance. Use the tools to fetch live figures before answering, and base every number you state on tool results from this conversation. If the tools do not contain the answer, say what is missing instead of estimating.

Scope you must keep:
- You do not give medical advice. Do not diagnose, recommend treatments or dosages, assess drug interactions, or suggest substituting one medicine for another. If asked, say that this needs a registered pharmacist or doctor, and offer help with the stock side instead (for example, whether an item is in stock).
- You cannot change anything. Reorder quantities and write-offs are suggestions for a person to review and act on in the app; never say you have placed an order or adjusted stock.

Style: lead with the direct answer, then the supporting figures. Use short markdown tables for lists of products. Amounts are Indian Rupees (₹). Keep answers brief.`;

const MAX_TOOL_ROUNDS = 6;

/**
 * Runs the tool-use loop for one question.
 * @param {object} deps.client   Anthropic SDK client
 * @param {object} deps.db       caller-scoped Supabase client (RLS applies)
 * @param {object} deps.ctx      { pharmacyId, branchId }
 */
async function askAssistant({ client, model, db, ctx, question }) {
  const messages = [{ role: 'user', content: question }];
  const toolsUsed = [];
  const usage = { input_tokens: 0, output_tokens: 0 };

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
    const response = await client.beta.messages.create({
      model,
      max_tokens: 8000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      system: SYSTEM_PROMPT,
      tools: anthropicTools(),
      tool_choice: { type: 'auto' },
      messages,
    });

    usage.input_tokens += response.usage?.input_tokens ?? 0;
    usage.output_tokens += response.usage?.output_tokens ?? 0;

    if (response.stop_reason === 'refusal') {
      return {
        answer: 'I can only help with this pharmacy\'s stock, purchases and sales. For anything clinical, please consult a registered pharmacist or doctor.',
        toolsUsed, usage, status: 'rejected',
      };
    }

    if (response.stop_reason !== 'tool_use') {
      const answer = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      const truncated = response.stop_reason === 'max_tokens';
      return {
        answer: answer || 'I could not produce an answer for that question.',
        toolsUsed, usage, status: 'ok', truncated,
      };
    }

    // Keep the full assistant turn (thinking + tool_use blocks) unchanged.
    messages.push({ role: 'assistant', content: response.content });
    const calls = response.content.filter((b) => b.type === 'tool_use');
    const results = await Promise.all(calls.map(async (call) => {
      toolsUsed.push(call.name);
      const out = await runTool(db, ctx, call.name, call.input);
      return { type: 'tool_result', tool_use_id: call.id, content: out.content, is_error: out.isError };
    }));
    messages.push({ role: 'user', content: results });
  }

  return {
    answer: 'That question needed more lookups than I can run at once. Try asking about one thing at a time.',
    toolsUsed, usage, status: 'error',
  };
}

module.exports = { askAssistant, SYSTEM_PROMPT };
