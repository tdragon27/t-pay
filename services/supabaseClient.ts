import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();

let client: SupabaseClient | null = null;
let clientKey: string | null = null;

function isPlaceholder(value: string) {
  return /^(your_|paste_|replace_|example|placeholder)/i.test(value.trim());
}

function isValidSupabaseUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && parsed.hostname.endsWith('.supabase.co');
  } catch {
    return false;
  }
}

export function getSupabaseStatus() {
  const missing: string[] = [];
  const invalid: string[] = [];

  if (!supabaseUrl) missing.push('EXPO_PUBLIC_SUPABASE_URL');
  if (!supabaseAnonKey) missing.push('EXPO_PUBLIC_SUPABASE_ANON_KEY');

  if (supabaseUrl && !isValidSupabaseUrl(supabaseUrl)) invalid.push('EXPO_PUBLIC_SUPABASE_URL');
  if (supabaseAnonKey && isPlaceholder(supabaseAnonKey)) invalid.push('EXPO_PUBLIC_SUPABASE_ANON_KEY');

  const configured = missing.length === 0 && invalid.length === 0;
  const message = missing.length > 0
    ? 'Split sync is not configured yet.'
    : invalid.length > 0
      ? 'Split sync config looks invalid. Check the Supabase URL and anon key.'
      : 'Split sync configured.';

  return { configured, missing, invalid, message };
}

export function isSupabaseConfigured() {
  return getSupabaseStatus().configured;
}

export function getSupabaseClient() {
  const status = getSupabaseStatus();
  if (!status.configured) return null;

  const nextClientKey = supabaseUrl + ':' + supabaseAnonKey.slice(0, 8);
  if (!client || clientKey !== nextClientKey) {
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      realtime: {
        params: { eventsPerSecond: 10 },
      },
    });
    clientKey = nextClientKey;
  }
  return client;
}

export function requireSupabaseClient() {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error(getSupabaseStatus().message);
  return supabase;
}
