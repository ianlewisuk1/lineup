/**
 * test-draft.js
 *
 * Simulates a full live draft with N virtual users.
 *
 * Usage:
 *   node scripts/test-draft.js --league <leagueId> --users 4 --delay 1000
 *
 * Options:
 *   --league   League UUID to run the draft in (required)
 *   --users    Number of virtual users to create and join (default: 4)
 *   --delay    Ms between each pick (default: 800)
 *   --cleanup  Delete test users after the draft (default: true)
 *
 * Requires:
 *   SUPABASE_URL and SUPABASE_SERVICE_KEY in .env (or environment)
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL     = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in environment');
  process.exit(1);
}

// Admin client (service role) — used for user creation and direct DB ops
const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Parse args
const args = process.argv.slice(2);
const get  = (flag, def) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : def;
};

const LEAGUE_ID   = get('--league',  null);
const N_USERS     = parseInt(get('--users',   '4'),    10);
const PICK_DELAY  = parseInt(get('--delay',   '800'),  10);
const DO_CLEANUP  = get('--cleanup', 'true') !== 'false';

if (!LEAGUE_ID) {
  console.error('Usage: node scripts/test-draft.js --league <leagueId>');
  process.exit(1);
}

const TEST_PREFIX    = `test_draft_${Date.now()}`;
const TEST_PASSWORD  = 'TestPass123!';

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🏈 Draft Test — League: ${LEAGUE_ID}`);
  console.log(`   Virtual users: ${N_USERS} | Pick delay: ${PICK_DELAY}ms\n`);

  // 1. Fetch league to validate
  const { data: league, error: leagueErr } = await adminClient
    .from('leagues')
    .select('id, name, max_managers, admin_id, draft_type')
    .eq('id', LEAGUE_ID)
    .single();

  if (leagueErr || !league) {
    console.error('League not found:', leagueErr?.message);
    process.exit(1);
  }

  console.log(`✅ League: "${league.name}" (max ${league.max_managers} managers)`);

  if (N_USERS > league.max_managers) {
    console.error(`Cannot create ${N_USERS} users — league max is ${league.max_managers}`);
    process.exit(1);
  }

  // 2. Create virtual users
  console.log(`\n👤 Creating ${N_USERS} virtual users...`);
  const users = [];

  for (let i = 0; i < N_USERS; i++) {
    const email = `${TEST_PREFIX}_user${i + 1}@test-lineup.dev`;
    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (error) { console.error(`  Failed to create user ${i + 1}:`, error.message); process.exit(1); }
    users.push({ id: data.user.id, email, index: i + 1 });
    console.log(`  Created: ${email}`);
  }

  // 3. Sign each user in to get their session (for RPC calls)
  console.log('\n🔑 Signing users in...');
  const userClients = [];

  for (const user of users) {
    const client = createClient(SUPABASE_URL, process.env.REACT_APP_SUPABASE_ANON_KEY || SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await client.auth.signInWithPassword({
      email:    user.email,
      password: TEST_PASSWORD,
    });
    if (error) { console.error(`  Sign-in failed for ${user.email}:`, error.message); process.exit(1); }
    userClients.push({ ...user, client });
    console.log(`  Signed in: user${user.index}`);
  }

  // 4. Join league with each user
  console.log('\n🤝 Joining league...');
  for (const user of userClients) {
    const { error } = await user.client.from('league_members').insert({
      league_id:     LEAGUE_ID,
      user_id:       user.id,
      team_name:     `Test Team ${user.index}`,
      points:        0,
      weekly_points: 0,
      weekly_points_history: {},
      free_agent_moves: 0,
      starters: [],
      bench:    [],
    });
    if (error) {
      if (error.code === '23505') {
        console.log(`  user${user.index} already in league — skipping`);
      } else {
        console.error(`  Join failed for user${user.index}:`, error.message);
        process.exit(1);
      }
    } else {
      console.log(`  user${user.index} joined`);
    }
  }

  // 5. Wait for admin to start the draft in the browser
  console.log('\n⏳ Waiting for you to start the draft in the browser...');
  await waitForDraftActive();
  console.log('  Draft is active!');

  // 6. Simulate picks
  console.log('\n🎯 Simulating picks...\n');

  // Cache draft ID
  const { data: draftRow } = await adminClient
    .from('drafts').select('id, draft_order').eq('league_id', LEAGUE_ID).single();
  const DRAFT_ID = draftRow.id;
  console.log(`\n[debug] Draft ID: ${DRAFT_ID}`);
  console.log(`[debug] draft_order: ${JSON.stringify(draftRow.draft_order)}`);
  console.log(`[debug] virtual user IDs: ${userClients.map((u) => `user${u.index}=${u.id}`).join(', ')}\n`);

  // Get all FBS teams ordered by game_points
  const { data: allTeams } = await adminClient
    .from('teams')
    .select('id, school')
    .eq('classification', 'FBS')
    .order('game_points', { ascending: false });

  let pickNumber = 0;
  const pickedTeams = new Set();

  while (true) {
    // Fetch current draft state
    const { data: draft } = await adminClient
      .from('drafts')
      .select('status, current_pick_index, draft_order, total_rounds')
      .eq('league_id', LEAGUE_ID)
      .single();

    if (!draft || draft.status === 'complete') {
      console.log('\n✅ Draft complete!');
      break;
    }

    const order    = draft.draft_order;
    const n        = order.length;
    const idx      = draft.current_pick_index;
    const round    = Math.floor(idx / n);
    const pos      = round % 2 === 0 ? idx % n : (n - 1) - (idx % n);
    const pickerId = order[pos];

    const picker = userClients.find((u) => u.id === pickerId);
    if (!picker) {
      // Human user's turn — wait for them to pick in the browser
      console.log(`  Pick #${pickNumber + 1} — waiting for human to pick...`);
      console.log(`    [debug] pickerId = ${pickerId}`);
      console.log(`    [debug] virtual user IDs = ${userClients.map((u) => u.id).join(', ')}`);
      console.log(`    [debug] draft_order = ${JSON.stringify(order)}`);
      await waitForPickAdvance(idx);
      pickNumber++;
      continue;
    }

    // Pick best available team
    const team = allTeams.find((t) => !pickedTeams.has(t.id));
    if (!team) { console.error('No teams left!'); break; }

    pickNumber++;
    const roundNum = round + 1;
    console.log(`  Pick #${pickNumber} (R${roundNum}) — user${picker.index} → ${team.school}`);

    const { data: result, error: pickErr } = await picker.client.rpc('make_pick', {
      p_draft_id: DRAFT_ID,
      p_team_id:  team.id,
    });

    if (pickErr) { console.error('  make_pick error:', pickErr.message); break; }
    if (result?.error) { console.error('  make_pick rejected:', result.error); break; }

    pickedTeams.add(team.id);

    if (result?.draft_complete) {
      console.log('\n✅ Draft complete!');
      break;
    }

    await sleep(PICK_DELAY);
  }

  // 7. Verify rosters
  console.log('\n📋 Verifying rosters...');
  const { data: members } = await adminClient
    .from('league_members')
    .select('user_id, team_name, starters, bench')
    .eq('league_id', LEAGUE_ID);

  for (const m of members ?? []) {
    const isTest = users.some((u) => u.id === m.user_id);
    if (!isTest) continue;
    const total = (m.starters?.length ?? 0) + (m.bench?.length ?? 0);
    console.log(`  ${m.team_name}: ${m.starters?.length ?? 0} starters, ${m.bench?.length ?? 0} bench (${total} total)`);
  }

  // 8. Cleanup
  if (DO_CLEANUP) {
    console.log('\n🧹 Cleaning up test users...');
    for (const user of users) {
      await adminClient.auth.admin.deleteUser(user.id);
      console.log(`  Deleted: ${user.email}`);
    }
  } else {
    console.log('\n⚠️  Skipped cleanup (--cleanup false). Test users remain in Supabase.');
  }

  console.log('\n🏁 Done.\n');
}

async function waitForPickAdvance(currentIndex) {
  while (true) {
    const { data } = await adminClient
      .from('drafts')
      .select('current_pick_index, status')
      .eq('league_id', LEAGUE_ID)
      .single();
    if (!data || data.status === 'complete' || data.current_pick_index > currentIndex) return;
    await sleep(1000);
  }
}

async function waitForDraftActive() {
  while (true) {
    const { data } = await adminClient
      .from('drafts')
      .select('status')
      .eq('league_id', LEAGUE_ID)
      .single();
    if (data?.status === 'active') return;
    await sleep(2000);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
  console.error('\n💥 Unexpected error:', err.message);
  process.exit(1);
});
