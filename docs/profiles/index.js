// Parser Profile - Three-tier registry (kids, youngAdult, established)
// © 2026 Cognition Blocks LLC. All rights reserved.
//
// Top-level registry that merges the three tier maps and exposes lookup
// functions mirroring the scoring contract from
// docs/source/parser-assessment/index.js. The lookup functions accept a
// `tier` argument; when omitted they default to ESTABLISHED to match the
// canonical assessment.

import { establishedProfiles } from './established/index.js';
import { youngAdultProfiles } from './youngAdult/index.js';
import { kidsProfiles } from './kids/index.js';

export const TIERS = Object.freeze({
  KIDS: 'KIDS',
  YOUNG_ADULT: 'YOUNG_ADULT',
  ESTABLISHED: 'ESTABLISHED',
});

export const profiles = {
  [TIERS.KIDS]: kidsProfiles,
  [TIERS.YOUNG_ADULT]: youngAdultProfiles,
  [TIERS.ESTABLISHED]: establishedProfiles,
};

// Canonical profile name list - frozen across all tiers.
export const PROFILE_NAMES = Object.freeze([
  'ACTUALIZED',
  'ALTRUISTIC',
  'ATTUNED',
  'CENTERED',
  'COHERENT',
  'COLLABORATIVE',
  'EMBODIED',
  'EMPATHETIC',
  'EQUANIMOUS',
  'FORESIGHTED',
  'GROUNDED',
  'HARMONIOUS',
  'IDEALIZED',
  'INTEGRATED',
  'INTENTIONAL',
  'INTROSPECTIVE',
  'INTUITIVE',
  'LEGACY',
  'MINDFUL',
  'RECONCILED',
  'REFLECTIVE',
  'RELIABLE',
  'RESILIENT',
  'SEASONED',
  'SENTIMENTAL',
  'SHARP',
  'VISIONARY',
]);

export const PROFILE_COUNT_PER_TIER = PROFILE_NAMES.length; // 27

// Look up a profile by canonical name (case-insensitive) within a tier.
export function getProfile(name, tier = TIERS.ESTABLISHED) {
  if (!name) return null;
  return profiles[tier]?.[name.toUpperCase()] ?? null;
}

// Scoring contract mirrored verbatim from docs/source/parser-assessment/index.js:
//   spatial:   0-100  (0=Concrete, 50=Balanced, 100=Abstract)
//   temporal:  0-100  (0=Past,     50=Present,  100=Future)
//   reference: 0-100  (0=Other,    50=Balanced, 100=Self)
export function getProfileByScores(spatial, temporal, reference, tier = TIERS.ESTABLISHED) {
  const s = spatial < 33 ? 'Concrete' : spatial > 66 ? 'Abstract' : 'Balanced';
  const t = temporal < 33 ? 'Past' : temporal > 66 ? 'Future' : 'Present';
  const r = reference < 33 ? 'Other' : reference > 66 ? 'Self' : 'Balanced';
  const code = `${s} • ${t} • ${r}`;
  return getProfileByCode(code, tier);
}

export function getProfileByCode(code, tier = TIERS.ESTABLISHED) {
  const tierProfiles = profiles[tier] ?? {};
  return Object.values(tierProfiles).find((p) => p?.code === code) ?? null;
}

export { establishedProfiles, youngAdultProfiles, kidsProfiles };
