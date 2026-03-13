/**
 * pushNotifications.js
 *
 * Initializes Capacitor push notifications.
 * Call initPushNotifications() once after the user is authenticated.
 *
 * On web (browser) this is a no-op — the Capacitor plugin gracefully returns
 * without doing anything, so it's safe to call on all platforms.
 */
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from '../supabase/supabase';

export async function initPushNotifications() {
  // Only runs on native iOS/Android
  if (!Capacitor.isNativePlatform()) return;

  const permStatus = await PushNotifications.checkPermissions();

  if (permStatus.receive === 'prompt') {
    const result = await PushNotifications.requestPermissions();
    if (result.receive !== 'granted') return;
  }

  if (permStatus.receive !== 'granted') return;

  await PushNotifications.register();

  // Save the device token to Supabase so the backend can send targeted pushes
  PushNotifications.addListener('registration', async (token) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from('users')
      .update({ push_token: token.value })
      .eq('id', user.id);
  });

  PushNotifications.addListener('registrationError', (err) => {
    console.error('Push registration error:', err);
  });

  // Foreground notification received
  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log('Push received:', notification);
    // You can show an in-app banner here if desired
  });

  // User tapped a notification
  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    console.log('Push action:', action);
    // Navigate based on action.notification.data if needed
  });
}
