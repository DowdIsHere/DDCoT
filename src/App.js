import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';
import './App.css';

// ═══════════════════════════════════════════════════════════════
// MyReader — Premium Cognitive Translation E-Reader
// The 27 CBI Profiles ARE the translation engine.
// ═══════════════════════════════════════════════════════════════

// ── The 27 CBI Profiles — Robert's actual mappings ──────────

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

const GRADIENT_LABELS = {
  spatial: { low: "Concrete", mid: "Balanced", high: "Abstract" },
  temporal: { low: "Past", mid: "Present", high: "Future" },
  reference: { low: "Other", mid: "Balanced", high: "Self" }
};

// ── Pricing ─────────────────────────────────────────────────

const PRICING = { inputPerMTok: 3, outputPerMTok: 15 };
const estimateTokens = (text) => Math.ceil((text || '').length / 4);
const costFor = (inputTokens, outputTokens) =>
  (inputTokens / 1_000_000) * PRICING.inputPerMTok +
  (outputTokens / 1_000_000) * PRICING.outputPerMTok;
const formatCost = (usd) => {
  if (usd < 0.01) return `<$0.01`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
};

// ── Font & Theme Options ────────────────────────────────────

const FONT_OPTIONS = [
  { key: 'literata', label: 'Literata', family: "'Literata', Georgia, serif" },
  { key: 'merriweather', label: 'Merriweather', family: "'Merriweather', Georgia, serif" },
  { key: 'inter', label: 'Inter', family: "'Inter', system-ui, sans-serif" },
  { key: 'system', label: 'System', family: "system-ui, -apple-system, sans-serif" },
];

const THEMES = [
  { key: 'dark', label: 'Dark' },
  { key: 'light', label: 'Light' },
  { key: 'sepia', label: 'Sepia' },
];

// ── Persistence ─────────────────────────────────────────────

function loadSettings() {
  try { const s = localStorage.getItem('myreader-settings'); return s ? JSON.parse(s) : null; } catch { return null; }
}
function saveSettings(s) {
  try { localStorage.setItem('myreader-settings', JSON.stringify(s)); } catch {}
}
function loadLibrary() {
  try { const s = localStorage.getItem('myreader-library'); return s ? JSON.parse(s) : []; } catch { return []; }
}
function saveLibrary(l) {
  try { localStorage.setItem('myreader-library', JSON.stringify(l)); } catch {}
}

// ── Cognitive Translation Prompt Builder ────────────────────
// This is the CORE of MyReader — translating content into the
// reader's cognitive reception register.

function buildTransformationPrompt(content, targetProfile, spatialScore, temporalScore, referenceScore) {
  const getLabel = (value, gradient) => {
    const labels = GRADIENT_LABELS[gradient];
    if (value <= 33) return labels.low;
    if (value <= 66) return labels.mid;
    return labels.high;
  };

  const spatialLabel = getLabel(spatialScore, 'spatial');
  const temporalLabel = getLabel(temporalScore, 'temporal');
  const referenceLabel = getLabel(referenceScore, 'reference');

  return `You are a Cognitive Architecture Information Modifier operating in TRANSLATE mode. Your job is to re-voice an existing source so it reads in the reception register (the reader's gradient configuration) that best fits this reader — re-orienting how the source is received, never performing the cognition that happens downstream.

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
- OMIT COGNITION — the master rule. The target profile models how this reader RECEIVES: the orientation of what arrives BEFORE cognition begins (concrete vs abstract, past vs future, self vs other). It is a RECEPTION frame, not a cognition. Your job is to re-orient the source into that reception frame — its tense, distance, structure, emphasis, word choice. You must NEVER perform the cognition that happens downstream of reception. Remembering, forecasting, sensing, concluding, and attributing reactions are products of the reader's cognition — they are not in the source, and they are not what the profile encodes. Render the reception orientation; omit the cognition. Every per-profile CRITICAL guard below is one instance of this single rule.
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
- Let the source's ideas build on each other across paragraphs; make connections the source already draws explicit with transition words.
- Lead with the principle the source states; its examples follow in support.
- Surface and foreground the source's existing relational structure; you may compress and reorder to do so. Do NOT synthesize — introducing a connecting principle, generalization, or conclusion the source does not itself make is cognition (concluding), and it is omitted.
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
- Pure concrete detail that drops the source's connecting structure.
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
}

// ═══════════════════════════════════════════════════════════════
// MyReader Component
// ═══════════════════════════════════════════════════════════════

function MyReader() {
  // ── Settings ──────────────────────────────────────────────
  const defaultSettings = {
    theme: 'dark', fontFamily: 'literata', fontSize: 18,
    lineHeight: 1.8, readerWidth: 720,
  };
  const [settings, setSettings] = useState(() => loadSettings() || defaultSettings);
  const [showSettings, setShowSettings] = useState(false);

  // ── Sidebar ───────────────────────────────────────────────
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // ── Library ───────────────────────────────────────────────
  const [library, setLibrary] = useState(() => loadLibrary());
  const [activeDocId, setActiveDocId] = useState(null);

  // ── Reader ────────────────────────────────────────────────
  const [readerContent, setReaderContent] = useState('');
  const [readerTitle, setReaderTitle] = useState('');
  const [scrollProgress, setScrollProgress] = useState(0);
  const readerRef = useRef(null);

  // ── Cognitive Profile (THE translation engine) ────────────
  const [spatial, setSpatial] = useState(50);
  const [temporal, setTemporal] = useState(50);
  const [reference, setReference] = useState(50);
  const [translatedContent, setTranslatedContent] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationError, setTranslationError] = useState('');
  const [changes, setChanges] = useState([]);
  const [lastUsage, setLastUsage] = useState(null);
  const [sessionUsage, setSessionUsage] = useState({ inputTokens: 0, outputTokens: 0, calls: 0 });
  const [showTranslated, setShowTranslated] = useState(false); // toggle original vs translated
  const [bilingualMode, setBilingualMode] = useState(false);

  // ── Translation Panel ─────────────────────────────────────
  const [profilePanelOpen, setProfilePanelOpen] = useState(true);

  // ── Auth + credits ────────────────────────────────────────
  const [session, setSession] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [balance, setBalance] = useState(null);
  const [overageLimit, setOverageLimit] = useState(-5);
  const [freeMode, setFreeMode] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authMode, setAuthMode] = useState('signin');
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState('');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [packs, setPacks] = useState(null);
  const [checkoutBusy, setCheckoutBusy] = useState(null);
  const [checkoutMessage, setCheckoutMessage] = useState('');

  // ── Toast ─────────────────────────────────────────────────
  const [toast, setToast] = useState(null);

  // ── Drag & drop ───────────────────────────────────────────
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  // ── Profile matching ──────────────────────────────────────

  const matchedProfile = useMemo(() => {
    for (const [name, config] of Object.entries(PROFILES)) {
      const s = spatial >= config.spatial[0] && spatial <= config.spatial[1];
      const t = temporal >= config.temporal[0] && temporal <= config.temporal[1];
      const r = reference >= config.reference[0] && reference <= config.reference[1];
      if (s && t && r) return { name, ...config };
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
    if (!profile) return '#7c6df0';
    if (profile.spatial[1] <= 33) return '#4ade80'; // concrete = green
    if (profile.spatial[0] >= 67) return '#a855f7'; // abstract = purple
    return '#60a5fa'; // balanced = blue
  };

  // ── Estimated cost ────────────────────────────────────────

  const estimatedCost = useMemo(() => {
    if (!readerContent.trim()) return null;
    const prompt = buildTransformationPrompt(readerContent, 'PREVIEW', spatial, temporal, reference);
    const inTok = estimateTokens(prompt);
    const outTok = Math.min(estimateTokens(readerContent), 8192);
    return { inputTokens: inTok, outputTokens: outTok, usd: costFor(inTok, outTok) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readerContent, spatial, temporal, reference]);

  // ── Effects ───────────────────────────────────────────────

  useEffect(() => { document.documentElement.setAttribute('data-theme', settings.theme); saveSettings(settings); }, [settings]);
  useEffect(() => { saveLibrary(library); }, [library]);

  useEffect(() => {
    const el = readerRef.current;
    if (!el) return;
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      setScrollProgress(scrollHeight > clientHeight ? (scrollTop / (scrollHeight - clientHeight)) * 100 : 0);
    };
    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, [readerContent, translatedContent, showTranslated]);

  // ── Auth ──────────────────────────────────────────────────

  const fetchBalance = useCallback(async (accessToken) => {
    if (!accessToken) return;
    try {
      const res = await fetch('/api/credits', { headers: { Authorization: `Bearer ${accessToken}` } });
      if (res.ok) {
        const data = await res.json();
        if (data.free_mode) { setFreeMode(true); setBalance(null); }
        else { setFreeMode(false); setBalance(data.balance); setOverageLimit(data.overage_limit ?? -5); }
      }
    } catch {}
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s); setAuthChecked(true);
      if (s?.access_token) fetchBalance(s.access_token);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.access_token) fetchBalance(s.access_token);
      else setBalance(null);
    });
    fetch('/api/packs').then(r => r.ok ? r.json() : null).then(data => {
      if (!data) return;
      if (data.free_mode) setPacks(null); else setPacks(data);
    }).catch(() => {});

    const params = new URLSearchParams(window.location.search);
    const cs = params.get('checkout');
    if (cs === 'success') {
      setCheckoutMessage('Payment received — credits will appear momentarily.');
      const refresh = (d) => setTimeout(async () => {
        const { data: { session: s } } = await supabase.auth.getSession();
        if (s?.access_token) fetchBalance(s.access_token);
      }, d);
      refresh(500); refresh(2000); refresh(5000);
      window.history.replaceState({}, '', window.location.pathname);
    } else if (cs === 'cancel') {
      setCheckoutMessage('Checkout canceled — no charge.');
      window.history.replaceState({}, '', window.location.pathname);
    }
    return () => subscription.unsubscribe();
  }, [fetchBalance]);

  const handleSignIn = async (e) => {
    e?.preventDefault(); setAuthBusy(true); setAuthMessage('');
    const { error: authErr } = authMode === 'signup'
      ? await supabase.auth.signUp({ email: authEmail, password: authPassword })
      : await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
    setAuthBusy(false);
    if (authErr) setAuthMessage(authErr.message);
    else if (authMode === 'signup') setAuthMessage('Check your email to confirm, then sign in.');
  };

  const handleSignOut = async () => { await supabase.auth.signOut(); setBalance(null); setShowUserMenu(false); };

  const handleBuyPack = async (packKey) => {
    if (!session?.access_token) return;
    setCheckoutBusy(packKey); setCheckoutMessage('');
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ pack: packKey })
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || 'Checkout failed');
      window.location.href = data.url;
    } catch (err) { setCheckoutMessage(err.message || 'Checkout failed'); setCheckoutBusy(null); }
  };

  // ── File Handling ─────────────────────────────────────────

  const processFile = useCallback(async (file) => {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'txt' || ext === 'md') {
      const text = await file.text();
      const doc = { id: Date.now().toString(), title: file.name.replace(/\.[^/.]+$/, ''), content: text, type: ext, addedAt: new Date().toISOString(), size: file.size };
      setLibrary(prev => [doc, ...prev]);
      openDoc(doc);
      showToast(`Loaded "${doc.title}"`, 'success');
    } else if (ext === 'epub') {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const { default: ePub } = await import('epubjs');
        const book = ePub(arrayBuffer);
        await book.ready;
        const title = book.packaging?.metadata?.title || file.name.replace(/\.[^/.]+$/, '');
        const spine = book.spine;
        let fullText = '';
        for (let i = 0; i < spine.items.length; i++) {
          const section = spine.items[i];
          const contents = await section.load(book.load.bind(book));
          const body = contents?.querySelector?.('body');
          if (body) fullText += body.textContent + '\n\n';
        }
        if (!fullText.trim()) { showToast('Could not extract text from EPUB.', 'error'); return; }
        const doc = { id: Date.now().toString(), title, content: fullText.trim(), type: 'epub', addedAt: new Date().toISOString(), size: file.size };
        setLibrary(prev => [doc, ...prev]);
        openDoc(doc);
        showToast(`Loaded "${doc.title}"`, 'success');
      } catch (err) { console.error('EPUB parse error:', err); showToast('Failed to parse EPUB', 'error'); }
    } else {
      showToast(`Unsupported file type: .${ext}`, 'error');
    }
  }, []);

  const openDoc = (doc) => {
    setActiveDocId(doc.id); setReaderContent(doc.content); setReaderTitle(doc.title);
    setScrollProgress(0); setTranslatedContent(''); setShowTranslated(false); setBilingualMode(false);
    setChanges([]); setTranslationError('');
    if (readerRef.current) readerRef.current.scrollTop = 0;
  };

  const deleteDocument = (docId) => {
    setLibrary(prev => prev.filter(d => d.id !== docId));
    if (activeDocId === docId) { setActiveDocId(null); setReaderContent(''); setReaderTitle(''); setTranslatedContent(''); }
  };

  const handlePasteText = () => {
    const text = prompt('Paste your content to read and translate:');
    if (text?.trim()) {
      const doc = { id: Date.now().toString(), title: `Pasted (${new Date().toLocaleTimeString()})`, content: text.trim(), type: 'paste', addedAt: new Date().toISOString(), size: text.length };
      setLibrary(prev => [doc, ...prev]);
      openDoc(doc);
    }
  };

  const handleFileDrop = useCallback((e) => {
    e.preventDefault(); setIsDragging(false);
    const files = e.dataTransfer?.files;
    if (files?.length) processFile(files[0]);
  }, [processFile]);

  // ── Cognitive Translation (THE core feature) ──────────────

  const translateWithProfile = async () => {
    if (!readerContent.trim()) { setTranslationError('Load content first'); return; }
    if (!session?.access_token) { setTranslationError('Please sign in to translate'); return; }

    setIsTranslating(true); setTranslationError(''); setChanges([]);

    const prompt = buildTransformationPrompt(
      readerContent, matchedProfile?.name || 'Unknown', spatial, temporal, reference
    );

    try {
      const response = await fetch('/api/anthropic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 8192,
          messages: [{ role: 'user', content: prompt }],
          profile_name: matchedProfile?.name || null
        })
      });

      const data = await response.json();

      if (response.status === 402) {
        setTranslationError('Out of credits — buy more to keep translating.');
        if (typeof data.balance === 'number') setBalance(data.balance);
        return;
      }
      if (response.status === 401) { setTranslationError('Session expired — please sign in again.'); return; }
      if (!response.ok) throw new Error(data.error?.message || data.error || `API error: ${response.status}`);

      const transformed = data.content[0].text;
      const usage = data.usage || {};
      const inTok = usage.input_tokens || 0;
      const outTok = usage.output_tokens || 0;

      setTranslatedContent(transformed);
      setShowTranslated(true);
      setLastUsage({ inputTokens: inTok, outputTokens: outTok, usd: costFor(inTok, outTok) });
      setSessionUsage(prev => ({ inputTokens: prev.inputTokens + inTok, outputTokens: prev.outputTokens + outTok, calls: prev.calls + 1 }));
      setChanges([
        `Translated for ${matchedProfile?.name || 'target'} profile`,
        `Spatial: ${getPositionLabel(spatial, 'spatial')} (${spatial})`,
        `Temporal: ${getPositionLabel(temporal, 'temporal')} (${temporal})`,
        `Reference: ${getPositionLabel(reference, 'reference')} (${reference})`
      ]);
      if (typeof data.balance === 'number') setBalance(data.balance);
      showToast(`Translated for ${matchedProfile?.name}`, 'success');
    } catch (err) {
      console.error('Translation error:', err);
      setTranslationError(err.message || 'Translation failed');
    } finally {
      setIsTranslating(false);
    }
  };

  // ── Toast ─────────────────────────────────────────────────

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Settings ──────────────────────────────────────────────

  const updateSetting = (key, value) => setSettings(prev => ({ ...prev, [key]: value }));
  const currentFont = FONT_OPTIONS.find(f => f.key === settings.fontFamily) || FONT_OPTIONS[0];

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // ── Which content to show ─────────────────────────────────

  const displayContent = showTranslated && translatedContent ? translatedContent : readerContent;

  // ═════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════

  return (
    <div className="app-shell">
      {/* ── Header ──────────────────────────────────────── */}
      <header className="header">
        <div className="header-left">
          <button className="icon-btn" onClick={() => setSidebarOpen(!sidebarOpen)} title={sidebarOpen ? 'Close library' : 'Open library'} id="sidebar-toggle">
            {sidebarOpen ? '◀' : '☰'}
          </button>
          <div className="header-brand">
            <div className="header-brand-icon">📖</div>
            <span>MyReader</span>
          </div>
        </div>

        <div className="header-center">
          {readerTitle && (
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {readerTitle}
              {showTranslated && translatedContent && (
                <span style={{ color: getProfileColor(matchedProfile?.name), marginLeft: 8, fontWeight: 600 }}>
                  → {matchedProfile?.name}
                </span>
              )}
            </span>
          )}
        </div>

        <div className="header-right">
          {/* Profile panel toggle */}
          <button className={`icon-btn ${profilePanelOpen ? 'active' : ''}`} onClick={() => setProfilePanelOpen(!profilePanelOpen)} title="Cognitive Profile" id="profile-toggle">
            🧠
          </button>

          {/* Bilingual toggle */}
          {translatedContent && (
            <button className={`icon-btn ${bilingualMode ? 'active' : ''}`} onClick={() => { setBilingualMode(!bilingualMode); setShowTranslated(true); }} title="Side-by-side view" id="bilingual-toggle">
              📑
            </button>
          )}

          {/* View toggle: original / translated */}
          {translatedContent && !bilingualMode && (
            <button className={`icon-btn ${showTranslated ? 'active' : ''}`} onClick={() => setShowTranslated(!showTranslated)} title={showTranslated ? 'Show original' : 'Show translated'} id="view-toggle">
              {showTranslated ? '🔄' : '✨'}
            </button>
          )}

          {/* Theme toggle */}
          <button className="icon-btn" onClick={() => {
            const t = ['dark', 'light', 'sepia'];
            updateSetting('theme', t[(t.indexOf(settings.theme) + 1) % t.length]);
          }} title={`Theme: ${settings.theme}`} id="theme-toggle">
            {settings.theme === 'dark' ? '🌙' : settings.theme === 'light' ? '☀️' : '📜'}
          </button>

          {/* Settings */}
          <button className="icon-btn" onClick={() => setShowSettings(true)} title="Settings" id="settings-btn">⚙️</button>

          {/* Credit badge */}
          {session && !freeMode && balance != null && (
            <div className="credit-badge">
              <span>⚡</span>
              <span className={`credit-badge-value ${balance > 5 ? 'positive' : balance > 0 ? 'warning' : 'negative'}`}>{balance}</span>
            </div>
          )}
          {session && freeMode && (
            <div className="credit-badge">
              <span style={{ color: 'var(--warning)' }}>∞</span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>Free</span>
            </div>
          )}

          {/* User menu */}
          {authChecked && (
            <div className="user-menu">
              <button className="icon-btn" onClick={() => setShowUserMenu(!showUserMenu)} title={session ? session.user?.email : 'Sign in'} id="user-menu-btn">
                {session ? '👤' : '🔑'}
              </button>
              {showUserMenu && (
                <div className="user-menu-dropdown">
                  {session ? (
                    <>
                      <div className="user-menu-header">
                        <div className="user-menu-email">{session.user?.email}</div>
                        {freeMode && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--warning)', marginTop: 4 }}>Free access — unlimited translations</div>}
                      </div>
                      {!freeMode && packs && (
                        <div style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--border-primary)' }}>
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-2)' }}>Buy Credits</div>
                          {['starter', 'standard', 'pro'].map(key => {
                            const p = packs[key]; if (!p) return null;
                            return (
                              <button key={key} onClick={() => handleBuyPack(key)} disabled={!!checkoutBusy} className="user-menu-item" style={{ justifyContent: 'space-between', background: p.popular ? 'var(--accent-glow)' : undefined }}>
                                <span><strong>{p.label}</strong><span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginLeft: 6 }}>{p.credits} cr</span></span>
                                <span style={{ fontWeight: 600 }}>{checkoutBusy === key ? '…' : p.price}</span>
                              </button>
                            );
                          })}
                          {checkoutMessage && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--warning)', padding: '4px 16px' }}>{checkoutMessage}</div>}
                        </div>
                      )}
                      <button className="user-menu-item" onClick={handleSignOut}><span>🚪</span> Sign out</button>
                    </>
                  ) : (
                    <div className="auth-panel">
                      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-3)' }}>{authMode === 'signup' ? 'Create Account' : 'Sign In'}</div>
                      <form onSubmit={handleSignIn}>
                        <input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} placeholder="Email" required className="auth-input" id="auth-email" />
                        <input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} placeholder="Password" required minLength={6} className="auth-input" id="auth-password" />
                        <button type="submit" disabled={authBusy} className="btn btn-primary" style={{ width: '100%', marginBottom: 'var(--space-2)' }} id="auth-submit">
                          {authBusy ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : (authMode === 'signup' ? 'Sign Up' : 'Sign In')}
                        </button>
                        <button type="button" onClick={() => { setAuthMode(authMode === 'signup' ? 'signin' : 'signup'); setAuthMessage(''); }} className="btn btn-ghost" style={{ width: '100%', fontSize: 'var(--text-xs)' }}>
                          {authMode === 'signup' ? 'Have an account? Sign in' : 'New here? Create account'}
                        </button>
                        {authMessage && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--warning)', marginTop: 'var(--space-2)' }}>{authMessage}</div>}
                      </form>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* ── Main Content ──────────────────────────────── */}
      <div className="main-content">

        {/* ── Sidebar / Library ─────────────────────── */}
        <aside className={`sidebar ${sidebarOpen ? '' : 'collapsed'}`}>
          {sidebarOpen && (
            <>
              <div className="sidebar-header">
                <div className="sidebar-title">📚 Library</div>
              </div>
              <div className="sidebar-content">
                <div className={`upload-zone ${isDragging ? 'dragover' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleFileDrop}
                >
                  <div className="upload-zone-icon">📄</div>
                  <div className="upload-zone-text">Drop file or click</div>
                  <div className="upload-zone-hint">TXT, EPUB</div>
                </div>
                <input ref={fileInputRef} type="file" accept=".txt,.md,.epub" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) processFile(e.target.files[0]); }} />
                <button className="btn btn-secondary" style={{ width: '100%', marginBottom: 'var(--space-4)' }} onClick={handlePasteText}>📋 Paste Text</button>

                {library.length === 0 && (
                  <div style={{ textAlign: 'center', padding: 'var(--space-6) 0', color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>
                    Your library is empty.<br />Upload or paste content to start reading.
                  </div>
                )}
                {library.map(doc => (
                  <div key={doc.id} className={`library-item ${activeDocId === doc.id ? 'active' : ''}`} onClick={() => openDoc(doc)}>
                    <div className="library-item-icon">{doc.type === 'epub' ? '📕' : doc.type === 'paste' ? '📋' : '📄'}</div>
                    <div className="library-item-info">
                      <div className="library-item-title">{doc.title}</div>
                      <div className="library-item-meta">{formatFileSize(doc.size)} · {doc.type.toUpperCase()}</div>
                    </div>
                    <button className="library-item-delete" onClick={e => { e.stopPropagation(); deleteDocument(doc.id); }} title="Remove">×</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </aside>

        {/* ── Reader Pane ──────────────────────────── */}
        <div className="reader-pane"
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleFileDrop}
        >
          {readerContent && (
            <div className="reading-progress">
              <div className="reading-progress-bar" style={{ width: `${scrollProgress}%` }} />
            </div>
          )}

          {readerContent ? (
            <div className="reader-content" ref={readerRef}>
              {bilingualMode && translatedContent ? (
                <div style={{ maxWidth: settings.readerWidth * 2 + 48, width: '100%' }}>
                  <div className="bilingual-view">
                    <div className="bilingual-column original">
                      <div className="bilingual-label">Original</div>
                      <div className="reader-text" style={{ fontFamily: currentFont.family, fontSize: settings.fontSize, lineHeight: settings.lineHeight }}>
                        {readerContent.split('\n').map((p, i) => p.trim() ? <p key={i}>{p}</p> : null)}
                      </div>
                    </div>
                    <div className="bilingual-column translated">
                      <div className="bilingual-label" style={{ color: getProfileColor(matchedProfile?.name) }}>
                        {matchedProfile?.name} — {matchedProfile?.description}
                      </div>
                      <div className="reader-text" style={{ fontFamily: currentFont.family, fontSize: settings.fontSize, lineHeight: settings.lineHeight }}>
                        {translatedContent.split('\n').map((p, i) => p.trim() ? <p key={i}>{p}</p> : null)}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="reader-content-inner" style={{ maxWidth: settings.readerWidth }}>
                  <div className="reader-text" style={{ fontFamily: currentFont.family, fontSize: settings.fontSize, lineHeight: settings.lineHeight }}>
                    {displayContent.split('\n').map((p, i) => p.trim() ? <p key={i}>{p}</p> : null)}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="welcome-state">
              <div className="welcome-icon">📖</div>
              <h1 className="welcome-title">Welcome to MyReader</h1>
              <p className="welcome-subtitle">
                A premium AI-powered cognitive translation e-reader. Upload content, set your cognitive profile, and read everything translated into your personal reception register.
              </p>
              <div className="welcome-actions">
                <button className="btn btn-primary btn-lg" onClick={() => fileInputRef.current?.click()}>📄 Upload File</button>
                <button className="btn btn-secondary btn-lg" onClick={handlePasteText}>📋 Paste Text</button>
              </div>
              <div className="welcome-feature-grid">
                <div className="welcome-feature"><div className="welcome-feature-icon">🧠</div><div className="welcome-feature-label">27 Cognitive Profiles</div></div>
                <div className="welcome-feature"><div className="welcome-feature-icon">📑</div><div className="welcome-feature-label">Side-by-Side View</div></div>
                <div className="welcome-feature"><div className="welcome-feature-icon">📚</div><div className="welcome-feature-label">EPUB & TXT</div></div>
              </div>
            </div>
          )}

          {isDragging && (
            <div style={{ position: 'absolute', inset: 0, background: 'var(--accent-glow)', border: '3px dashed var(--accent-primary)', borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, backdropFilter: 'blur(4px)' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 48, marginBottom: 'var(--space-3)' }}>📄</div>
                <div style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--accent-primary)' }}>Drop to open</div>
              </div>
            </div>
          )}
        </div>

        {/* ── Cognitive Profile Panel ──────────────── */}
        {profilePanelOpen && (
          <div className="translation-panel">
            <div className="translation-panel-header">
              <div className="translation-panel-title">🧠 Cognitive Profile</div>
              <button className="icon-btn" onClick={() => setProfilePanelOpen(false)}>✕</button>
            </div>

            <div className="translation-content" style={{ padding: 'var(--space-4)' }}>
              {/* Sliders */}
              {[
                { label: 'Spatial', value: spatial, set: setSpatial, gradient: 'spatial' },
                { label: 'Temporal', value: temporal, set: setTemporal, gradient: 'temporal' },
                { label: 'Reference', value: reference, set: setReference, gradient: 'reference' },
              ].map(({ label, value, set, gradient }) => (
                <div key={gradient} style={{ marginBottom: 'var(--space-5)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--text-secondary)' }}>{label}</span>
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {value} — {getPositionLabel(value, gradient)}
                    </span>
                  </div>
                  <div className="settings-slider">
                    <input type="range" min="0" max="100" value={value} onChange={e => set(parseInt(e.target.value))} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: 'var(--space-1)' }}>
                    <span>{GRADIENT_LABELS[gradient].low}</span>
                    <span>{GRADIENT_LABELS[gradient].mid}</span>
                    <span>{GRADIENT_LABELS[gradient].high}</span>
                  </div>
                </div>
              ))}

              {/* Matched profile */}
              {matchedProfile && (
                <div style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: `2px solid ${getProfileColor(matchedProfile.name)}`, background: `${getProfileColor(matchedProfile.name)}15`, marginBottom: 'var(--space-4)', animation: 'fadeIn var(--transition-fast) ease-out' }}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>Target Profile</div>
                  <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: getProfileColor(matchedProfile.name) }}>{matchedProfile.name}</div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: 'var(--space-1)' }}>{matchedProfile.description}</div>
                </div>
              )}

              {/* Quick select */}
              <div style={{ marginBottom: 'var(--space-4)' }}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Quick Select</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
                  {['VISIONARY', 'SHARP', 'GROUNDED', 'LEGACY', 'ALTRUISTIC', 'ATTUNED', 'INTROSPECTIVE', 'EMBODIED', 'EQUANIMOUS'].map(name => (
                    <button key={name} onClick={() => {
                      const p = PROFILES[name];
                      setSpatial(Math.round((p.spatial[0] + p.spatial[1]) / 2));
                      setTemporal(Math.round((p.temporal[0] + p.temporal[1]) / 2));
                      setReference(Math.round((p.reference[0] + p.reference[1]) / 2));
                    }} className={`btn btn-sm ${matchedProfile?.name === name ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ fontSize: 'var(--text-xs)' }}>
                      {name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cost estimate */}
              {estimatedCost && (
                <div style={{ padding: 'var(--space-3)', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-3)', fontSize: 'var(--text-xs)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-tertiary)' }}>
                    <span>Est. cost</span>
                    <span style={{ color: 'var(--warning)', fontWeight: 600 }}>{formatCost(estimatedCost.usd)}</span>
                  </div>
                  <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                    ~{estimatedCost.inputTokens.toLocaleString()} in / ~{estimatedCost.outputTokens.toLocaleString()} out
                  </div>
                  {lastUsage && (
                    <div style={{ marginTop: 'var(--space-2)', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--border-primary)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-tertiary)' }}>
                        <span>Last actual</span>
                        <span style={{ color: 'var(--success)', fontWeight: 600 }}>{formatCost(lastUsage.usd)}</span>
                      </div>
                    </div>
                  )}
                  {sessionUsage.calls > 0 && (
                    <div style={{ marginTop: 'var(--space-2)', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--border-primary)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-tertiary)' }}>
                        <span>Session ({sessionUsage.calls})</span>
                        <span style={{ color: 'var(--info)', fontWeight: 600 }}>{formatCost(costFor(sessionUsage.inputTokens, sessionUsage.outputTokens))}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Translate button */}
              <button
                onClick={translateWithProfile}
                disabled={isTranslating || !readerContent.trim() || !session || (!freeMode && balance != null && balance <= overageLimit)}
                className="btn btn-primary btn-lg"
                style={{ width: '100%', background: isTranslating ? 'var(--bg-surface)' : `linear-gradient(135deg, ${getProfileColor(matchedProfile?.name)}, ${getProfileColor(matchedProfile?.name)}cc)` }}
                id="translate-btn"
              >
                {isTranslating ? (
                  <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Translating…</>
                ) : (
                  `Translate for ${matchedProfile?.name || 'Target'}`
                )}
              </button>

              {translationError && (
                <div style={{ marginTop: 'var(--space-3)', padding: 'var(--space-3)', background: 'rgba(248,113,113,0.1)', border: '1px solid var(--error)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', color: 'var(--error)' }}>
                  {translationError}
                </div>
              )}

              {changes.length > 0 && (
                <div style={{ marginTop: 'var(--space-3)', padding: 'var(--space-3)', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-2)' }}>Translation Applied</div>
                  {changes.map((c, i) => (
                    <div key={i} style={{ fontSize: 'var(--text-xs)', color: 'var(--success)', marginBottom: 2 }}>• {c}</div>
                  ))}
                </div>
              )}

              {/* All 27 profiles grid */}
              <div style={{ marginTop: 'var(--space-5)' }}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>All 27 Profiles</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-1)' }}>
                  {Object.entries(PROFILES).map(([name, config]) => {
                    const isActive = matchedProfile?.name === name;
                    return (
                      <button key={name} onClick={() => {
                        setSpatial(Math.round((config.spatial[0] + config.spatial[1]) / 2));
                        setTemporal(Math.round((config.temporal[0] + config.temporal[1]) / 2));
                        setReference(Math.round((config.reference[0] + config.reference[1]) / 2));
                      }} style={{
                        padding: '4px 2px', fontSize: '9px', border: isActive ? `2px solid ${getProfileColor(name)}` : '1px solid var(--border-primary)',
                        borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: isActive ? `${getProfileColor(name)}25` : 'var(--bg-surface)',
                        color: isActive ? getProfileColor(name) : 'var(--text-tertiary)', fontWeight: isActive ? 700 : 400, transition: 'all var(--transition-fast)',
                        fontFamily: 'var(--font-ui)',
                      }}>
                        {name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Copy translated */}
            {translatedContent && (
              <div className="translation-actions">
                <button className="btn btn-secondary btn-sm" onClick={() => navigator.clipboard.writeText(translatedContent).then(() => showToast('Copied!', 'success'))}>
                  📋 Copy Translation
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Settings Modal ─────────────────────────────── */}
      {showSettings && (
        <div className="settings-overlay" onClick={e => { if (e.target === e.currentTarget) setShowSettings(false); }}>
          <div className="settings-modal">
            <div className="settings-header">
              <div className="settings-title">Settings</div>
              <button className="icon-btn" onClick={() => setShowSettings(false)}>✕</button>
            </div>
            <div className="settings-body">
              <div className="settings-section">
                <div className="settings-section-title">Appearance</div>
                <div className="settings-row">
                  <div><div className="settings-label">Theme</div><div className="settings-hint">Choose your reading ambiance</div></div>
                  <div className="theme-picker">
                    {THEMES.map(t => <button key={t.key} className={`theme-btn ${t.key} ${settings.theme === t.key ? 'active' : ''}`} onClick={() => updateSetting('theme', t.key)} title={t.label} />)}
                  </div>
                </div>
              </div>
              <div className="settings-section">
                <div className="settings-section-title">Typography</div>
                <div className="settings-row">
                  <div className="settings-label">Font</div>
                  <div className="font-selector">
                    {FONT_OPTIONS.map(f => <button key={f.key} className={`font-btn ${settings.fontFamily === f.key ? 'active' : ''}`} onClick={() => updateSetting('fontFamily', f.key)} style={{ fontFamily: f.family }}>{f.label}</button>)}
                  </div>
                </div>
                <div className="settings-row">
                  <div className="settings-label">Font Size</div>
                  <div className="settings-slider"><input type="range" min="12" max="32" value={settings.fontSize} onChange={e => updateSetting('fontSize', parseInt(e.target.value))} /><span className="settings-slider-value">{settings.fontSize}px</span></div>
                </div>
                <div className="settings-row">
                  <div className="settings-label">Line Height</div>
                  <div className="settings-slider"><input type="range" min="1.2" max="2.4" step="0.1" value={settings.lineHeight} onChange={e => updateSetting('lineHeight', parseFloat(e.target.value))} /><span className="settings-slider-value">{settings.lineHeight}</span></div>
                </div>
                <div className="settings-row">
                  <div className="settings-label">Reader Width</div>
                  <div className="settings-slider"><input type="range" min="500" max="1000" step="20" value={settings.readerWidth} onChange={e => updateSetting('readerWidth', parseInt(e.target.value))} /><span className="settings-slider-value">{settings.readerWidth}px</span></div>
                </div>
              </div>
              <div className="settings-section">
                <div className="settings-section-title">Preview</div>
                <div style={{ padding: 'var(--space-5)', background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-primary)' }}>
                  <p style={{ fontFamily: currentFont.family, fontSize: settings.fontSize, lineHeight: settings.lineHeight, color: 'var(--text-reading)', margin: 0 }}>
                    The quick brown fox jumps over the lazy dog. This is how your reading experience will look.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </div>
  );
}

export default MyReader;
