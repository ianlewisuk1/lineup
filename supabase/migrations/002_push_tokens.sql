-- Add push notification token column to users table
-- Used by Capacitor @capacitor/push-notifications to store the device token
-- so the backend can send targeted push notifications (score updates, draft alerts)

ALTER TABLE users ADD COLUMN IF NOT EXISTS push_token TEXT;
