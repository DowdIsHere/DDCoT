// Parser Profile™ - All 27 Profiles Index
// © 2026 Cognition Blocks LLC. All rights reserved.
// Developed by J.D. Mercer

// Import from grouped profile files
import {
  actualizedProfile,
  altruisticProfile,
  attunedProfile,
  centeredProfile,
  coherentProfile,
  collaborativeProfile,
  embodiedProfile,
} from './profiles-group-1.js';

import {
  empatheticProfile,
  equanimousProfile,
  foresightedProfile,
  groundedProfile,
  harmoniousProfile,
  idealizedProfile,
  integratedProfile,
} from './profiles-group-2.js';

import {
  intentionalProfile,
  introspectiveProfile,
  intuitiveProfile,
  legacyProfile,
  mindfulProfile,
  reconciledProfile,
  reflectiveProfile,
} from './profiles-group-3.js';

import {
  reliableProfile,
  resilientProfile,
  seasonedProfile,
  sentimentalProfile,
  sharpProfile,
  visionaryProfile,
} from './profiles-group-4.js';

// Profile lookup by name
export const profiles = {
  ACTUALIZED: actualizedProfile,
  ALTRUISTIC: altruisticProfile,
  ATTUNED: attunedProfile,
  CENTERED: centeredProfile,
  COHERENT: coherentProfile,
  COLLABORATIVE: collaborativeProfile,
  EMBODIED: embodiedProfile,
  EMPATHETIC: empatheticProfile,
  EQUANIMOUS: equanimousProfile,
  FORESIGHTED: foresightedProfile,
  GROUNDED: groundedProfile,
  HARMONIOUS: harmoniousProfile,
  IDEALIZED: idealizedProfile,
  INTEGRATED: integratedProfile,
  INTENTIONAL: intentionalProfile,
  INTROSPECTIVE: introspectiveProfile,
  INTUITIVE: intuitiveProfile,
  LEGACY: legacyProfile,
  MINDFUL: mindfulProfile,
  RECONCILED: reconciledProfile,
  REFLECTIVE: reflectiveProfile,
  RELIABLE: reliableProfile,
  RESILIENT: resilientProfile,
  SEASONED: seasonedProfile,
  SENTIMENTAL: sentimentalProfile,
  SHARP: sharpProfile,
  VISIONARY: visionaryProfile,
};

// Get profile by gradient scores
export function getProfileByScores(spatial, temporal, reference) {
  // spatial: 0-100 (0=Concrete, 50=Balanced, 100=Abstract)
  // temporal: 0-100 (0=Past, 50=Present, 100=Future)
  // reference: 0-100 (0=Other, 50=Balanced, 100=Self)

  const s = spatial < 33 ? 'Concrete' : spatial > 66 ? 'Abstract' : 'Balanced';
  const t = temporal < 33 ? 'Past' : temporal > 66 ? 'Future' : 'Present';
  const r = reference < 33 ? 'Other' : reference > 66 ? 'Self' : 'Balanced';

  const code = `${s} • ${t} • ${r}`;

  return Object.values(profiles).find(p => p.code === code) || null;
}

// Get profile by code string
export function getProfileByCode(code) {
  return Object.values(profiles).find(p => p.code === code) || null;
}

// Get profile by name
export function getProfileByName(name) {
  return profiles[name.toUpperCase()] || null;
}

// Export count for verification
export const PROFILE_COUNT = Object.keys(profiles).length;

// Export all individually
export {
  actualizedProfile,
  altruisticProfile,
  attunedProfile,
  centeredProfile,
  coherentProfile,
  collaborativeProfile,
  embodiedProfile,
  empatheticProfile,
  equanimousProfile,
  foresightedProfile,
  groundedProfile,
  harmoniousProfile,
  idealizedProfile,
  integratedProfile,
  intentionalProfile,
  introspectiveProfile,
  intuitiveProfile,
  legacyProfile,
  mindfulProfile,
  reconciledProfile,
  reflectiveProfile,
  reliableProfile,
  resilientProfile,
  seasonedProfile,
  sentimentalProfile,
  sharpProfile,
  visionaryProfile,
};
