import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

// The 27 CBI Profiles - Robert's actual mappings
const PROFILES = {
  // Concrete + Past
  SHARP: { spatial: [0, 33], temporal: [0, 33], reference: [67, 100],
    description: "Concrete • Past • Self" },
  SEASONED: { spatial: [0, 33], temporal: [0, 33], reference: [34, 66],
    description: "Concrete • Past • Balanced" },
  LEGACY: { spatial: [0, 33], temporal: [0, 33], reference: [0, 33],
    description: "Concrete • Past • Other" },

  // Concrete + Present
  EMBODIED: { spatial: [0, 33], temporal: [34, 66], reference: [67, 100],
    description: "Concrete • Present • Self" },
  GROUNDED: { spatial: [0, 33], temporal: [34, 66], reference: [34, 66],
    description: "Concrete • Present • Balanced" },
  ATTUNED: { spatial: [0, 33], temporal: [34, 66], reference: [0, 33],
    description: "Concrete • Present • Other" },

  // Concrete + Future
  INTENTIONAL: { spatial: [0, 33], temporal: [67, 100], reference: [67, 100],
    description: "Concrete • Future • Self" },
  RESILIENT: { spatial: [0, 33], temporal: [67, 100], reference: [34, 66],
    description: "Concrete • Future • Balanced" },
  RELIABLE: { spatial: [0, 33], temporal: [67, 100], reference: [0, 33],
    description: "Concrete • Future • Other" },

  // Balanced + Past
  INTEGRATED: { spatial: [34, 66], temporal: [0, 33], reference: [67, 100],
    description: "Balanced • Past • Self" },
  COHERENT: { spatial: [34, 66], temporal: [0, 33], reference: [34, 66],
    description: "Balanced • Past • Balanced" },
  RECONCILED: { spatial: [34, 66], temporal: [0, 33], reference: [0, 33],
    description: "Balanced • Past • Other" },

  // Balanced + Present
  CENTERED: { spatial: [34, 66], temporal: [34, 66], reference: [67, 100],
    description: "Balanced • Present • Self" },
  EQUANIMOUS: { spatial: [34, 66], temporal: [34, 66], reference: [34, 66],
    description: "Balanced • Present • Balanced" },
  EMPATHETIC: { spatial: [34, 66], temporal: [34, 66], reference: [0, 33],
    description: "Balanced • Present • Other" },

  // Balanced + Future
  ACTUALIZED: { spatial: [34, 66], temporal: [67, 100], reference: [67, 100],
    description: "Balanced • Future • Self" },
  HARMONIOUS: { spatial: [34, 66], temporal: [67, 100], reference: [34, 66],
    description: "Balanced • Future • Balanced" },
  COLLABORATIVE: { spatial: [34, 66], temporal: [67, 100], reference: [0, 33],
    description: "Balanced • Future • Other" },

  // Abstract + Past
  SENTIMENTAL: { spatial: [67, 100], temporal: [0, 33], reference: [67, 100],
    description: "Abstract • Past • Self" },
  REFLECTIVE: { spatial: [67, 100], temporal: [0, 33], reference: [34, 66],
    description: "Abstract • Past • Balanced" },
  IDEALIZED: { spatial: [67, 100], temporal: [0, 33], reference: [0, 33],
    description: "Abstract • Past • Other" },

  // Abstract + Present
  INTROSPECTIVE: { spatial: [67, 100], temporal: [34, 66], reference: [67, 100],
    description: "Abstract • Present • Self" },
  MINDFUL: { spatial: [67, 100], temporal: [34, 66], reference: [34, 66],
    description: "Abstract • Present • Balanced" },
  INTUITIVE: { spatial: [67, 100], temporal: [34, 66], reference: [0, 33],
    description: "Abstract • Present • Other" },

  // Abstract + Future
  VISIONARY: { spatial: [67, 100], temporal: [67, 100], reference: [67, 100],
    description: "Abstract • Future • Self" },
  FORESIGHTED: { spatial: [67, 100], temporal: [67, 100], reference: [34, 66],
    description: "Abstract • Future • Balanced" },
  ALTRUISTIC: { spatial: [67, 100], temporal: [67, 100], reference: [0, 33],
    description: "Abstract • Future • Other" },
};

// Gradient labels
const GRADIENT_LABELS = {
  spatial: { low: "Concrete", mid: "Balanced", high: "Abstract" },
  temporal: { low: "Past", mid: "Present", high: "Future" },
  reference: { low: "Other", mid: "Balanced", high: "Self" }
};

// Claude Sonnet 4 pricing (USD per million tokens)
const PRICING = {
  inputPerMTok: 3,
  outputPerMTok: 15,
};

// Rough token estimate: ~4 chars/token for English prose.
const estimateTokens = (text) => Math.ceil((text || '').length / 4);

const formatCost = (usd) => {
  if (usd < 0.01) return `<$0.01`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
};

const costFor = (inputTokens, outputTokens) =>
  (inputTokens / 1_000_000) * PRICING.inputPerMTok +
  (outputTokens / 1_000_000) * PRICING.outputPerMTok;

function CognitiveModifier() {
  const [spatial, setSpatial] = useState(50);
  const [temporal, setTemporal] = useState(50);
  const [reference, setReference] = useState(50);
  const [inputText, setInputText] = useState('');
  const [modifiedText, setModifiedText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [changes, setChanges] = useState([]);
  const [error, setError] = useState('');
  const [lastUsage, setLastUsage] = useState(null);
  const [sessionUsage, setSessionUsage] = useState({ inputTokens: 0, outputTokens: 0, calls: 0 });

  // Auth + credits
  const [session, setSession] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [balance, setBalance] = useState(null);
  const [overageLimit, setOverageLimit] = useState(-5);
  const [freeMode, setFreeMode] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authMode, setAuthMode] = useState('signin'); // 'signin' | 'signup'
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState('');
  const [packs, setPacks] = useState(null);
  const [checkoutBusy, setCheckoutBusy] = useState(null);
  const [checkoutMessage, setCheckoutMessage] = useState('');

  const fetchBalance = useCallback(async (accessToken) => {
    if (!accessToken) return;
    try {
      const res = await fetch('/api/credits', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.free_mode) {
          setFreeMode(true);
          setBalance(null);
        } else {
          setFreeMode(false);
          setBalance(data.balance);
          setOverageLimit(data.overage_limit ?? -5);
        }
      }
    } catch (e) {
      // network blip — leave existing balance, don't surface
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setAuthChecked(true);
      if (s?.access_token) fetchBalance(s.access_token);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.access_token) fetchBalance(s.access_token);
      else setBalance(null);
    });

    // Fetch pack catalog (public endpoint). Ignore in free mode.
    fetch('/api/packs')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        if (data.free_mode) setPacks(null);
        else setPacks(data);
      })
      .catch(() => {});

    // Handle return from Stripe checkout
    const params = new URLSearchParams(window.location.search);
    const checkoutStatus = params.get('checkout');
    if (checkoutStatus === 'success') {
      setCheckoutMessage('Payment received — credits will appear momentarily.');
      // Refresh balance a few times; webhook may take a second to land
      const refresh = (delay) => setTimeout(async () => {
        const { data: { session: s } } = await supabase.auth.getSession();
        if (s?.access_token) fetchBalance(s.access_token);
      }, delay);
      refresh(500); refresh(2000); refresh(5000);
      window.history.replaceState({}, '', window.location.pathname);
    } else if (checkoutStatus === 'cancel') {
      setCheckoutMessage('Checkout canceled — no charge.');
      window.history.replaceState({}, '', window.location.pathname);
    }

    return () => subscription.unsubscribe();
  }, [fetchBalance]);

  const handleBuyPack = async (packKey) => {
    if (!session?.access_token) return;
    setCheckoutBusy(packKey);
    setCheckoutMessage('');
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ pack: packKey })
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error || 'Checkout failed');
      }
      window.location.href = data.url;
    } catch (err) {
      setCheckoutMessage(err.message || 'Checkout failed');
      setCheckoutBusy(null);
    }
  };

  const handleSignIn = async (e) => {
    e?.preventDefault();
    setAuthBusy(true);
    setAuthMessage('');
    const { error: authErr } = authMode === 'signup'
      ? await supabase.auth.signUp({ email: authEmail, password: authPassword })
      : await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
    setAuthBusy(false);
    if (authErr) {
      setAuthMessage(authErr.message);
    } else if (authMode === 'signup') {
      setAuthMessage('Check your email to confirm your account, then sign in.');
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setBalance(null);
  };

  // Find matching profile
  const matchedProfile = useMemo(() => {
    for (const [name, config] of Object.entries(PROFILES)) {
      const spatialMatch = spatial >= config.spatial[0] && spatial <= config.spatial[1];
      const temporalMatch = temporal >= config.temporal[0] && temporal <= config.temporal[1];
      const referenceMatch = reference >= config.reference[0] && reference <= config.reference[1];

      if (spatialMatch && temporalMatch && referenceMatch) {
        return { name, ...config };
      }
    }
    return null;
  }, [spatial, temporal, reference]);

  const getPositionLabel = (value, gradient) => {
    const labels = GRADIENT_LABELS[gradient];
    if (value <= 33) return labels.low;
    if (value <= 66) return labels.mid;
    return labels.high;
  };

  const getProfileColor = (name) => {
    const profile = PROFILES[name];
    if (!profile) return '#666';
    if (profile.spatial[1] <= 33) return '#22c55e';
    if (profile.spatial[0] >= 67) return '#a855f7';
    return '#3b82f6';
  };

  // Build the transformation prompt
  const buildTransformationPrompt = (content, targetProfile, spatialScore, temporalScore, referenceScore) => {
    const spatialLabel = getPositionLabel(spatialScore, 'spatial');
    const temporalLabel = getPositionLabel(temporalScore, 'temporal');
    const referenceLabel = getPositionLabel(referenceScore, 'reference');

    return `You are a Cognitive Architecture Information Modifier operating in TRANSLATE mode. Your job is to re-voice an existing source so it reads in the cognitive register that best fits this reader.

TARGET PROFILE: ${targetProfile}
- Spatial Processing: ${spatialLabel} (${spatialScore}/100)
- Temporal Processing: ${temporalLabel} (${temporalScore}/100)
- Reference Processing: ${referenceLabel} (${referenceScore}/100)

ROLE — TRANSLATOR, NOT AUTHOR:
- You translate. You do not draft, author, or supply content of your own.
- If the source asserts it, you may assert it in the target voice. If the source does NOT assert it, treat it as unknown — do not assume it, imply it as fact, or invent it.
- This applies to the reader too: their memories, sensations, reactions, actions, and history are NOT in the source unless the source states them. Do not manufacture them.
- Every assumption you add is a liability. When in doubt, under-translate — omitting is recoverable, inventing is not.
- The register rules below describe VOICE ONLY (tense, distance, structure, word choice). They never license new content. Where a rule asks for material the source does not contain, satisfy it in framing, not in fact — or drop it.
- OMIT COGNITION — the master rule. The target profile models HOW a mind processes: its cognition. The register gives you the FORM of that cognition (tense, distance, structure, word choice); it NEVER authorizes you to PERFORM that cognition over the source. Remembering, forecasting, sensing, reacting, perceiving, concluding are acts of the reader's cognition — they are not facts in the source. Render the form; omit the cognition. Every per-profile CRITICAL guard below is one instance of this single rule.
- A faithful translation into a register the source barely supports will read THIN or general — that thinness is correct. It is the visible edge where the source ends and the reader's omitted cognition would begin. Do not fill it. Vagueness that gestures at cognition ("big changes are coming," "you can feel it") is the tell that cognition is being performed where it must be omitted — strip it, do not soften it.

ABSOLUTE INVARIANTS — these override every rule below:
1. You may reorder, reframe, re-voice, shorten, and rephrase. You may NOT introduce any claim, citation, study, statistic, number, finding, source, person, organization, date, place, fact, experience, sensation, or reaction that is not already present in the source content.
2. Words like "proven," "validated," "established," "case studies show," "research has demonstrated," "historically documented" may only be used if the source content itself names the actual proof, study, or history. Never as voice decoration over content that does not contain them.
3. Future-leaning phrases like "this could lead to," "the implications are," and any specific projected outcome or number may only be used to draw out implications the source itself supports. Never invent specific consequences, numbers, or outcomes the source does not contain.
4. If applying a rule below would require adding a claim the source does not contain, drop the rule. Fidelity to the source beats register-matching every time.
5. Voice and framing change. Truth does not.

TRANSFORMATION RULES (voice only — never a license to add content):

${spatialScore <= 33 ? `SPATIAL — CONCRETE (${spatialScore}):
MUST:
- Where the source already names a concrete referent for an abstract label, keep them together (same sentence or the one before).
- Sentences should stand alone with merit — meaning clear without surrounding context.
- Prefer the source's specific objects, questions, and moments over its category names. Surface concreteness already in the source; do not invent objects, scenes, or sensory detail it does not contain.
- Show the actual thing the source describes, not a summary of what it accomplishes.
AVOID:
- Abstract labels floating without their referent (e.g., "pattern recognition," "filters," "synthesis") used as if self-explanatory.
- Category names without the specific instance WHEN the source provides one. If the source is abstract and names no instance, stay abstract rather than inventing one.
- Compressed summaries that name a function instead of the actual thing.
- Metaphors without grounding, and any concrete detail not traceable to the source.
FORMAT: structured prose with clear discrete points. Each paragraph addresses one specific thing.` :
spatialScore >= 67 ? `SPATIAL — ABSTRACT (${spatialScore}):
MUST:
- Lead with the conceptual frameworks and pattern names the source contains.
- Let the source's ideas build on each other across paragraphs; make existing connections explicit with transition words.
- Lead with the principle; example follows only if needed.
- Synthesis and compression are valued — but synthesize only what the source supports. Do not introduce a connecting principle, generalization, or conclusion the source does not make.
AVOID:
- Over-specifying when the pattern is the point.
- Breaking flow with excessive concrete detail.
- Fragmenting connected ideas into discrete points.
- Manufacturing a unifying thesis the source does not assert.
FORMAT: flowing prose where conceptual threads weave together. Ideas build.` :
`SPATIAL — BALANCED (${spatialScore}):
MUST:
- Move between concept and example fluidly, using only the concepts and examples the source provides.
- Abstract labels are acceptable if grounded within two sentences by something the source contains.
- Mix specific instances and pattern names as the source carries them.
AVOID:
- Pure abstraction with no grounding.
- Pure concrete detail with no synthesis.
- Forcing one mode when the other fits the moment better.
- Adding instances or patterns not in the source to achieve the mix.
FORMAT: hybrid prose that moves between concept and example.`}

${temporalScore <= 33 ? `TEMPORAL — PAST (${temporalScore}):
MUST:
- Frame knowledge as already-established and settled rather than speculative. Lead with what the source treats as known.
- Anchor in past tense where the source itself describes something that has already happened.
- Present the source's facts as observed and grounded, not as projections.
- Voice vocabulary (register only, never a claim about the reader): already, established, known, settled, grounded, observed, has shown, as it stands.
- Validation through what the source itself establishes, not invented external proof.
AVOID:
- Future speculation as the primary frame.
- "You might find..." / "You could discover..." as the dominant voice.
- Introducing studies, research, "case studies," or historical sources the original content does not contain. (See invariant #2.)
- Treating new or untested ideas as inherently more valuable than what has been observed.
- CRITICAL — DO NOT attribute any memory, observation, sensation, or past experience to the reader unless the source explicitly states the reader did/saw/felt it. "You remember when...", "you watched...", "you saw...", "you've experienced this before", "when you felt..." assert the reader's personal history. That history is NOT in the source, so inventing it violates invariant #1. These experiential verbs are a CLAIM about the reader, not voice decoration.` :
temporalScore >= 67 ? `TEMPORAL — FUTURE (${temporalScore}):
MUST:
- Where the source ITSELF looks forward or states an implication, render it in forward-leaning voice. Carry the source's own projections; do not generate new ones.
- Future tense is comfortable for framing implications the source itself draws ("You'll find...", "This will...") — never for implications you inferred.
- Voice vocabulary (register only): will, could, might, emerging, becoming, heading toward, trajectory, possibility, potential.
AVOID:
- Over-anchoring in what was when the source is forward-leaning.
- Requiring external proof before engaging with the source's stated implications.
- CRITICAL — DO NOT introduce any outcome, trajectory, consequence, or "where this is heading" — specific OR general — that the source does not itself state. Forecasting is the reader's cognition, not the source's content; OMIT it (see the master rule). This is the forward-time twin of inventing the reader's past. "Implications the source supports" means implications it actually draws, not ones you can infer. A vague forecast ("big changes are coming") is not a lesser crime — it is the tell that you are performing the reader's forecasting where the source is silent; strip it, do not soften it. Future tense is the register's FORM, never a license to forecast. (See invariant #3.)` :
`TEMPORAL — PRESENT (${temporalScore}):
MUST:
- Focus on the current state and immediate reality the source describes.
- What IS, as the source has it — not what was or what might be.
- Balance past reference with present application, both drawn from the source.
- Voice vocabulary (register only): now, currently, today, this moment, right now, as it stands, what's in front of you.
AVOID:
- Over-anchoring in history when the present is the point.
- Over-projecting to the future when "now" is the point.
- Asserting a present circumstance the source does not contain.`}

${referenceScore <= 33 ? `REFERENCE — OTHER (${referenceScore}):
MUST:
- Camera OUTSIDE — frame the source's content in its social and relational dimension where the source carries one.
- Use the social context the source provides as the meaning-maker.
- Third-person feel even when using "you."
AVOID:
- Purely internal experience without social context WHEN the source supplies that context.
- Isolated self-focus when the source is about connection.
- CRITICAL — DO NOT invent others' perceptions, reactions, responses, team dynamics, collaboration, or shared outcomes the source does not contain. If the source names no one else and no reaction, do not add them to achieve a social frame. Others' reactions are claims, not voice.` :
referenceScore >= 67 ? `REFERENCE — SELF (${referenceScore}):
MUST:
- Camera INSIDE the reader's head. Intimate. Close to the skin. Address the reader directly.
- Frame the source's content as it bears on the reader personally — second person, direct, close.
- Where the source itself describes a sensation, action, or experience, render it close to the skin. Where it does not, keep the intimacy in the framing and the direct address — not in invented sensation.
- Personal relevance as the primary filter for what to foreground.
AVOID:
- Distant observational language when the source is interior.
- Framing through how others see the reader (unless the source is about that disconnect).
- Adding personal-application prompts or self-reflection questions the source does not contain.
- CRITICAL — DO NOT invent physical sensations, gut reactions, or bodily actions for the reader ("you felt it in your chest," "your hands did X," "you feel it slam through you") unless the source states them. Intimacy of ADDRESS is allowed; fabricated EXPERIENCE is not. A described sensation is a claim about the reader (invariant #1), not a voice setting.` :
`REFERENCE — BALANCED (${referenceScore}):
MUST:
- Flexible distance — sometimes close, sometimes observational, matching the source's own movement.
- Both internal experience and external impact, only as the source carries them.
- Context-dependent framing.
AVOID:
- Forcing pure intimacy when observation fits.
- Forcing pure distance when intimacy fits.
- Adding interior sensation or external reaction the source does not contain to fill either side.`}

CONTENT TO TRANSLATE:
---
${content}
---

Translate this content into the target cognitive register using the rules above. Restructure, reframe, and rephrase the VOICE — but every fact, claim, number, source, outcome, experience, sensation, and reaction in your output must trace back to the source content. Before any sentence stating that the reader did, saw, felt, or remembered something — or that someone else reacted — confirm the source asserts it; if it does not, cut it. If a rule above would require adding something the source does not contain, drop that rule for that sentence.

Output ONLY the translated content, no explanations or meta-commentary.`;
  };

  // Estimated cost for the next transform (live, before API call)
  const estimatedCost = useMemo(() => {
    if (!inputText.trim()) return null;
    const prompt = buildTransformationPrompt(
      inputText,
      'PREVIEW',
      spatial,
      temporal,
      reference
    );
    const inputTokens = estimateTokens(prompt);
    // Output tokens roughly track input content length; transforms reframe, not summarize.
    const outputTokens = Math.min(estimateTokens(inputText), 8192);
    return {
      inputTokens,
      outputTokens,
      usd: costFor(inputTokens, outputTokens),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputText, spatial, temporal, reference]);

  // Call Claude API via our server (server holds the Anthropic key)
  const transformWithAPI = async () => {
    if (!inputText.trim()) {
      setError('Please enter content to transform');
      return;
    }

    if (!session?.access_token) {
      setError('Please sign in to transform content');
      return;
    }

    setIsLoading(true);
    setError('');
    setChanges([]);

    const prompt = buildTransformationPrompt(
      inputText,
      matchedProfile?.name || 'Unknown',
      spatial,
      temporal,
      reference
    );

    try {
      const response = await fetch('/api/anthropic', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 8192,
          messages: [{ role: 'user', content: prompt }],
          profile_name: matchedProfile?.name || null
        })
      });

      const data = await response.json();

      if (response.status === 402) {
        setError('Out of credits — buy more to keep transforming.');
        if (typeof data.balance === 'number') setBalance(data.balance);
        return;
      }
      if (response.status === 401) {
        setError('Your session expired — please sign in again.');
        return;
      }
      if (!response.ok) {
        throw new Error(data.error?.message || data.error || `API error: ${response.status}`);
      }

      const transformedContent = data.content[0].text;
      const usage = data.usage || {};
      const inputTokens = usage.input_tokens || 0;
      const outputTokens = usage.output_tokens || 0;
      const usd = costFor(inputTokens, outputTokens);

      setModifiedText(transformedContent);
      setLastUsage({ inputTokens, outputTokens, usd });
      setSessionUsage((prev) => ({
        inputTokens: prev.inputTokens + inputTokens,
        outputTokens: prev.outputTokens + outputTokens,
        calls: prev.calls + 1,
      }));
      setChanges([
        `Transformed for ${matchedProfile?.name || 'target'} profile`,
        `Spatial: ${getPositionLabel(spatial, 'spatial')} (${spatial})`,
        `Temporal: ${getPositionLabel(temporal, 'temporal')} (${temporal})`,
        `Reference: ${getPositionLabel(reference, 'reference')} (${reference})`
      ]);

      if (typeof data.balance === 'number') setBalance(data.balance);
    } catch (err) {
      console.error('API Error:', err);
      setError(err.message || 'Failed to transform content');
    } finally {
      setIsLoading(false);
    }
  };

  const SliderControl = ({ label, value, onChange, gradient }) => (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ fontWeight: '500' }}>{label}</span>
        <span style={{ fontWeight: 'bold' }}>
          {value} - {getPositionLabel(value, gradient)}
        </span>
      </div>
      <input
        type="range"
        min="0"
        max="100"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        style={{ width: '100%', cursor: 'pointer' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#666', marginTop: '4px' }}>
        <span>{GRADIENT_LABELS[gradient].low}</span>
        <span>{GRADIENT_LABELS[gradient].mid}</span>
        <span>{GRADIENT_LABELS[gradient].high}</span>
      </div>
    </div>
  );

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#1a1a2e',
      color: 'white',
      padding: '20px',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <h1 style={{ textAlign: 'center', marginBottom: '8px', fontSize: '28px' }}>
          Cognitive Architecture Modifier
        </h1>
        <p style={{ textAlign: 'center', color: '#888', marginBottom: '30px' }}>
          AI-Powered Content Transformation for Any Cognitive Profile
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr 1fr', gap: '20px' }}>

          {/* Controls Panel */}
          <div style={{ backgroundColor: '#252540', borderRadius: '12px', padding: '20px' }}>
            <h2 style={{ fontSize: '18px', marginBottom: '20px' }}>Target Profile</h2>

            {/* Account / Auth Panel */}
            <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#1a1a2e', borderRadius: '8px' }}>
              {!authChecked ? (
                <div style={{ fontSize: '12px', color: '#888' }}>Loading…</div>
              ) : session ? (
                <>
                  <div style={{ fontSize: '12px', color: '#888', marginBottom: '6px' }}>Signed in as</div>
                  <div style={{ fontSize: '13px', marginBottom: '10px', wordBreak: 'break-all' }}>
                    {session.user?.email}
                  </div>
                  {freeMode ? (
                    <div style={{
                      marginBottom: '10px',
                      padding: '8px 10px',
                      backgroundColor: '#1e3a5c',
                      border: '1px solid #3b82f6',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: '#dbeafe',
                      textAlign: 'center'
                    }}>
                      <strong style={{ color: '#fbbf24' }}>Free access</strong>
                      <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>
                        Private testing — unlimited transforms
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '12px', color: '#888' }}>Credits</span>
                        <span style={{
                          fontSize: '14px',
                          fontWeight: 'bold',
                          color: balance == null ? '#888'
                            : balance > 0 ? '#66bb6a'
                            : balance > overageLimit ? '#fbbf24'
                            : '#ff6666'
                        }}>
                          {balance == null ? '—' : balance}
                        </span>
                      </div>
                      {balance != null && balance <= 0 && balance > overageLimit && (
                        <div style={{ fontSize: '11px', color: '#fbbf24', marginBottom: '8px' }}>
                          In overage ({Math.abs(balance)} of {Math.abs(overageLimit)})
                        </div>
                      )}
                      {balance != null && balance <= overageLimit && (
                        <div style={{ fontSize: '11px', color: '#ff6666', marginBottom: '8px' }}>
                          Out of credits — buy more to continue
                        </div>
                      )}
                    </>
                  )}

                  {/* Credit packs (hidden in free mode) */}
                  {!freeMode && packs && (
                    <div style={{ marginBottom: '10px' }}>
                      <div style={{ fontSize: '11px', color: '#888', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Buy credits
                      </div>
                      {['starter', 'standard', 'pro'].map((key) => {
                        const p = packs[key];
                        if (!p) return null;
                        const isPopular = p.popular;
                        const isBusy = checkoutBusy === key;
                        return (
                          <button
                            key={key}
                            onClick={() => handleBuyPack(key)}
                            disabled={!!checkoutBusy}
                            style={{
                              width: '100%',
                              padding: '8px 10px',
                              marginBottom: '6px',
                              backgroundColor: isPopular ? '#3b82f6' : '#333',
                              border: isPopular ? '1px solid #3b82f6' : '1px solid #444',
                              borderRadius: '6px',
                              color: 'white',
                              cursor: checkoutBusy ? 'wait' : 'pointer',
                              fontSize: '12px',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center'
                            }}
                          >
                            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                              <span style={{ fontWeight: 'bold' }}>
                                {p.label}
                                {isPopular && (
                                  <span style={{ marginLeft: '6px', fontSize: '9px', color: '#fbbf24' }}>★ Most Popular</span>
                                )}
                              </span>
                              <span style={{ fontSize: '10px', color: isPopular ? '#dbeafe' : '#999' }}>
                                {p.credits} credits
                              </span>
                            </span>
                            <span style={{ fontWeight: 'bold' }}>
                              {isBusy ? '…' : p.price}
                            </span>
                          </button>
                        );
                      })}
                      {checkoutMessage && (
                        <div style={{ fontSize: '11px', color: '#fbbf24', marginTop: '4px' }}>
                          {checkoutMessage}
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    onClick={handleSignOut}
                    style={{
                      width: '100%',
                      padding: '6px',
                      fontSize: '11px',
                      backgroundColor: '#333',
                      border: '1px solid #444',
                      borderRadius: '4px',
                      color: '#ccc',
                      cursor: 'pointer'
                    }}
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <form onSubmit={handleSignIn}>
                  <div style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>
                    {authMode === 'signup' ? 'Create account' : 'Sign in'}
                  </div>
                  <input
                    type="email"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="email"
                    required
                    style={{
                      width: '100%',
                      padding: '8px',
                      marginBottom: '8px',
                      backgroundColor: '#333',
                      border: '1px solid #444',
                      borderRadius: '4px',
                      color: 'white',
                      fontSize: '12px',
                      boxSizing: 'border-box'
                    }}
                  />
                  <input
                    type="password"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="password"
                    required
                    minLength={6}
                    style={{
                      width: '100%',
                      padding: '8px',
                      marginBottom: '8px',
                      backgroundColor: '#333',
                      border: '1px solid #444',
                      borderRadius: '4px',
                      color: 'white',
                      fontSize: '12px',
                      boxSizing: 'border-box'
                    }}
                  />
                  <button
                    type="submit"
                    disabled={authBusy}
                    style={{
                      width: '100%',
                      padding: '8px',
                      backgroundColor: authBusy ? '#444' : '#3b82f6',
                      border: 'none',
                      borderRadius: '4px',
                      color: 'white',
                      cursor: authBusy ? 'wait' : 'pointer',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      marginBottom: '6px'
                    }}
                  >
                    {authBusy ? '…' : (authMode === 'signup' ? 'Sign up' : 'Sign in')}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAuthMode(authMode === 'signup' ? 'signin' : 'signup'); setAuthMessage(''); }}
                    style={{
                      width: '100%',
                      padding: '4px',
                      backgroundColor: 'transparent',
                      border: 'none',
                      color: '#888',
                      cursor: 'pointer',
                      fontSize: '11px',
                      textDecoration: 'underline'
                    }}
                  >
                    {authMode === 'signup' ? 'Have an account? Sign in' : 'New here? Create account'}
                  </button>
                  {authMessage && (
                    <div style={{ fontSize: '11px', color: '#fbbf24', marginTop: '6px' }}>
                      {authMessage}
                    </div>
                  )}
                </form>
              )}
            </div>

            <SliderControl
              label="Spatial"
              value={spatial}
              onChange={setSpatial}
              gradient="spatial"
            />

            <SliderControl
              label="Temporal"
              value={temporal}
              onChange={setTemporal}
              gradient="temporal"
            />

            <SliderControl
              label="Reference"
              value={reference}
              onChange={setReference}
              gradient="reference"
            />

            {/* Matched Profile */}
            {matchedProfile && (
              <div style={{
                marginTop: '20px',
                padding: '15px',
                borderRadius: '8px',
                border: `2px solid ${getProfileColor(matchedProfile.name)}`,
                backgroundColor: `${getProfileColor(matchedProfile.name)}20`
              }}>
                <div style={{ fontSize: '12px', color: '#888' }}>Target Profile</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: getProfileColor(matchedProfile.name) }}>
                  {matchedProfile.name}
                </div>
                <div style={{ fontSize: '12px', color: '#aaa', marginTop: '8px' }}>
                  {matchedProfile.description}
                </div>
              </div>
            )}

            {/* Quick Profile Buttons */}
            <div style={{ marginTop: '20px' }}>
              <div style={{ fontSize: '12px', color: '#888', marginBottom: '10px' }}>Quick Select</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {['VISIONARY', 'SHARP', 'GROUNDED', 'LEGACY', 'ALTRUISTIC', 'ATTUNED', 'INTROSPECTIVE'].map(name => (
                  <button
                    key={name}
                    onClick={() => {
                      const p = PROFILES[name];
                      setSpatial(Math.round((p.spatial[0] + p.spatial[1]) / 2));
                      setTemporal(Math.round((p.temporal[0] + p.temporal[1]) / 2));
                      setReference(Math.round((p.reference[0] + p.reference[1]) / 2));
                    }}
                    style={{
                      padding: '6px 10px',
                      fontSize: '11px',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      backgroundColor: matchedProfile?.name === name ? getProfileColor(name) : '#333',
                      color: 'white'
                    }}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            {/* Cost Estimate */}
            <div style={{ marginTop: '20px', padding: '12px', backgroundColor: '#1a1a2e', borderRadius: '8px', fontSize: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#888', marginBottom: '6px' }}>
                <span>Estimated cost (this run)</span>
                <span style={{ color: estimatedCost ? '#fbbf24' : '#555', fontWeight: 'bold' }}>
                  {estimatedCost ? formatCost(estimatedCost.usd) : '—'}
                </span>
              </div>
              {estimatedCost && (
                <div style={{ color: '#666', fontSize: '11px' }}>
                  ~{estimatedCost.inputTokens.toLocaleString()} in / ~{estimatedCost.outputTokens.toLocaleString()} out tokens
                </div>
              )}
              {lastUsage && (
                <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #333' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#888' }}>
                    <span>Last actual</span>
                    <span style={{ color: '#66bb6a', fontWeight: 'bold' }}>{formatCost(lastUsage.usd)}</span>
                  </div>
                  <div style={{ color: '#666', fontSize: '11px' }}>
                    {lastUsage.inputTokens.toLocaleString()} in / {lastUsage.outputTokens.toLocaleString()} out tokens
                  </div>
                </div>
              )}
              {sessionUsage.calls > 0 && (
                <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #333' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#888' }}>
                    <span>Session ({sessionUsage.calls} {sessionUsage.calls === 1 ? 'call' : 'calls'})</span>
                    <span style={{ color: '#3b82f6', fontWeight: 'bold' }}>
                      {formatCost(costFor(sessionUsage.inputTokens, sessionUsage.outputTokens))}
                    </span>
                  </div>
                  <div style={{ color: '#666', fontSize: '11px' }}>
                    {sessionUsage.inputTokens.toLocaleString()} in / {sessionUsage.outputTokens.toLocaleString()} out tokens
                  </div>
                </div>
              )}
              <div style={{ marginTop: '8px', color: '#555', fontSize: '10px' }}>
                Sonnet 4: ${PRICING.inputPerMTok}/M in · ${PRICING.outputPerMTok}/M out
              </div>
            </div>

            {/* Transform Button */}
            <button
              onClick={transformWithAPI}
              disabled={isLoading || !inputText.trim() || !session || (!freeMode && balance != null && balance <= overageLimit)}
              style={{
                width: '100%',
                marginTop: '20px',
                padding: '15px',
                backgroundColor: isLoading ? '#444' : (matchedProfile ? getProfileColor(matchedProfile.name) : '#3b82f6'),
                border: 'none',
                borderRadius: '8px',
                color: 'white',
                cursor: isLoading ? 'wait' : 'pointer',
                fontSize: '16px',
                fontWeight: 'bold'
              }}
            >
              {isLoading ? 'Transforming...' : `Transform for ${matchedProfile?.name || 'Target'}`}
            </button>

            {/* Error Display */}
            {error && (
              <div style={{
                marginTop: '15px',
                padding: '10px',
                backgroundColor: '#ff000030',
                borderRadius: '6px',
                border: '1px solid #ff0000',
                fontSize: '12px',
                color: '#ff6666'
              }}>
                {error}
              </div>
            )}

            {/* Changes Log */}
            {changes.length > 0 && (
              <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#1a1a2e', borderRadius: '8px' }}>
                <div style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>
                  Transformation Applied
                </div>
                {changes.map((change, i) => (
                  <div key={i} style={{ fontSize: '11px', color: '#66bb6a', marginBottom: '4px' }}>
                    • {change}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Input Panel */}
          <div style={{ backgroundColor: '#252540', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ fontSize: '18px', marginBottom: '15px' }}>Original Content</h2>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Paste your content here...

Example: Paste a VISIONARY profile, then click SHARP and hit Transform to see it converted for a Concrete • Past • Self reader."
              style={{
                flex: 1,
                minHeight: '500px',
                padding: '15px',
                backgroundColor: '#1a1a2e',
                border: '1px solid #333',
                borderRadius: '8px',
                color: 'white',
                fontSize: '14px',
                lineHeight: '1.6',
                resize: 'none',
                fontFamily: 'inherit'
              }}
            />
          </div>

          {/* Output Panel */}
          <div style={{ backgroundColor: '#252540', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h2 style={{ fontSize: '18px', margin: 0 }}>Modified for {matchedProfile?.name || 'Target'}</h2>
            </div>
            <div
              style={{
                flex: 1,
                minHeight: '500px',
                padding: '15px',
                backgroundColor: '#1a1a2e',
                border: `1px solid ${getProfileColor(matchedProfile?.name)}40`,
                borderRadius: '8px',
                color: 'white',
                fontSize: '14px',
                lineHeight: '1.6',
                overflow: 'auto',
                whiteSpace: 'pre-wrap'
              }}
            >
              {isLoading ? (
                <div style={{ color: '#888', textAlign: 'center', marginTop: '50px' }}>
                  <div style={{ fontSize: '24px', marginBottom: '10px' }}>⏳</div>
                  Transforming content for {matchedProfile?.name}...
                </div>
              ) : (
                modifiedText || 'Transformed content will appear here after you click Transform...'
              )}
            </div>
            <div style={{ marginTop: '10px', display: 'flex', gap: '10px' }}>
              <button
                onClick={() => navigator.clipboard.writeText(modifiedText)}
                disabled={!modifiedText}
                style={{
                  padding: '10px 20px',
                  backgroundColor: modifiedText ? getProfileColor(matchedProfile?.name) : '#333',
                  border: 'none',
                  borderRadius: '6px',
                  color: 'white',
                  cursor: modifiedText ? 'pointer' : 'not-allowed',
                  fontSize: '14px'
                }}
              >
                Copy Modified Text
              </button>
            </div>
          </div>
        </div>

        {/* Profile Grid */}
        <div style={{ marginTop: '30px', backgroundColor: '#252540', borderRadius: '12px', padding: '20px' }}>
          <h2 style={{ fontSize: '18px', marginBottom: '15px' }}>All 27 Profiles</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '8px' }}>
            {Object.entries(PROFILES).map(([name, config]) => {
              const isActive = matchedProfile?.name === name;
              return (
                <button
                  key={name}
                  onClick={() => {
                    setSpatial(Math.round((config.spatial[0] + config.spatial[1]) / 2));
                    setTemporal(Math.round((config.temporal[0] + config.temporal[1]) / 2));
                    setReference(Math.round((config.reference[0] + config.reference[1]) / 2));
                  }}
                  style={{
                    padding: '8px 4px',
                    fontSize: '10px',
                    border: isActive ? '2px solid white' : 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    backgroundColor: isActive ? getProfileColor(name) : `${getProfileColor(name)}40`,
                    color: 'white',
                    opacity: isActive ? 1 : 0.7
                  }}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default CognitiveModifier;
