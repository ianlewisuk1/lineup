import React, { useState } from "react";
import { supabase } from "../supabase/supabase";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useSeasonConfig } from "../hooks/useSeasonConfig";
import PageShell from "../components/PageShell";

function CreateLeague() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { config: seasonConfig } = useSeasonConfig();
  const currentWeek = seasonConfig?.currentWeek || "Preseason";

  const [leagueName, setLeagueName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [maxManagers, setMaxManagers] = useState(8);
  const [draftType, setDraftType] = useState("manual");
  const [draftOrderType, setDraftOrderType] = useState("random");
  const [draftDate, setDraftDate] = useState("");
  const [draftTime, setDraftTime] = useState("");
  const [timePerPick, setTimePerPick] = useState("120");
  const [overlapWarning, setOverlapWarning] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const getMinDraftDate = () => {
    const now = new Date();
    const localOffset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - localOffset).toISOString().split("T")[0];
  };

  const handleCreateLeague = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (!teamName.trim()) {
        setError("Please enter a team name.");
        setLoading(false);
        return;
      }

      if (draftType === "live" && (!draftDate || !draftTime || !timePerPick)) {
        setError("Please select a draft date, time, and pick duration.");
        setLoading(false);
        return;
      }

      // Build league payload — add live draft fields if applicable
      const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const leagueData = {
        name: leagueName,
        created_by: currentUser.id,
        admin_id: currentUser.id,
        max_managers: maxManagers,
        draft_complete: false,
        draft_type: draftType,
        draft_order_type: draftOrderType,
        scoring_type: "cumulative",
        invite_code: inviteCode,
      };

      if (draftType === "live") {
        const [year, month, day] = draftDate.split('-').map(Number);
        const [hours, minutes] = draftTime.split(':').map(Number);
        const draftDateTime = new Date(year, month - 1, day, hours, minutes, 0);

        if (draftDateTime < new Date(Date.now() + 15 * 60 * 1000)) {
          setError("Draft must be scheduled at least 15 minutes in the future.");
          setLoading(false);
          return;
        }

        const { data: overlapCount } = await supabase.rpc('count_overlapping_drafts', {
          p_draft_time: draftDateTime.toISOString(),
        });

        if (overlapCount >= 5) {
          setOverlapWarning(`${overlapCount} other leagues are drafting within an hour of this time. Please choose a different slot.`);
          setLoading(false);
          return;
        }
        setOverlapWarning(overlapCount > 0
          ? `Note: ${overlapCount} other league${overlapCount > 1 ? 's are' : ' is'} drafting around this time.`
          : ""
        );

        leagueData.draft_date = draftDateTime;
        leagueData.time_per_pick = Number(timePerPick);
      }

      // Insert league, then fire drafts + league_members inserts in parallel
      const { data: newLeague, error: leagueError } = await supabase
        .from('leagues').insert(leagueData).select('id, invite_code').single();
      if (leagueError) throw leagueError;

      await Promise.all([
        supabase.from('drafts').insert({ league_id: newLeague.id }),
        supabase.from('league_members').insert({
          league_id: newLeague.id, user_id: currentUser.id, team_name: teamName.trim(),
          points: 0,
        }),
      ]);

      navigate("/home", { state: { message: `League created! Your invite code is: ${newLeague.invite_code}` } });

    } catch (err) {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 14,
    border: '1.5px solid #E5E7EB', backgroundColor: '#fff', color: '#111827',
    outline: 'none', boxSizing: 'border-box',
  };

  const labelStyle = { fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 };
  const cardStyle = { backgroundColor: '#ffffff', border: '1.5px solid #F3F4F6', borderRadius: 16, padding: '20px', marginBottom: 16 };
  const sectionTitle = { fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 16, marginTop: 0 };

  return (
    <PageShell>
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, color: '#111827', margin: 0 }}>Create a League</h1>
        <p style={{ fontSize: 14, color: '#6B7280', marginTop: 4 }}>Season week: {currentWeek}</p>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
          <p style={{ fontSize: 14, color: '#DC2626', margin: 0 }}>{error}</p>
        </div>
      )}

      <form onSubmit={handleCreateLeague}>
        {/* League settings */}
        <div style={cardStyle}>
          <p style={sectionTitle}>League Settings</p>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>League Name</label>
            <input style={inputStyle} type="text" placeholder="Enter league name" value={leagueName}
              onChange={e => setLeagueName(e.target.value)} maxLength={25} required />
            <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>{leagueName.length}/25 characters</p>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Number of Managers</label>
            <select style={inputStyle} value={maxManagers} onChange={e => setMaxManagers(Number(e.target.value))} required>
              <option value={8}>8 Managers</option>
              <option value={10}>10 Managers</option>
              <option value={12}>12 Managers</option>
            </select>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Draft Type</label>
            <select style={inputStyle} value={draftType} onChange={e => setDraftType(e.target.value)}>
              <option value="manual">Manual Draft</option>
              <option value="live">Live Draft</option>
            </select>
          </div>

          <div style={{ marginBottom: draftOrderType !== "manual" ? 12 : 0 }}>
            <label style={labelStyle}>Draft Order</label>
            <select style={inputStyle} value={draftOrderType} onChange={e => setDraftOrderType(e.target.value)}>
              <option value="random">Random Order</option>
              <option value="admin">Commissioner Sets Order</option>
            </select>
          </div>

          {draftOrderType === "random" && (
            <div style={{ backgroundColor: '#EFF8FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: '10px 14px', marginTop: 12 }}>
              <p style={{ fontSize: 13, color: '#1D4ED8', margin: 0 }}>Draft order will be randomly shuffled when the draft begins.</p>
            </div>
          )}
          {draftOrderType === "admin" && (
            <div style={{ backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '10px 14px', marginTop: 12 }}>
              <p style={{ fontSize: 13, color: '#92400E', margin: 0 }}>You'll be able to arrange the draft order before starting the draft.</p>
            </div>
          )}
        </div>

        {/* Live draft settings */}
        {draftType === "live" && (
          <div style={cardStyle}>
            <p style={sectionTitle}>Live Draft Settings</p>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Draft Date</label>
              <input style={inputStyle} type="date" value={draftDate}
                onChange={e => setDraftDate(e.target.value)}
                min={getMinDraftDate()} max="2026-09-01" required />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Draft Time</label>
              <select style={inputStyle} value={draftTime}
                onChange={e => { setDraftTime(e.target.value); setOverlapWarning(""); }} required>
                <option value="">Select a time…</option>
                {Array.from({ length: 96 }, (_, i) => {
                  const h = Math.floor(i / 4);
                  const m = (i % 4) * 15;
                  const hh = String(h).padStart(2, '0');
                  const mm = String(m).padStart(2, '0');
                  const ampm = h < 12 ? 'AM' : 'PM';
                  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
                  return <option key={i} value={`${hh}:${mm}`}>{h12}:{mm} {ampm}</option>;
                })}
              </select>
            </div>

            {overlapWarning && (
              <div style={{
                backgroundColor: overlapWarning.startsWith('Note') ? '#FFFBEB' : '#FEF2F2',
                border: `1px solid ${overlapWarning.startsWith('Note') ? '#FDE68A' : '#FECACA'}`,
                borderRadius: 10, padding: '10px 14px', marginBottom: 16,
              }}>
                <p style={{ fontSize: 13, color: overlapWarning.startsWith('Note') ? '#92400E' : '#DC2626', margin: 0 }}>{overlapWarning}</p>
              </div>
            )}

            <div style={{ backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
              <p style={{ fontSize: 13, color: '#92400E', margin: 0 }}>Draft must be scheduled at least 15 minutes from now.</p>
            </div>

            <div>
              <label style={labelStyle}>Time on Clock</label>
              <select style={inputStyle} value={timePerPick} onChange={e => setTimePerPick(e.target.value)} required>
                <option value="60">1 minute</option>
                <option value="120">2 minutes</option>
                <option value="300">5 minutes</option>
                <option value="600">10 minutes</option>
              </select>
            </div>
          </div>
        )}

        {/* Manual draft info */}
        {draftType === "manual" && (
          <div style={{ backgroundColor: '#EFF8FF', border: '1px solid #BFDBFE', borderRadius: 16, padding: '16px 20px', marginBottom: 16 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#1D4ED8', margin: '0 0 4px' }}>Manual Draft</p>
            <p style={{ fontSize: 13, color: '#1E40AF', margin: 0 }}>The commissioner will manually input all drafted teams for each manager after league creation.</p>
          </div>
        )}

        {/* Team info */}
        <div style={cardStyle}>
          <p style={sectionTitle}>Your Team</p>
          <label style={labelStyle}>Team Name</label>
          <input style={inputStyle} type="text" placeholder="Enter your team name" value={teamName}
            onChange={e => setTeamName(e.target.value)} maxLength={20} required />
          <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>{teamName.length}/20 characters</p>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%', padding: '14px', borderRadius: 12, border: 'none',
            backgroundColor: loading ? '#E5E7EB' : '#0072BC',
            color: loading ? '#9CA3AF' : '#fff',
            fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? "Creating League…" : "Create League"}
        </button>
      </form>
    </PageShell>
  );
}

export default CreateLeague;
