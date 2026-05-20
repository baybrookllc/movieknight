-- Performance optimization: Add composite indexes on friend_requests
-- These indexes optimize the common query patterns:
-- 1. WHERE sender_id = ? AND status = 'pending' / 'accepted'
-- 2. WHERE receiver_id = ? AND status = 'pending' / 'accepted'
-- Fixes RPC latency issues on get_pending_requests(), get_sent_requests(), get_friends(), etc.

-- Drop redundant single-column indexes (covered by composite indexes)
DROP INDEX IF EXISTS idx_friend_requests_status;

-- Add composite indexes
CREATE INDEX idx_friend_requests_sender_status
  ON friend_requests(sender_id, status);

CREATE INDEX idx_friend_requests_receiver_status
  ON friend_requests(receiver_id, status);

-- Keep the original sender/receiver indexes for backward compatibility
-- (they provide value for queries that only filter by sender_id or receiver_id)
-- idx_friend_requests_sender and idx_friend_requests_receiver remain unchanged
