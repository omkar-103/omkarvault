/**
 * SERVER ONLY — NEVER IMPORT INTO CLIENT COMPONENTS
 *
 * This module creates the server-side Supabase client using the secret key.
 * The SUPABASE_SECRET_KEY must NEVER be exposed to the browser.
 * Only import this file from server-side code (Express routes, server.ts).
 */

// Load .env.local then .env so env vars are available at module initialization time
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.local' });
dotenvConfig();

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || 'placeholder_secret_key';

export const isSupabaseConfigured = Boolean(
  (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) &&
  process.env.SUPABASE_SECRET_KEY &&
  process.env.SUPABASE_SECRET_KEY !== 'placeholder_secret_key'
);

if (!isSupabaseConfigured) {
  console.warn('[Supabase Server] WARNING: SUPABASE_URL or SUPABASE_SECRET_KEY is not configured.');
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
