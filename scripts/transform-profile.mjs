// DDCoT profile transformation runner
// © 2026 Cognition Blocks LLC. All rights reserved.
//
// Runs the DDCoT transformation (the same prompt template used by src/App.js)
// against each narrative field of a source profile and writes the result to
// docs/profiles/established/<name>.js.
//
// The script calls the Anthropic Messages API directly with the same model
// the deployed app uses (claude-sonnet-4-20250514). The transformation prompt
// is a verbatim copy of buildTransformationPrompt from src/App.js so that
// running this script produces output equivalent to running the DDCoT app.
//
// Usage:
//   ANTHROPIC_API_KEY="$(cat /tmp/ddcot-key)" node scripts/transform-profile.mjs SHARP
//   ANTHROPIC_API_KEY="$(cat /tmp/ddcot-key)" node scripts/transform-profile.mjs --all

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'docs', 'source', 'parser-assessment');
const OUT_DIR = path.join(ROOT, 'docs', 'profiles', 'established');

// 27 CBI profiles -> spatial/temporal/reference midpoints
// (mirrors PROFILES in src/App.js using each axis range's midpoint)
const PROFILES = {
  SHARP:         { spatial: 16, temporal: 16, reference: 83, code: 'Concrete • Past • Self' },
  SEASONED:      { spatial: 16, temporal: 16, reference: 50, code: 'Concrete • Past • Balanced' },
  LEGACY:        { spatial: 16, temporal: 16, reference: 16, code: 'Concrete • Past • Other' },
  EMBODIED:      { spatial: 16, temporal: 50, reference: 83, code: 'Concrete • Present • Self' },
  GROUNDED:      { spatial: 16, temporal: 50, reference: 50, code: 'Concrete • Present • Balanced' },
  ATTUNED:       { spatial: 16, temporal: 50, reference: 16, code: 'Concrete • Present • Other' },
  INTENTIONAL:   { spatial: 16, temporal: 83, reference: 83, code: 'Concrete • Future • Self' },
  RESILIENT:     { spatial: 16, temporal: 83, reference: 50, code: 'Concrete • Future • Balanced' },
  RELIABLE:      { spatial: 16, temporal: 83, reference: 16, code: 'Concrete • Future • Other' },
  INTEGRATED:    { spatial: 50, temporal: 16, reference: 83, code: 'Balanced • Past • Self' },
  COHERENT:      { spatial: 50, temporal: 16, reference: 50, code: 'Balanced • Past • Balanced' },
  RECONCILED:    { spatial: 50, temporal: 16, reference: 16, code: 'Balanced • Past • Other' },
  CENTERED:      { spatial: 50, temporal: 50, reference: 83, code: 'Balanced • Present • Self' },
  EQUANIMOUS:    { spatial: 50, temporal: 50, reference: 50, code: 'Balanced • Present • Balanced' },
  EMPATHETIC:    { spatial: 50, temporal: 50, reference: 16, code: 'Balanced • Present • Other' },
  ACTUALIZED:    { spatial: 50, temporal: 83, reference: 83, code: 'Balanced • Future • Self' },
  HARMONIOUS:    { spatial: 50, temporal: 83, reference: 50, code: 'Balanced • Future • Balanced' },
  COLLABORATIVE: { spatial: 50, temporal: 83, reference: 16, code: 'Balanced • Future • Other' },
  SENTIMENTAL:   { spatial: 83, temporal: 16, reference: 83, code: 'Abstract • Past • Self' },
  REFLECTIVE:    { spatial: 83, temporal: 16, reference: 50, code: 'Abstract • Past • Balanced' },
  IDEALIZED:     { spatial: 83, temporal: 16, reference: 16, code: 'Abstract • Past • Other' },
  INTROSPECTIVE: { spatial: 83, temporal: 50, reference: 83, code: 'Abstract • Present • Self' },
  MINDFUL:       { spatial: 83, temporal: 50, reference: 50, code: 'Abstract • Present • Balanced' },
  INTUITIVE:     { spatial: 83, temporal: 50, reference: 16, code: 'Abstract • Present • Other' },
  VISIONARY:     { spatial: 83, temporal: 83, reference: 83, code: 'Abstract • Future • Self' },
  FORESIGHTED:   { spatial: 83, temporal: 83, reference: 50, code: 'Abstract • Future • Balanced' },
  ALTRUISTIC:    { spatial: 83, temporal: 83, reference: 16, code: 'Abstract • Future • Other' },
};

const GRADIENT_LABELS = {
  spatial: { low: 'Concrete', mid: 'Balanced', high: 'Abstract' },
  temporal: { low: 'Past', mid: 'Present', high: 'Future' },
  reference: { low: 'Other', mid: 'Balanced', high: 'Self' },
};

const getPositionLabel = (value, gradient) => {
  const labels = GRADIENT_LABELS[gradient];
  if (value <= 33) return labels.low;
  if (value <= 66) return labels.mid;
  return labels.high;
};

// Verbatim copy of buildTransformationPrompt from src/App.js (lines 271-349).
// Kept in sync manually; if src/App.js changes, update this too.
function buildTransformationPrompt(content, targetProfile, spatialScore, temporalScore, referenceScore) {
  const spatialLabel = getPositionLabel(spatialScore, 'spatial');
  const temporalLabel = getPositionLabel(temporalScore, 'temporal');
  const referenceLabel = getPositionLabel(referenceScore, 'reference');

  return `You are a Cognitive Architecture Information Modifier. Transform the following content to optimize it for a reader with this cognitive profile:

TARGET PROFILE: ${targetProfile}
- Spatial Processing: ${spatialLabel} (${spatialScore}/100)
- Temporal Processing: ${temporalLabel} (${temporalScore}/100)
- Reference Processing: ${referenceLabel} (${referenceScore}/100)

TRANSFORMATION RULES:

${spatialScore <= 33 ? `CONCRETE PROCESSING (Spatial ${spatialScore}):
- Lead with specific examples BEFORE explaining principles
- Use bullet points and numbered lists extensively
- Replace abstract vocabulary with common, everyday words
- Add sensory-grounded descriptions
- Break complex sentences into shorter ones
- Include "for example," "such as," "like this"
- Convert percentages to real numbers (e.g., "73%" → "73 out of 100")
- Add visual progress indicators where applicable
- Remove or simplify jargon` : ''}

${spatialScore >= 67 ? `ABSTRACT PROCESSING (Spatial ${spatialScore}):
- Lead with principles and frameworks BEFORE examples
- Consolidate bullet points into flowing prose
- Use technical/sophisticated vocabulary
- Focus on underlying patterns and structures
- Combine related ideas into unified concepts
- Remove redundant examples
- Use terms like "framework," "paradigm," "methodology"` : ''}

${temporalScore <= 33 ? `PAST-ORIENTED PROCESSING (Temporal ${temporalScore}):
- Frame everything through historical precedent and proven results
- Add "This has been proven by..." "Historically..." "Case studies show..."
- Emphasize what HAS worked, not what MIGHT work
- Replace future tense with past validation
- Include established patterns and proven methods
- Reference prior success stories and track records
- Use words like "established," "proven," "validated," "demonstrated"
- Remove speculative language` : ''}

${temporalScore >= 67 ? `FUTURE-ORIENTED PROCESSING (Temporal ${temporalScore}):
- Frame everything through possibility and potential
- Add "This could lead to..." "Imagine..." "The implications are..."
- Emphasize what MIGHT happen, emerging trends
- Replace past tense with future projection
- Include speculation and innovation opportunities
- Use words like "potential," "emerging," "could," "will," "future"` : ''}

${referenceScore <= 33 ? `OTHER-ORIENTED PROCESSING (Reference ${referenceScore}):
- Frame ALL benefits for the group/team/community
- Use "we," "our," "the team," "everyone," "together"
- Add collaboration prompts and sharing suggestions
- Emphasize collective benefit over individual gain
- Include "Share this with..." "Discuss with your team..."
- Frame motivation through helping others and group success
- Remove self-focused language` : ''}

${referenceScore >= 67 ? `SELF-ORIENTED PROCESSING (Reference ${referenceScore}):
- Frame ALL benefits for the individual personally
- Use "you," "your," "I," "my," "personal"
- Add reflection questions and self-application prompts
- Emphasize personal relevance and individual benefit
- Include "Ask yourself..." "For your situation..." "What this means for you..."
- Frame motivation through personal growth/gain
- Remove collective language` : ''}

CONTENT TO TRANSFORM:
---
${content}
---

Transform this content completely for the target cognitive profile. Maintain all factual information but restructure, reframe, and rephrase everything to match how this reader naturally processes information.

Output ONLY the transformed content, no explanations or meta-commentary.`;
}

const MODEL = 'claude-sonnet-4-20250514';
const API_URL = 'https://api.anthropic.com/v1/messages';
const MAX_RETRIES = 4;

async function callAnthropic(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  let lastErr;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (res.status === 429 || res.status >= 500) {
        const wait = 2000 * Math.pow(2, attempt);
        console.error(`  http ${res.status}; backing off ${wait}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) {
        throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
      }
      const data = await res.json();
      return {
        text: data.content[0].text,
        usage: data.usage,
      };
    } catch (err) {
      lastErr = err;
      const wait = 2000 * Math.pow(2, attempt);
      console.error(`  ${err.message}; backing off ${wait}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr ?? new Error('Anthropic API failed after retries');
}

const NARRATIVE_STRING_FIELDS = [
  'overview',
  'howYouLearn',
  'howYouCommunicate',
  'phrase',
  'secret',
  'whatOthersGetWrong',
  'hiddenSuperpower',
  'blindSpot',
  'frictionPatterns',
  'energyPatterns',
  'workEnvironments',
  'blockIndicators',
];

async function transform(text, name, profile) {
  const prompt = buildTransformationPrompt(text, name, profile.spatial, profile.temporal, profile.reference);
  const { text: out, usage } = await callAnthropic(prompt);
  return { out: out.trim(), usage };
}

async function transformProfile(name) {
  const profile = PROFILES[name];
  if (!profile) throw new Error(`Unknown profile: ${name}`);

  const srcPath = path.join(SOURCE_DIR, `${name.toLowerCase()}.js`);
  const srcMod = await import(`file://${srcPath}`);
  const src = srcMod[Object.keys(srcMod)[0]];

  console.log(`\n=== ${name} (${profile.code}; spatial=${profile.spatial}, temporal=${profile.temporal}, reference=${profile.reference}) ===`);

  const out = {
    name: src.name,
    code: src.code,
    tagline: src.tagline,
  };

  let totalIn = 0;
  let totalOut = 0;

  for (const field of NARRATIVE_STRING_FIELDS) {
    console.log(`  field: ${field}`);
    const { out: transformed, usage } = await transform(src[field], name, profile);
    out[field] = transformed;
    totalIn += usage?.input_tokens ?? 0;
    totalOut += usage?.output_tokens ?? 0;
  }

  out.strengths = [];
  for (const s of src.strengths) {
    console.log(`  strengths: ${s.title}`);
    const { out: transformed, usage } = await transform(s.description, name, profile);
    out.strengths.push({ title: s.title, description: transformed });
    totalIn += usage?.input_tokens ?? 0;
    totalOut += usage?.output_tokens ?? 0;
  }

  out.challenges = [];
  for (const c of src.challenges) {
    console.log(`  challenges: ${c.title} (challenge)`);
    const a = await transform(c.challenge, name, profile);
    console.log(`  challenges: ${c.title} (remedy)`);
    const b = await transform(c.remedy, name, profile);
    out.challenges.push({ title: c.title, challenge: a.out, remedy: b.out });
    totalIn += (a.usage?.input_tokens ?? 0) + (b.usage?.input_tokens ?? 0);
    totalOut += (a.usage?.output_tokens ?? 0) + (b.usage?.output_tokens ?? 0);
  }

  const exportName = `${name.toLowerCase()}EstablishedProfile`;
  const outPath = path.join(OUT_DIR, `${name.toLowerCase()}.js`);
  const body = `// ${name} Profile - Established tier (DDCoT-transformed)
// Parser Profile™ © 2026 Cognition Blocks LLC
// ${src.code}
//
// Generated by scripts/transform-profile.mjs from
// docs/source/parser-assessment/${name.toLowerCase()}.js using the DDCoT
// transformation prompt (verbatim copy of src/App.js buildTransformationPrompt).
// Target scores: spatial=${profile.spatial}, temporal=${profile.temporal}, reference=${profile.reference}.

export const ${exportName} = ${JSON.stringify(out, null, 2)};
`;
  await fs.writeFile(outPath, body, 'utf8');

  const inCost = (totalIn / 1_000_000) * 3;
  const outCost = (totalOut / 1_000_000) * 15;
  console.log(`  wrote ${outPath}`);
  console.log(`  tokens: ${totalIn} in / ${totalOut} out  cost: $${(inCost + outCost).toFixed(4)}`);

  return { totalIn, totalOut, outPath };
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: ANTHROPIC_API_KEY=... node scripts/transform-profile.mjs <PROFILE_NAME|--all>');
    process.exit(1);
  }

  const targets = arg === '--all' ? Object.keys(PROFILES) : [arg.toUpperCase()];
  for (const name of targets) {
    if (!PROFILES[name]) {
      console.error(`Skip unknown: ${name}`);
      continue;
    }
    await transformProfile(name);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
