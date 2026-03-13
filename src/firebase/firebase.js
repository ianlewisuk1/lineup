/**
 * MIGRATION SHIM — firebase/firebase.js
 *
 * Re-exports the Supabase client under the legacy Firebase names so that
 * components that still import { db, auth, storage } from './firebase/firebase'
 * continue to compile while they are being migrated to Supabase individually.
 *
 * Delete this file once all components have been migrated.
 */
export { supabase as auth, supabase as db, supabase as storage } from '../supabase/supabase';
export { supabase } from '../supabase/supabase';
