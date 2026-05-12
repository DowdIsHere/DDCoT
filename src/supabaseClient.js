import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Surface this loudly in the console during dev — auth won't work without it.
  // eslint-disable-next-line no-console
  console.warn('[supabaseClient] REACT_APP_SUPABASE_URL / REACT_APP_SUPABASE_ANON_KEY not set');
}

export const supabase = createClient(
  SUPABASE_URL || '',
  SUPABASE_ANON_KEY || ''
);
