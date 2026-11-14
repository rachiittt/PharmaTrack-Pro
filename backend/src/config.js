'use strict';

require('dotenv').config();
const { z } = require('zod');

/**
 * Environment configuration, validated once at startup.
 * Secrets (service-role key, Anthropic key) live only here, on the server.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5001),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  ANTHROPIC_API_KEY: z.string().optional().transform((v) => (v && v.trim() ? v.trim() : undefined)),
  AI_MODEL: z.string().default('claude-opus-5-5'),
  AI_DAILY_LIMIT_PER_PHARMACY: z.coerce.number().int().positive().default(200),
});

function loadConfig(env = process.env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ');
    throw new Error(`Invalid backend configuration:\n  ${missing}\nSee backend/.env.example.`);
  }
  return Object.freeze(parsed.data);
}

module.exports = { loadConfig };
