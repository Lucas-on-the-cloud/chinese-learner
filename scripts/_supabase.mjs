// Shared Supabase client helper for CLI scripts.
//
// Reads SUPABASE_SERVICE_ROLE_KEY from .env.local for write-capable client
// (bypasses RLS, only for trusted local CLI use — never deploy to browser).
// Falls back to anon key if env var missing — useful for read-only operations
// where public RLS policies allow SELECT.
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const SUPABASE_URL  = 'https://prctmferugkxabyizslx.supabase.co';
const ANON_KEY      = 'sb_publishable_6-_0uUkFDKDCA4HBNdB0Gg_ZEL_GqJQ';

let _serviceKey = null;
function _readServiceKey() {
  if (_serviceKey !== null) return _serviceKey;
  try {
    const env = fs.readFileSync('.env.local', 'utf8');
    const m = env.match(/^\s*SUPABASE_SERVICE_ROLE_KEY\s*=\s*(.+)$/m);
    if (m) {
      _serviceKey = m[1].trim().replace(/^["']|["']$/g, '');
      return _serviceKey;
    }
  } catch {}
  _serviceKey = '';
  return '';
}

/** Returns Supabase client with service-role key (RLS bypass). Errors if key not set. */
export function getServiceClient() {
  const key = _readServiceKey();
  if (!key) {
    console.error('✗ Missing SUPABASE_SERVICE_ROLE_KEY in .env.local — required for writes after Phase 1 RLS lockdown.');
    console.error('  Add this line to .env.local:');
    console.error('    SUPABASE_SERVICE_ROLE_KEY=sb_secret_<your-rotated-key>');
    process.exit(1);
  }
  return createClient(SUPABASE_URL, key);
}

/** Returns Supabase client with anon key. Read-only for non-public tables. */
export function getAnonClient() {
  return createClient(SUPABASE_URL, ANON_KEY);
}

/**
 * Auto-pick: service-role if available (for writes), else anon (read-only).
 * Use when script may do reads OR writes — falls back gracefully.
 */
export function getClient({ writes = false } = {}) {
  if (writes) return getServiceClient();
  const key = _readServiceKey();
  return createClient(SUPABASE_URL, key || ANON_KEY);
}

export const SUPABASE = { url: SUPABASE_URL, anonKey: ANON_KEY };
