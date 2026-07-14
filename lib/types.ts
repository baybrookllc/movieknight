// MovieKnight — TypeScript types derived from Supabase schema

export interface Title {
  id: string;                    // "movie:550" or "tv:1396"
  tmdb_id: number;
  media_type: 'movie' | 'tv';
  title: string;
  overview: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string | null;   // ISO date string
  vote_average: number | null;
  popularity: number | null;
  cached_at: string;
  runtime: number | null;
  original_language: string | null;
  origin_country: string | null;
  certification_ca: string | null;
}

export interface Profile {
  id: string;
  display_name: string | null;
  avatar_id: string | null;
  notify_weekly: boolean;
  notification_email: string | null;
  last_seen: string | null;
  tw_enabled?: boolean;
}

export interface WatchHistory {
  id: string;
  user_id: string;
  title_id: string;
  status: WatchStatus;
  rating: number | null;         // stored as int × 2 (1–10), display as stars (0.5–5)
  episode_season: number | null;
  episode_number: number | null;
  watched_at: string;
}

export type WatchStatus = 'want_to_watch' | 'watching' | 'watched' | 'dropped' | 'not_interested';

export interface CustomList {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  is_public: boolean;
  created_at: string;
}

export interface ListItem {
  id: string;
  list_id: string;
  title_id: string;
  added_by: string | null;
  added_at: string;
}

export interface ListMember {
  list_id: string;
  user_id: string;
  role: 'editor' | 'viewer';
}

export interface Notification {
  id: string;
  user_id: string;
  type: 'friend_request' | 'friend_accepted' | 'recommendation' | 'list_like' | 'watched_together' | 'message';
  actor_id: string | null;
  title_id: string | null;
  list_id: string | null;
  message: string | null;
  created_at: string;
  read_at: string | null;
}

export interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
}

export interface Genre {
  id: number;
  name: string;
  tmdb_id: number;
  media_type: 'movie' | 'tv';
}

// RPC return types
export interface ForYouResult extends Title {
  match_pct: number;
  friend_count: number;
  friend_avatars: string[];
}

export interface TrendingResult extends Title {
  watch_count: number;
  friend_count: number;
}

export interface FriendActivity {
  user_id: string;
  display_name: string | null;
  avatar_id: string | null;
  title_id: string;
  title: string;
  poster_path: string | null;
  status: WatchStatus;
  rating: number | null;
  watched_at: string;
}

// Return shape of the get_conversations() RPC (verified against the live
// function definition — column names here do not match the RPC's older,
// superseded signature that this interface previously described).
export interface Conversation {
  other_id: string;
  display_name: string | null;
  username: string;
  avatar_id: string | null;
  last_message: string;
  last_sent_at: string;
  is_sender: boolean;
  unseen_count: number;
}

// Return shape of the get_notifications() RPC — the joined/enriched row
// (actor + title + list details), distinct from the raw `notifications`
// table row (see Notification above).
export interface NotificationItem {
  id: string;
  type: Notification['type'];
  actor_id: string | null;
  actor_name: string | null;
  actor_avatar: string | null;
  title_id: string | null;
  title: string | null;
  poster_path: string | null;
  list_id: string | null;
  list_title: string | null;
  message: string | null;
  created_at: string;
  read_at: string | null;
}

// Return shape of the get_user_taste_data() RPC — one row per genre with a
// watch count, not a single named-mood object.
export interface GenreWatchCount {
  genre_id: number;
  watch_count: number;
}

// dtdd-fetch edge function's per-topic cache shape (also mirrored locally in
// supabase/functions/dtdd-fetch/index.ts, which can't import this file).
export interface DtddTopic {
  topicKey: string;
  topicName: string;
  yesSum: number;
  noSum: number;
}

export interface SearchResult {
  id: string;
  title: string;
  overview: string | null;
  poster_path: string | null;
  media_type: 'movie' | 'tv';
  release_date: string | null;
  vote_average: number | null;
  similarity?: number;
}
