const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');

const app = express();
const PORT = process.env.PORT || 3001;

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const FREE_MODE = process.env.FREE_MODE === 'true';

if (!ANTHROPIC_API_KEY) {
  console.warn('[boot] ANTHROPIC_API_KEY is not set — /api/anthropic will fail until configured.');
}
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('[boot] SUPABASE_URL / SUPABASE_ANON_KEY not set — auth verification will fail.');
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[boot] SUPABASE_SERVICE_ROLE_KEY not set — credit operations will fail.');
}
if (!STRIPE_SECRET_KEY) {
  console.warn('[boot] STRIPE_SECRET_KEY not set — checkout endpoints will fail.');
}
if (!STRIPE_WEBHOOK_SECRET) {
  console.warn('[boot] STRIPE_WEBHOOK_SECRET not set — webhook signature verification will fail.');
}
if (FREE_MODE) {
  console.log('[boot] FREE_MODE enabled — credit checks bypassed, no charges, no buy-credits UI.');
}

const supabaseAuth = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  : null;

const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

// Credit pack catalog. Stripe Price IDs come from the dashboard (env vars).
const PACKS = {
  starter:  { priceId: process.env.STRIPE_PRICE_STARTER,  credits: 50,  label: 'Starter'  },
  standard: { priceId: process.env.STRIPE_PRICE_STANDARD, credits: 200, label: 'Standard' },
  pro:      { priceId: process.env.STRIPE_PRICE_PRO,      credits: 700, label: 'Pro'      },
};

// Pricing for Claude Sonnet 4 — used to record per-transform cost
const PRICING = { inputPerMTok: 3, outputPerMTok: 15 };
const costFor = (inputTokens, outputTokens) =>
  (inputTokens / 1_000_000) * PRICING.inputPerMTok +
  (outputTokens / 1_000_000) * PRICING.outputPerMTok;

// ── Stripe webhook MUST receive the raw body for signature verification.
// Mount it BEFORE express.json() so the JSON parser doesn't consume the body.
app.post('/api/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    return res.status(500).send('Stripe webhook not configured');
  }

  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata?.user_id;
    const credits = parseInt(session.metadata?.credits || '0', 10);

    if (!userId || !credits) {
      console.error('Webhook missing user_id or credits in metadata:', session.id);
      return res.status(400).send('Missing metadata');
    }

    if (!supabaseAdmin) {
      console.error('supabaseAdmin not configured — cannot grant credits');
      return res.status(500).send('Server misconfigured');
    }

    const { error } = await supabaseAdmin.rpc('grant_credits', {
      p_user_id: userId,
      p_amount: credits
    });

    if (error) {
      console.error('grant_credits failed for session', session.id, error);
      // Return 500 so Stripe retries delivery
      return res.status(500).send('Failed to grant credits');
    }

    console.log(`[stripe] Granted ${credits} credits to user ${userId} (session ${session.id})`);
  }

  res.json({ received: true });
});

// Now mount JSON parser for the rest of the routes
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
  if (FREE_MODE) {
    return res.json({ free_mode: true, balance: null, overage_limit: null });
  }
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

// GET /api/packs — return the public pack catalog for the UI
app.get('/api/packs', (req, res) => {
  if (FREE_MODE) {
    return res.json({ free_mode: true });
  }
  res.json({
    starter:  { credits: PACKS.starter.credits,  price: '$9.99',  label: 'Starter'  },
    standard: { credits: PACKS.standard.credits, price: '$29.99', label: 'Standard', popular: true },
    pro:      { credits: PACKS.pro.credits,      price: '$79.99', label: 'Pro'      },
  });
});

// POST /api/checkout — create a Stripe Checkout session for a pack
app.post('/api/checkout', requireAuth, async (req, res) => {
  if (!stripe) {
    return res.status(500).json({ error: 'Stripe not configured on server' });
  }

  const { pack } = req.body || {};
  const config = PACKS[pack];
  if (!config) {
    return res.status(400).json({ error: 'Invalid pack' });
  }
  if (!config.priceId) {
    return res.status(500).json({ error: `Stripe price ID for "${pack}" not configured` });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{ price: config.priceId, quantity: 1 }],
      success_url: `${APP_URL}/?checkout=success`,
      cancel_url: `${APP_URL}/?checkout=cancel`,
      customer_email: req.user.email,
      metadata: {
        user_id: req.user.id,
        credits: String(config.credits),
        pack
      },
      // Make this visible to Stripe in receipts
      payment_intent_data: {
        description: `DDCoT — ${config.label} pack (${config.credits} credits)`
      }
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

app.post('/api/anthropic', requireAuth, async (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'Anthropic API key not configured on server' });
  }
  if (!FREE_MODE && !supabaseAdmin) {
    return res.status(500).json({ error: 'Server not configured' });
  }

  // Credit gate: skip entirely in FREE_MODE.
  let newBalance = null;
  if (!FREE_MODE) {
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
    newBalance = row.new_balance;
  }

  const { profile_name, ...anthropicBody } = req.body || {};

  let anthropicResponse;
  try {
    anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(anthropicBody)
    });
  } catch (error) {
    console.error('Anthropic fetch error:', error);
    if (!FREE_MODE) {
      await supabaseAdmin.rpc('refund_credit', { p_user_id: req.user.id });
    }
    return res.status(502).json({ error: 'Failed to reach Anthropic API' });
  }

  const data = await anthropicResponse.json();

  if (!anthropicResponse.ok) {
    if (!FREE_MODE) {
      await supabaseAdmin.rpc('refund_credit', { p_user_id: req.user.id });
    }
    return res.status(anthropicResponse.status).json(data);
  }

  // Always log the transform for cost/abuse monitoring, even in FREE_MODE.
  if (supabaseAdmin) {
    const usage = data.usage || {};
    const inputTokens = usage.input_tokens || 0;
    const outputTokens = usage.output_tokens || 0;
    const cost = costFor(inputTokens, outputTokens);

    await supabaseAdmin.from('transforms').insert({
      user_id: req.user.id,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: cost,
      profile_name: profile_name || null
    });
  }

  res.json({ ...data, balance: newBalance });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
