import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../supabase/supabase";
import { useAuth } from "../context/AuthContext";
import PageShell from "../components/PageShell";

function JoinLeague() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { code } = useParams();

  const [inviteCode, setInviteCode] = useState(code || "");
  const [teamName, setTeamName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleJoinLeague = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (!teamName.trim()) {
        setError("Please enter a team name.");
        setLoading(false);
        return;
      }

      if (teamName.length > 20) {
        setError("Team name must be 20 characters or fewer.");
        setLoading(false);
        return;
      }

      // Find league by invite code
      const { data: leagueData } = await supabase
        .from('leagues').select('id').eq('invite_code', inviteCode.trim().toUpperCase()).single();

      if (!leagueData) {
        setError("League not found. Please check your invite code.");
        setLoading(false);
        return;
      }

      const leagueId = leagueData.id;

      // Already a member — go straight to scouting
      const { data: existingMember } = await supabase
        .from('league_members').select('id').eq('league_id', leagueId).eq('user_id', currentUser.id).single();

      if (existingMember) {
        navigate(`/${leagueId}/scouting`);
        return;
      }

      await supabase.from('league_members').insert({
        league_id: leagueId,
        user_id: currentUser.id,
        team_name: teamName.trim(),
        points: 0,
      });

      navigate(`/${leagueId}/scouting`);

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

  return (
    <PageShell>
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, color: '#111827', margin: 0 }}>Join a League</h1>
        <p style={{ fontSize: 14, color: '#6B7280', marginTop: 4 }}>Enter your invite code to get started</p>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
          <p style={{ fontSize: 14, color: '#DC2626', margin: 0 }}>{error}</p>
        </div>
      )}

      {/* Form */}
      <div style={{ backgroundColor: '#ffffff', border: '1.5px solid #F3F4F6', borderRadius: 16, padding: '20px', marginBottom: 16 }}>
        <form onSubmit={handleJoinLeague}>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Invite Code</label>
            <input
              style={{ ...inputStyle, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}
              type="text"
              placeholder="e.g. WOLF24"
              maxLength={6}
              value={inviteCode}
              onChange={e => setInviteCode(e.target.value)}
              required
            />
            <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>Ask your commissioner for the 6-character code</p>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Team Name</label>
            <input
              style={inputStyle}
              type="text"
              placeholder="Name your fantasy team"
              value={teamName}
              maxLength={20}
              onChange={e => setTeamName(e.target.value)}
              required
            />
            <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>{teamName.length}/20 characters</p>
          </div>

          <button
            type="submit"
            disabled={loading || !inviteCode.trim() || !teamName.trim()}
            style={{
              width: '100%', padding: '14px', borderRadius: 12, border: 'none',
              backgroundColor: (loading || !inviteCode.trim() || !teamName.trim()) ? '#E5E7EB' : '#0072BC',
              color: (loading || !inviteCode.trim() || !teamName.trim()) ? '#9CA3AF' : '#fff',
              fontSize: 15, fontWeight: 700,
              cursor: (loading || !inviteCode.trim() || !teamName.trim()) ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? "Joining…" : "Join League"}
          </button>
        </form>
      </div>

      {/* Help */}
      <div style={{ backgroundColor: '#EFF8FF', border: '1px solid #BFDBFE', borderRadius: 16, padding: '16px 20px' }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: '#1D4ED8', margin: '0 0 8px' }}>Need help?</p>
        <ul style={{ fontSize: 13, color: '#1E40AF', margin: 0, paddingLeft: 16, lineHeight: 1.7 }}>
          <li>Ask your league commissioner for the invite code</li>
          <li>Pick a creative team name — you can change it later</li>
          <li>Team name is limited to 20 characters</li>
        </ul>
      </div>
    </PageShell>
  );
}

export default JoinLeague;
