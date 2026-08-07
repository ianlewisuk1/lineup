import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing REACT_APP_SUPABASE_URL or REACT_APP_SUPABASE_ANON_KEY. ' +
    'Copy .env.example to .env and fill in your Supabase project values.'
  );
}

// Read the URL fragment before createClient runs. Supabase does not reliably
// honour the redirectTo passed to resetPasswordForEmail — recovery links often
// land on the project Site URL instead — and the client strips the fragment as
// soon as it initialises, so this is the only point at which the app can tell
// that the current page load came from a recovery link.
const initialHashParams = new URLSearchParams(
  typeof window !== "undefined" ? window.location.hash.replace(/^#/, "") : ""
);

export const initialAuthLink = {
  isRecovery: initialHashParams.get("type") === "recovery",
  errorCode: initialHashParams.get("error_code"),
  errorDescription: initialHashParams.get("error_description"),
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
