export const config = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '',
  supabaseKey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  botUsername: (import.meta.env.VITE_TELEGRAM_BOT_USERNAME || '').replace(/^@/, ''),
};

export function isConfigured() {
  return /^https:\/\/.+\.supabase\.co$/.test(config.supabaseUrl) && config.supabaseKey.length > 20;
}
