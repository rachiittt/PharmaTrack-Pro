'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { requireAuth } = require('./middleware/auth');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { teamRouter } = require('./routes/team');
const { aiRouter } = require('./routes/ai');

/**
 * The backend handles only what cannot run safely in the browser:
 *   - staff invitations (Supabase Auth admin API, service-role key)
 *   - AI features (Anthropic API key, quotas, output validation)
 * Every other read/write goes from the client straight to Supabase, where
 * RLS policies and SECURITY DEFINER RPCs are the enforcement layer.
 *
 * Dependencies are injected so tests can run without network services.
 */
function createApp({ config, supabase, anthropic = null }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors({ origin: config.FRONTEND_URL.split(',').map((s) => s.trim()), credentials: false }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', ai: Boolean(anthropic), time: new Date().toISOString() });
  });

  const limiter = rateLimit({
    windowMs: 60 * 1000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false,
    message: { error: 'Too many requests. Please slow down.', code: 'RATE_LIMIT' },
  });
  const aiLimiter = rateLimit({
    windowMs: 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false,
    keyGenerator: (req) => req.user?.id ?? req.ip,
    message: { error: 'Too many assistant requests. Wait a minute and try again.', code: 'RATE_LIMIT' },
  });

  const pharmacy = express.Router({ mergeParams: true });
  pharmacy.use('/members', teamRouter({ supabase, config }));
  pharmacy.use('/ai', aiLimiter, aiRouter({ supabase, config, anthropic }));

  app.use('/api/pharmacies/:pharmacyId', limiter, requireAuth(supabase), pharmacy);

  app.use('/api', notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
