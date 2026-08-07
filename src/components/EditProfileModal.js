import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabase/supabase';
import { X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// Resizes an image file to max 200×200 at 0.8 quality before uploading
const resizeImage = (file, maxWidth = 200, maxHeight = 200, quality = 0.8) => {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    const timeout = setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Image processing timeout'));
    }, 10000);

    img.onload = () => {
      clearTimeout(timeout);
      try {
        let { width, height } = img;
        if (width > height) {
          if (width > maxWidth) { height = (height * maxWidth) / width; width = maxWidth; }
        } else {
          if (height > maxHeight) { width = (width * maxHeight) / height; height = maxHeight; }
        }
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => { URL.revokeObjectURL(objectUrl); blob ? resolve(blob) : reject(new Error('Failed to create blob')); },
          'image/jpeg', quality
        );
      } catch (err) { URL.revokeObjectURL(objectUrl); reject(err); }
    };
    img.onerror = () => { clearTimeout(timeout); URL.revokeObjectURL(objectUrl); reject(new Error('Failed to load image')); };
    img.src = objectUrl;
  });
};

// Uploads a Blob to the `avatars` bucket under {uid}/avatar.{ext} and returns the public URL.
// The uid must stay the first path segment — the storage RLS policies in migration 026
// authorize writes on (storage.foldername(name))[1] = auth.uid().
const uploadAvatar = async (blob, uid) => {
  const contentType = blob.type || 'image/jpeg';
  const ext = contentType.split('/')[1] === 'jpeg' ? 'jpg' : (contentType.split('/')[1] || 'jpg');
  const path = `${uid}/avatar.${ext}`;
  const { error } = await supabase.storage.from('avatars').upload(path, blob, { contentType, upsert: true });
  if (error) throw error;
  // Every upload overwrites the same object, so the public URL is stable and browsers
  // keep serving the previous image for the bucket's cache lifetime. The ?v= stamp makes
  // each upload a distinct URL; storage ignores the query string. It is persisted to
  // league_members.avatar_url, so other members see the new avatar too.
  const { publicUrl } = supabase.storage.from('avatars').getPublicUrl(path).data;
  return `${publicUrl}?v=${Date.now()}`;
};

const EditProfileModal = ({ onClose }) => {
  const { currentUser, userData, updateUserData } = useAuth();

  // Pre-populate from AuthContext — no DB query needed for user fields
  const [firstName, setFirstName] = useState(userData?.first_name || '');
  const [lastName, setLastName]   = useState(userData?.last_name  || '');
  const [email, setEmail]         = useState(userData?.email || currentUser?.email || '');

  // League-specific state — loaded once on mount
  const [leagueData, setLeagueData]       = useState([]); // [{ leagueId, leagueName, teamName, avatarUrl }]
  const [selectedLeagueIdx, setSelectedLeagueIdx] = useState(0);
  const [teamName, setTeamName]           = useState('');
  const [teamAvatar, setTeamAvatar]       = useState('');

  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError]       = useState(null);

  // Track original values to diff on save
  const origUser   = useRef({ firstName: userData?.first_name || '', lastName: userData?.last_name || '', email: userData?.email || currentUser?.email || '' });
  const origLeague = useRef({});

  // Lock background scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Close on Escape
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Single query on open — fetch all leagues + team data for this user
  useEffect(() => {
    if (!currentUser) { setLoading(false); return; }
    const load = async () => {
      try {
        const { data: rows, error: err } = await supabase
          .from('league_members')
          .select('league_id, team_name, avatar_url, leagues!league_members_league_id_fkey(id, name)')
          .eq('user_id', currentUser.id);
        if (err) throw err;

        const leagues = (rows || [])
          .map(r => r.leagues ? {
            leagueId:   r.leagues.id,
            leagueName: r.leagues.name || 'Unnamed League',
            teamName:   r.team_name  || '',
            avatarUrl:  r.avatar_url || '',
          } : null)
          .filter(Boolean);

        setLeagueData(leagues);
        if (leagues.length > 0) {
          setTeamName(leagues[0].teamName);
          setTeamAvatar(leagues[0].avatarUrl);
          origLeague.current = { teamName: leagues[0].teamName, teamAvatar: leagues[0].avatarUrl };
        }
      } catch (err) {
        setError('Failed to load profile data.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [currentUser]);

  // When user switches league, load that league's team data from local state — no extra query
  const handleLeagueChange = (idx) => {
    setSelectedLeagueIdx(idx);
    const league = leagueData[idx];
    if (league) {
      setTeamName(league.teamName);
      setTeamAvatar(league.avatarUrl);
      origLeague.current = { teamName: league.teamName, teamAvatar: league.avatarUrl };
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Please select an image file.'); return; }
    if (file.size > 10_000_000) { setError('Image is too large (max 10MB).'); return; }

    setUploading(true);
    setError(null);
    try {
      const resized = await resizeImage(file, 200, 200, 0.8);
      if (resized.size > 2 * 1024 * 1024) { setError('Image still too large after resize. Try a different image.'); return; }
      const url = await uploadAvatar(resized, currentUser.id);
      setTeamAvatar(url);
    } catch (err) {
      setError(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleSave = async () => {
    if (!currentUser) return;
    setSaving(true);
    setError(null);
    try {
      // Only update users table if something changed
      const userChanged =
        firstName.trim() !== origUser.current.firstName ||
        lastName.trim()  !== origUser.current.lastName  ||
        email.trim()     !== origUser.current.email;

      if (userChanged) {
        const patch = { first_name: firstName.trim(), last_name: lastName.trim(), email: email.trim() };
        const { error: userErr } = await supabase.from('users').update(patch).eq('id', currentUser.id);
        if (userErr) throw userErr;
        // Update AuthContext so home greeting refreshes immediately
        updateUserData(patch);
      }

      // Only update league_members if team data changed
      const selectedLeague = leagueData[selectedLeagueIdx];
      if (selectedLeague) {
        const leagueChanged =
          teamName.trim()  !== origLeague.current.teamName ||
          teamAvatar       !== origLeague.current.teamAvatar;

        if (leagueChanged) {
          const { error: memberErr } = await supabase
            .from('league_members')
            .update({ team_name: teamName.trim(), avatar_url: teamAvatar || null })
            .eq('league_id', selectedLeague.leagueId)
            .eq('user_id', currentUser.id);
          if (memberErr) throw memberErr;
        }
      }

      onClose?.();
    } catch (err) {
      console.error('Error saving profile:', err);
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const selectedLeague = leagueData[selectedLeagueIdx];

  const modalUI = (
    <>
      {/* Backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 10000 }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        onClick={onClose}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{ backgroundColor: '#ffffff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 440, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}
          aria-modal="true"
          role="dialog"
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#111827', margin: 0 }}>Edit Profile</h2>
            <button onClick={onClose} style={{ padding: 6, border: 'none', backgroundColor: 'transparent', cursor: 'pointer', borderRadius: 8, display: 'flex', alignItems: 'center' }}>
              <X size={20} color="#9CA3AF" />
            </button>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2.5px solid #0072BC', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              <p style={{ color: '#6B7280', fontSize: 14, margin: 0 }}>Loading profile...</p>
            </div>
          ) : (
            <>
              {error && (
                <div style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', marginBottom: 20 }}>
                  <p style={{ fontSize: 13, color: '#DC2626', margin: 0 }}>{error}</p>
                </div>
              )}

              {/* Global Settings */}
              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16, marginTop: 0 }}>Account</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {[
                    { label: 'First Name', value: firstName, set: setFirstName, type: 'text', placeholder: 'First name' },
                    { label: 'Last Name',  value: lastName,  set: setLastName,  type: 'text', placeholder: 'Last name' },
                    { label: 'Email',      value: email,     set: setEmail,     type: 'email', placeholder: 'Email address' },
                  ].map(({ label, value, set, type, placeholder }) => (
                    <div key={label}>
                      <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>{label}</label>
                      <input
                        type={type}
                        value={value}
                        onChange={e => set(e.target.value)}
                        placeholder={placeholder}
                        style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #E5E7EB', borderRadius: 8, fontSize: 14, color: '#111827', backgroundColor: '#F9FAFB', outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* League Settings */}
              {leagueData.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <h3 style={{ fontSize: 13, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16, marginTop: 0 }}>League</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                    {/* League selector — only show if in multiple leagues */}
                    {leagueData.length > 1 && (
                      <div>
                        <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Select League</label>
                        <select
                          value={selectedLeagueIdx}
                          onChange={e => handleLeagueChange(Number(e.target.value))}
                          style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #E5E7EB', borderRadius: 8, fontSize: 14, color: '#111827', backgroundColor: '#F9FAFB', outline: 'none', boxSizing: 'border-box' }}
                        >
                          {leagueData.map((l, i) => (
                            <option key={l.leagueId} value={i}>{l.leagueName}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Team name */}
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                        Team Name {leagueData.length > 1 && selectedLeague && <span style={{ color: '#9CA3AF', fontWeight: 400 }}>— {selectedLeague.leagueName}</span>}
                      </label>
                      <input
                        type="text"
                        value={teamName}
                        onChange={e => setTeamName(e.target.value)}
                        placeholder="Enter your team name"
                        style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #E5E7EB', borderRadius: 8, fontSize: 14, color: '#111827', backgroundColor: '#F9FAFB', outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>

                    {/* Avatar */}
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 8 }}>Team Avatar</label>

                      {/* Current avatar preview */}
                      {teamAvatar?.startsWith('http') && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                          <img src={teamAvatar} alt="Avatar" style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', border: '2px solid #E5E7EB' }} />
                          <button type="button" onClick={() => setTeamAvatar('')} style={{ fontSize: 13, color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                            Remove
                          </button>
                        </div>
                      )}

                      {/* Upload */}
                      <label style={{ display: 'block', cursor: uploading ? 'not-allowed' : 'pointer' }}>
                        <div style={{ border: '1.5px dashed #D1D5DB', borderRadius: 10, padding: '14px', textAlign: 'center', backgroundColor: uploading ? '#F9FAFB' : '#fff', opacity: uploading ? 0.6 : 1 }}>
                          <div style={{ fontSize: 20, marginBottom: 4 }}>📷</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{uploading ? 'Uploading...' : 'Upload Avatar'}</div>
                          <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>JPG or PNG, max 10MB</div>
                        </div>
                        <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} disabled={saving || uploading} />
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{ padding: '11px 0', borderRadius: 10, border: '1.5px solid #E5E7EB', backgroundColor: '#fff', color: '#374151', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || uploading}
                  style={{ padding: '11px 0', borderRadius: 10, border: 'none', backgroundColor: saving || uploading ? '#9CA3AF' : '#0072BC', color: '#fff', fontWeight: 600, fontSize: 14, cursor: saving || uploading ? 'not-allowed' : 'pointer' }}
                >
                  {saving ? 'Saving...' : uploading ? 'Uploading...' : 'Save'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );

  return createPortal(modalUI, document.body);
};

export default EditProfileModal;
