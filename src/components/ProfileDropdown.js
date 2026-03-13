import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabase/supabase';
import { ChevronDown, User, LogOut } from 'lucide-react';
import EditProfileModal from './EditProfileModal';

const ProfileDropdown = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [userName, setUserName] = useState('');
  const btnRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  // Resolve name
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      const meta = user.user_metadata || {};
      if (meta.full_name) setUserName(meta.full_name.split(' ')[0]);
      else if (meta.first_name) setUserName(meta.first_name);
      else if (user.email) setUserName(user.email.split('@')[0]);
    });
  }, []);

  // Recompute menu position when opening or on viewport changes
  const updatePos = () => {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    setPos({ top: r.bottom + 8, left: r.right - 176 /* w-44 */, width: r.width });
  };

  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePos();
    const onScrollOrResize = () => updatePos();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
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
    if (window.confirm('Are you sure you want to log out?')) {
      try {
        await supabase.auth.signOut();
        window.location.href = '/';
      } catch (err) {
        console.error('Logout error:', err);
      }
    }
  };

  const getInitial = () => (userName ? userName[0].toUpperCase() : 'U');

  return (
    <>
      <div className="relative">
        <button
          ref={btnRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen((o) => !o);
          }}
          className="flex items-center space-x-2 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-all duration-200 border border-white/20"
          aria-haspopup="menu"
          aria-expanded={isOpen}
        >
          <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
            {getInitial()}
          </div>
          <span className="hidden sm:block text-white font-medium">{userName}</span>
          <ChevronDown size={16} className={`text-white/80 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Portal: backdrop + menu live at <body> level */}
      {isOpen &&
        createPortal(
          <>
            {/* Backdrop to catch outside clicks */}
            <div
              className="fixed inset-0 z-[9998]"
              onClick={() => setIsOpen(false)}
            />

            {/* Menu */}
            <div
              className="fixed z-[9999] w-44 bg-slate-800/95 backdrop-blur-lg rounded-lg border border-white/20 shadow-2xl py-1"
              style={{ top: pos.top, left: pos.left }}
              role="menu"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowEditModal(true);
                  setIsOpen(false);
                }}
                className="w-full px-3 py-2 text-left flex items-center space-x-2 hover:bg-white/10 transition-colors duration-200 text-white text-sm"
                role="menuitem"
              >
                <User size={14} className="text-white/60" />
                <span className="font-medium">Edit Profile</span>
              </button>

              <hr className="border-white/20 my-1" />

              <button
                type="button"
                onClick={handleLogout}
                className="w-full px-3 py-2 text-left flex items-center space-x-2 hover:bg-red-500/20 transition-colors duration-200 text-red-400 text-sm"
                role="menuitem"
              >
                <LogOut size={14} />
                <span className="font-medium">Logout</span>
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
