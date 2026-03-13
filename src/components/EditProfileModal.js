import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabase/supabase';
import { X } from 'lucide-react';

// Image resizing helper function
// Image resizing helper function
const resizeImage = (file, maxWidth = 200, maxHeight = 200, quality = 0.8) => {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    const timeout = setTimeout(() => {
      reject(new Error('Image processing timeout'));
    }, 10000);

    const objectUrl = URL.createObjectURL(file);
    img.src = objectUrl;

    img.onload = () => {
      clearTimeout(timeout);
      try {
        let { width, height } = img;

        if (width > height) {
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = (width * maxHeight) / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(objectUrl); // cleanup
            if (blob) resolve(blob);
            else reject(new Error('Failed to create blob'));
          },
          'image/jpeg',
          quality
        );
      } catch (err) {
        URL.revokeObjectURL(objectUrl); // cleanup on error
        reject(err);
      }
    };

    img.onerror = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(objectUrl); // cleanup
      reject(new Error('Failed to load image'));
    };
  });
};


const EditProfileModal = ({ onClose }) => {
 const [loading, setLoading] = useState(true);
 const [saving, setSaving] = useState(false);
 const [uploading, setUploading] = useState(false);

 // Global profile data
 const [firstName, setFirstName] = useState('');
 const [lastName, setLastName] = useState('');
 const [email, setEmail] = useState('');

 // League-specific data
 const [userLeagues, setUserLeagues] = useState([]);
 const [selectedLeague, setSelectedLeague] = useState('');
 const [teamName, setTeamName] = useState('');
 const [teamAvatar, setTeamAvatar] = useState('');

 // Uploads a Blob/File OR a data URL string to Supabase Storage and returns the public URL
async function uploadAvatar(fileOrDataUrl) {
  const { data: { user } } = await supabase.auth.getUser();
  const uid = user?.id;
  console.log('uploadAvatar uid:', uid);

  if (!uid) throw new Error("Not signed in");

  let blob = fileOrDataUrl;
  let ext = 'png';
  let contentType = 'image/png';

  if (fileOrDataUrl instanceof Blob) {
    contentType = fileOrDataUrl.type || 'image/png';
    const maybe = contentType.split('/')[1];
    ext = (maybe === 'jpeg') ? 'jpg' : (maybe || 'png');
  } else if (typeof fileOrDataUrl === 'string' && fileOrDataUrl.startsWith('data:')) {
    // Convert data URL to Blob
    const res = await fetch(fileOrDataUrl);
    blob = await res.blob();
    contentType = blob.type || 'image/png';
    const maybe = contentType.split('/')[1];
    ext = (maybe === 'jpeg') ? 'jpg' : (maybe || 'png');
  } else {
    throw new Error('uploadAvatar: expected Blob/File or data URL string');
  }

  const path = `avatars/${uid}/avatar.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, blob, { contentType, upsert: true });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return data.publicUrl;
}

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
   const { data: { user: currentUser } } = await supabase.auth.getUser();
   if (!currentUser) {
     setLoading(false);
     return;
   }

   try {
     const { data: userData, error: userError } = await supabase
       .from('users')
       .select('*')
       .eq('id', currentUser.id)
       .single();

     if (userError) throw userError;

     if (userData) {
       setFirstName(userData.first_name || '');
       setLastName(userData.last_name || '');
       setEmail(userData.email || currentUser.email || '');

       // Fetch leagues this user is a member of
       const { data: memberRows, error: memberError } = await supabase
         .from('league_members')
         .select('league_id, leagues(id, name)')
         .eq('user_id', currentUser.id);

       if (memberError) throw memberError;

       const leagues = (memberRows || [])
         .map(row => row.leagues ? { id: row.leagues.id, name: row.leagues.name || 'Unnamed League' } : null)
         .filter(Boolean);

       setUserLeagues(leagues);
       if (leagues.length > 0) setSelectedLeague(leagues[0].id);
     }
   } catch (err) {
     console.error('Error loading user data:', err);
   } finally {
     setLoading(false);
   }
 };

 const loadLeagueData = async () => {
   const { data: { user: currentUser } } = await supabase.auth.getUser();
   if (!currentUser || !selectedLeague) return;

   try {
     const { data: member, error: memberError } = await supabase
       .from('league_members')
       .select('team_name, team_avatar')
       .eq('league_id', selectedLeague)
       .eq('user_id', currentUser.id)
       .single();

     if (memberError && memberError.code !== 'PGRST116') throw memberError;

     if (member) {
       setTeamName(member.team_name || '');
       setTeamAvatar(member.team_avatar || '');
     } else {
       setTeamName('');
       setTeamAvatar('');
     }
   } catch (err) {
     console.error('Error loading league data:', err);
   }
 };

 // Updated image upload handler with resizing
  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }
    if (file.size > 10_000_000) {
      alert('Image is too large. Please choose a smaller image (under 10MB).');
      return;
    }

    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser || !selectedLeague) return;

    setUploading(true);
    try {
      console.log('Starting image resize...');
      const resizedFile = await resizeImage(file, 200, 200, 0.8); // Blob/File
      console.log('Image resized, size:', resizedFile.size);

      if (resizedFile.size > 2 * 1024 * 1024) {
        alert('Image is still too large after resizing. Please try a different image.');
        return;
      }

      console.log('Uploading to Supabase storage...');
      const url = await uploadAvatar(resizedFile);
      console.log('Upload complete:', url);
      setTeamAvatar(url);
    } catch (error) {
      console.error('Error uploading image:', error);
      alert(`Failed to upload image: ${error.message}`);
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };


 const handleSave = async () => {
   const { data: { user: currentUser } } = await supabase.auth.getUser();
   if (!currentUser) return;

   setSaving(true);
   try {
     const { error: userError } = await supabase
       .from('users')
       .update({
         first_name: firstName.trim(),
         last_name: lastName.trim(),
         email: email.trim(),
       })
       .eq('id', currentUser.id);

     if (userError) throw userError;

     if (selectedLeague) {
       const memberData = {
         team_name: teamName.trim(),
         team_avatar: teamAvatar,
         custom_avatar: teamAvatar.startsWith('http'),
       };

       const { error: memberError } = await supabase
         .from('league_members')
         .update(memberData)
         .eq('league_id', selectedLeague)
         .eq('user_id', currentUser.id);

       if (memberError) throw memberError;
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
                     
                     {/* Current Avatar Display */}
                     {teamAvatar && (
                       <div className="mb-3 flex items-center gap-3">
                         <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-purple-400">
                           {teamAvatar.startsWith('http') ? (
                             <img 
                               src={teamAvatar} 
                               alt="Current avatar" 
                               className="w-full h-full object-cover"
                             />
                           ) : (
                             <div className="w-full h-full bg-gradient-to-r from-purple-500 to-blue-500 text-white text-sm font-bold flex items-center justify-center">
                               {avatarOptions.indexOf(teamAvatar) + 1}
                             </div>
                           )}
                         </div>
                         <button
                           type="button"
                           onClick={() => setTeamAvatar('')}
                           className="text-red-400 hover:text-red-300 text-sm"
                         >
                           Remove Avatar
                         </button>
                       </div>
                     )}

                     {/* Upload Custom Image */}
                     <div className="mb-4">
                       <label className="block w-full cursor-pointer">
                         <div className={`border-2 border-dashed border-white/30 hover:border-purple-400/50 rounded-lg p-4 text-center transition-colors ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                           <div className="text-white/60 mb-2">📷</div>
                           <div className="text-sm text-white/80 font-medium">
                             {uploading ? 'Uploading...' : 'Upload Custom Avatar'}
                           </div>
                           <div className="text-xs text-white/60 mt-1">Max 2MB - please resize large images first</div>
                         </div>
                         <input
                           type="file"
                           accept="image/*"
                           onChange={handleImageUpload}
                           className="hidden"
                           disabled={saving || uploading}
                         />
                       </label>
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
                 disabled={saving || uploading}
                 className="flex-1 py-3 px-4 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white rounded-lg font-medium transition-colors"
               >
                 {saving ? 'Saving...' : uploading ? 'Uploading...' : 'Save Changes'}
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