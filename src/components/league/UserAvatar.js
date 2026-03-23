import React from "react";

const UserAvatar = ({ member, size = 56, rankStyle, rank }) => {
  const avatarUrl = member.teamAvatar;

  // Handle custom uploaded images (URLs or base64) vs preset avatars
  const isCustomUpload = avatarUrl && (avatarUrl.startsWith('http') || avatarUrl.startsWith('data:'));

  return (
    <div className="relative">
      <div
        className="rounded-full flex items-center justify-center font-bold text-lg flex-shrink-0 shadow-lg overflow-hidden border-2 border-white/30"
        style={{
          width: size,
          height: size,
          backgroundColor: rankStyle.backgroundColor,
          color: rankStyle.color
        }}
      >
        {avatarUrl ? (
          isCustomUpload ? (
            // Custom uploaded image (URL or base64)
            <img
              src={avatarUrl}
              alt={`${member.firstName}'s avatar`}
              className="w-full h-full object-cover"
              onError={(e) => {
                // Fallback to initials if image fails to load
                e.target.style.display = 'none';
                e.target.nextSibling.style.display = 'flex';
              }}
            />
          ) : (
            // Preset numbered avatar
            <div className="w-full h-full bg-gradient-to-r from-purple-500 to-blue-500 text-white text-xs font-bold flex items-center justify-center">
              {['avatar1.png', 'avatar2.png', 'avatar3.png', 'avatar4.png', 'avatar5.png', 'avatar6.png', 'avatar7.png', 'avatar8.png'].indexOf(avatarUrl) + 1}
            </div>
          )
        ) : (
          // Fallback to user initials
          <div className="w-full h-full flex items-center justify-center text-sm font-bold">
            {member.firstName ? member.firstName.charAt(0).toUpperCase() : '?'}
          </div>
        )}

        {/* Fallback initials (hidden by default, shown if image fails) */}
        <div
          className="w-full h-full flex items-center justify-center text-sm font-bold"
          style={{ display: 'none' }}
        >
          {member.firstName ? member.firstName.charAt(0).toUpperCase() : '?'}
        </div>
      </div>

      {/* Rank Number Badge */}
      {rank && (
        <div
          className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shadow-lg border-2 border-white"
          style={{
            backgroundColor: rankStyle.backgroundColor,
            color: rankStyle.color
          }}
        >
          {rank}
        </div>
      )}
    </div>
  );
};

export default UserAvatar;
