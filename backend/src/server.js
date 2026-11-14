'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const { loadConfig } = require('./config');
const { createSupabaseFactory } = require('./lib/supabase');
const { createApp } = require('./app');

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(`\n${err.message}\n`);
  process.exit(1);
}

const supabase = createSupabaseFactory(config);
const anthropic = config.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: config.ANTHROPIC_API_KEY }) : null;
const app = createApp({ config, supabase, anthropic });

const server = app.listen(config.PORT, async () => {
  console.log(`PharmaTrack Pro API listening on :${config.PORT} (${config.NODE_ENV})`);
  console.log(`  CORS origin: ${config.FRONTEND_URL}`);
  console.log(`  AI features: ${anthropic ? `enabled (${config.AI_MODEL})` : 'disabled — set ANTHROPIC_API_KEY to enable'}`);
  const { error } = await supabase.admin.from('pharmacies').select('id', { head: true, count: 'exact' });
  console.log(error
    ? `  Supabase: NOT reachable or migrations missing — ${error.message}`
    : '  Supabase: connected');
});

server.on('error', (err) => {
  console.error(err.code === 'EADDRINUSE' ? `Port ${config.PORT} is already in use.` : err);
  process.exit(1);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
