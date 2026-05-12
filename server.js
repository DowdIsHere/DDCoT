const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3001;

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!ANTHROPIC_API_KEY) {
  console.warn('[boot] ANTHROPIC_API_KEY is not set — /api/anthropic will fail until configured.');
}
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('[boot] SUPABASE_URL / SUPABASE_ANON_KEY not set — auth verification will fail.');
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[boot] SUPABASE_SERVICE_ROLE_KEY not set — credit operations will fail.');
}

const supabaseAuth = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  : null;

// Pricing for Claude Sonnet 4 — used to record per-transform cost
const PRICING = { inputPerMTok: 3, outputPerMTok: 15 };
const costFor = (inputTokens, outputTokens) =>
  (inputTokens / 1_000_000) * PRICING.inputPerMTok +
  (outputTokens / 1_000_000) * PRICING.outputPerMTok;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'build')));

async function requireAuth(req, res, next) {
  if (!supabaseAuth) {
    return res.status(500).json({ error: 'Auth not configured on server' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Sign in required' });
  }

  const { data, error } = await supabaseAuth.auth.getUser(token);
  if (error || !data?.user) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  req.user = data.user;
  next();
}

// GET /api/credits — return the signed-in user's current balance
app.get('/api/credits', requireAuth, async (req, res) => {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Server not configured' });
  }
  const { data, error } = await supabaseAdmin
    .from('credits')
    .select('balance, overage_limit')
    .eq('user_id', req.user.id)
    .single();

  if (error) {
    console.error('credits lookup error:', error);
    return res.status(500).json({ error: 'Failed to read credits' });
  }
  res.json({ balance: data.balance, overage_limit: data.overage_limit });
});

app.post('/api/anthropic', requireAuth, async (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'Anthropic API key not configured on server' });
  }
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Server not configured' });
  }

  // Atomically check + decrement credit. If user has hit the overage floor, reject.
  const { data: creditData, error: creditError } = await supabaseAdmin
    .rpc('use_credit', { p_user_id: req.user.id });

  if (creditError) {
    console.error('use_credit error:', creditError);
    return res.status(500).json({ error: 'Credit check failed' });
  }

  const row = Array.isArray(creditData) ? creditData[0] : creditData;
  if (!row?.ok) {
    return res.status(402).json({
      error: 'Out of credits — please purchase more to continue',
      balance: row?.new_balance ?? 0
    });
  }

  let anthropicResponse;
  try {
    anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(req.body)
    });
  } catch (error) {
    console.error('Anthropic fetch error:', error);
    await supabaseAdmin.rpc('refund_credit', { p_user_id: req.user.id });
    return res.status(502).json({ error: 'Failed to reach Anthropic API' });
  }

  const data = await anthropicResponse.json();

  if (!anthropicResponse.ok) {
    // Refund the credit since the user got no usable output
    await supabaseAdmin.rpc('refund_credit', { p_user_id: req.user.id });
    return res.status(anthropicResponse.status).json(data);
  }

  // Log the transform with actual token usage from Anthropic
  const usage = data.usage || {};
  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  const cost = costFor(inputTokens, outputTokens);

  await supabaseAdmin.from('transforms').insert({
    user_id: req.user.id,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: cost,
    profile_name: req.body?.profile_name || null
  });

  res.json({ ...data, balance: row.new_balance });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
