import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { auth, db } from '../firebase/firebase';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { X } from 'lucide-react';

const EditProfileModal = ({ onClose }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Global profile data
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');

  // League-specific data
  const [userLeagues, setUserLeagues] = useState([]);
  const [selectedLeague, setSelectedLeague] = useState('');
  const [teamName, setTeamName] = useState('');
  const [teamAvatar, setTeamAvatar] = useState('');

  const avatarOptions = [
    'avatar1.png', 'avatar2.png', 'avatar3.png', 'avatar4.png',
    'avatar5.png', 'avatar6.png', 'avatar7.png', 'avatar8.png'
  ];

  // Lock background scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Close on Escape
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    loadUserData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedLeague) {
      loadLeagueData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLeague]);

  const loadUserData = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setLoading(false);
      return;
    }

    try {
      const userSnap = await getDoc(doc(db, 'users', currentUser.uid));
      if (userSnap.exists()) {
        const userData = userSnap.data();
        setFirstName(userData.firstName || '');
        setLastName(userData.lastName || '');
        setEmail(userData.email || currentUser.email || '');

        const leagueIds = userData.leagueIds || [];
        if (leagueIds.length) {
          // Fetch leagues in parallel
          const leagueDocs = await Promise.all(
            leagueIds.map((id) => getDoc(doc(db, 'leagues', id)))
          );
          const leagues = leagueDocs
            .map((snap, idx) => (snap.exists() ? { id: leagueIds[idx], name: snap.data().name || 'Unnamed League' } : null))
            .filter(Boolean);

          setUserLeagues(leagues);
          if (leagues.length > 0) setSelectedLeague(leagues[0].id);
        } else {
          setUserLeagues([]);
        }
      }
    } catch (err) {
      console.error('Error loading user data:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadLeagueData = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser || !selectedLeague) return;

    try {
      const memberSnap = await getDoc(doc(db, 'leagues', selectedLeague, 'members', currentUser.uid));
      if (memberSnap.exists()) {
        const m = memberSnap.data();
        setTeamName(m.teamName || '');
        setTeamAvatar(m.teamAvatar || '');
      } else {
        setTeamName('');
        setTeamAvatar('');
      }
    } catch (err) {
      console.error('Error loading league data:', err);
    }
  };

  const handleSave = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
      });

      if (selectedLeague) {
        await updateDoc(doc(db, 'leagues', selectedLeague, 'members', currentUser.uid), {
          teamName: teamName.trim(),
          teamAvatar: teamAvatar,
        });
      }

      onClose?.();
    } catch (err) {
      console.error('Error saving profile:', err);
      alert('Error saving profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Modal content (rendered through a portal)
  const modalUI = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[10000]"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed inset-0 z-[10001] flex items-center justify-center p-4"
        aria-modal="true"
        role="dialog"
        onClick={onClose}
      >
        <div
          className="bg-slate-800 rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto border border-white/20 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white">Edit Profile</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              aria-label="Close"
            >
              <X size={20} className="text-white/60" />
            </button>
          </div>

          {loading ? (
            <div className="text-center py-8">
              <div className="text-2xl mb-2 animate-spin">⚙️</div>
              <p className="text-white">Loading profile...</p>
            </div>
          ) : (
            <>
              {/* Global Settings */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-white mb-4">Global Settings</h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-1">First Name</label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white placeholder-white/50"
                      placeholder="Enter your first name"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-1">Last Name</label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white placeholder-white/50"
                      placeholder="Enter your last name"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-1">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white placeholder-white/50"
                      placeholder="Enter your email"
                    />
                  </div>
                </div>
              </div>

              {/* League Settings */}
              {userLeagues.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-white mb-4">League Settings</h3>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-white/80 mb-1">Select League</label>
                      <select
                        value={selectedLeague}
                        onChange={(e) => setSelectedLeague(e.target.value)}
                        className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white"
                      >
                        {userLeagues.map((league) => (
                          <option key={league.id} value={league.id} className="bg-slate-700 text-white">
                            {league.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-white/80 mb-1">Team Name</label>
                      <input
                        type="text"
                        value={teamName}
                        onChange={(e) => setTeamName(e.target.value)}
                        className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white placeholder-white/50"
                        placeholder="Enter your team name"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-white/80 mb-2">Team Avatar</label>
                      <div className="grid grid-cols-4 gap-2">
                        {avatarOptions.map((avatar, index) => (
                          <button
                            key={avatar}
                            type="button"
                            onClick={() => setTeamAvatar(avatar)}
                            className={`w-12 h-12 rounded-full border-2 transition-all ${
                              teamAvatar === avatar
                                ? 'border-purple-400 ring-2 ring-purple-400/50'
                                : 'border-white/30 hover:border-purple-400/50'
                            }`}
                          >
                            <div className="w-full h-full rounded-full bg-gradient-to-r from-purple-500 to-blue-500 text-white text-xs font-bold flex items-center justify-center">
                              {index + 1}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-3 px-4 bg-white/10 hover:bg-white/20 text-white rounded-lg font-medium transition-colors border border-white/20"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 py-3 px-4 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white rounded-lg font-medium transition-colors"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
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
