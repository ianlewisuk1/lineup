import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabase/supabase';
import { ChevronDown, User, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import EditProfileModal from './EditProfileModal';

const ProfileDropdown = () => {
  const { userData } = useAuth();
  const userName = userData?.first_name || '';

  const [isOpen, setIsOpen] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const btnRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  // Recompute menu position when opening or on viewport/scroll changes
  const updatePos = () => {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    setPos({ top: r.bottom + 8, left: r.right - 176 });
  };

  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePos();
    window.addEventListener('scroll', updatePos, true);
    window.addEventListener('resize', updatePos);
    return () => {
      window.removeEventListener('scroll', updatePos, true);
      window.removeEventListener('resize', updatePos);
    };
  }, [isOpen]);

  // Escape to close
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setIsOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const handleLogout = async (e) => {
    e.stopPropagation();
    try {
      await supabase.auth.signOut();
      window.location.href = '/';
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const getInitial = () => (userName ? userName[0].toUpperCase() : 'U');

  return (
    <>
      <div style={{ position: 'relative' }}>
        <button
          ref={btnRef}
          type="button"
          onClick={(e) => { e.stopPropagation(); setIsOpen(o => !o); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 10px', borderRadius: 8, cursor: 'pointer',
            backgroundColor: '#F9FAFB', border: '1.5px solid #E5E7EB',
            transition: 'border-color 0.15s',
          }}
          aria-haspopup="menu"
          aria-expanded={isOpen}
        >
          {/* Avatar */}
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #0072BC, #3B82F6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{getInitial()}</span>
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{userName}</span>
          <ChevronDown size={14} color="#6B7280" style={{ transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
        </button>
      </div>

      {/* Portal — backdrop + menu rendered at body level to avoid clipping */}
      {isOpen && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setIsOpen(false)} />
          <div
            role="menu"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed', zIndex: 9999,
              top: pos.top, left: pos.left,
              width: 176,
              backgroundColor: '#ffffff',
              border: '1.5px solid #E5E7EB',
              borderRadius: 10,
              boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
              padding: '4px 0',
            }}
          >
            <button
              type="button"
              role="menuitem"
              onClick={(e) => { e.stopPropagation(); setShowEditModal(true); setIsOpen(false); }}
              style={{ width: '100%', padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 8, border: 'none', backgroundColor: 'transparent', cursor: 'pointer', textAlign: 'left' }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F9FAFB'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <User size={14} color="#6B7280" />
              <span style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>Edit Profile</span>
            </button>

            <div style={{ height: 1, backgroundColor: '#F3F4F6', margin: '2px 0' }} />

            <button
              type="button"
              role="menuitem"
              onClick={handleLogout}
              style={{ width: '100%', padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 8, border: 'none', backgroundColor: 'transparent', cursor: 'pointer', textAlign: 'left' }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#FEF2F2'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <LogOut size={14} color="#DC2626" />
              <span style={{ fontSize: 13, fontWeight: 500, color: '#DC2626' }}>Logout</span>
            </button>
          </div>
        </>,
        document.body
      )}

      {showEditModal && <EditProfileModal onClose={() => setShowEditModal(false)} />}
    </>
  );
};

export default ProfileDropdown;
