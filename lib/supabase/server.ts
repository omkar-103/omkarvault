/**
 * SERVER ONLY — NEVER IMPORT INTO CLIENT COMPONENTS
 *
 * This module creates the server-side Supabase client using the secret key.
 * The SUPABASE_SECRET_KEY must NEVER be exposed to the browser.
 * Only import this file from server-side code (Express routes, server.ts).
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl) {
  throw new Error('[Supabase] SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL environment variable is not set.');
}

if (!supabaseSecretKey) {
  throw new Error('[Supabase] SUPABASE_SECRET_KEY environment variable is not set. This key must NEVER be exposed to the browser.');
}

/**
 * SERVER-ONLY Supabase Admin Client.
 * Uses the secret service role key — bypasses Row Level Security.
 * Must NEVER be imported into any client component or browser code.
 */
export const supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export const STORAGE_BUCKET = process.env.STORAGE_BUCKET || 'omkarvault';
