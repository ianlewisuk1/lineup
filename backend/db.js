/**
 * Supabase client for backend use.
 * Uses the service role key — bypasses RLS for all admin/cron operations.
 */
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = { supabase };
