// Parser Profile - Established tier (30+, professionally established)
// © 2026 Cognition Blocks LLC. All rights reserved.
//
// Re-exports the 27 established-tier profile objects.
// Profile files are added incrementally during the rewrite work; this map
// grows one entry per profile as each file lands.

import { sharpEstablishedProfile } from './sharp.js';

export const establishedProfiles = {
  SHARP: sharpEstablishedProfile,
};

export { sharpEstablishedProfile };
