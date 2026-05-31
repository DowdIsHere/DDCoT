// Parser Profile - Young Adult tier (~17-28, college through early career)
// © 2026 Cognition Blocks LLC. All rights reserved.
//
// Re-exports the young-adult-tier profile objects.
// Profile files are added incrementally during the rewrite work; this map
// grows one entry per profile as each file lands.

import { sharpYoungAdultProfile } from './sharp.js';
import { visionaryYoungAdultProfile } from './visionary.js';
import { empatheticYoungAdultProfile } from './empathetic.js';
import { idealizedYoungAdultProfile } from './idealized.js';
import { intentionalYoungAdultProfile } from './intentional.js';
import { attunedYoungAdultProfile } from './attuned.js';

export const youngAdultProfiles = {
  SHARP: sharpYoungAdultProfile,
  VISIONARY: visionaryYoungAdultProfile,
  EMPATHETIC: empatheticYoungAdultProfile,
  IDEALIZED: idealizedYoungAdultProfile,
  INTENTIONAL: intentionalYoungAdultProfile,
  ATTUNED: attunedYoungAdultProfile,
};

export {
  sharpYoungAdultProfile,
  visionaryYoungAdultProfile,
  empatheticYoungAdultProfile,
  idealizedYoungAdultProfile,
  intentionalYoungAdultProfile,
  attunedYoungAdultProfile,
};
