'use client';

import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import type { Profile, WatchStatus, Title, SearchResult } from './types';

interface FoundUser {
  id: string;
  display_name: string | null;
  username?: string | null;
  avatar_id: string | null;
}

interface Episode {
  episode_number: number;
  name: string;
  [key: string]: unknown;
}

// ══════════════════════════════════════════════════════════════════════════════
// ZUSTAND STORE — All global state from js/state.js, organized by domain
// ══════════════════════════════════════════════════════════════════════════════

export interface FilterState {
  genres: number[];
  minRating: number;
  yearFrom: string;
  yearTo: string;
  format: string;
  platform: string;
  runtime: string;
  country: string;
  cvrs: string;
  language: string;
  moodEnergy: number;
  moodTone: number;
  hideTagged: boolean;
}

export interface EpisodeState {
  [season: number]: {
    [episode: number]: boolean;
  };
}

export interface UserTriggerPref {
  [topicKey: string]: 'hide' | 'flag';
}

export interface CachedTopic {
  topic: string;
  yesSum: number;
  noSum: number;
}

export interface AppStore {
  // ────────────────────────────────────────────────────────────────────────────
  // NAVIGATION
  // ────────────────────────────────────────────────────────────────────────────
  currentView: string;
  setCurrentView: (view: string) => void;
  previousView: string;
  setPreviousView: (view: string) => void;
  searchTimer: NodeJS.Timeout | null;
  setSearchTimer: (timer: NodeJS.Timeout | null) => void;
  activeFilter: string;
  setActiveFilter: (filter: string) => void;
  yearFilterTimer: NodeJS.Timeout | null;
  setYearFilterTimer: (timer: NodeJS.Timeout | null) => void;
  toastTimer: NodeJS.Timeout | null;
  setToastTimer: (timer: NodeJS.Timeout | null) => void;

  // ────────────────────────────────────────────────────────────────────────────
  // AUTH
  // ────────────────────────────────────────────────────────────────────────────
  currentSession: Session | null;
  setCurrentSession: (session: Session | null) => void;
  userProfile: Profile | null;
  setUserProfile: (profile: Profile | null) => void;
  authMode: 'signin' | 'signup' | 'forgot' | 'reset' | 'verify';
  setAuthMode: (mode: 'signin' | 'signup' | 'forgot' | 'reset' | 'verify') => void;
  authRedirect: (() => void) | null;
  setAuthRedirect: (fn: (() => void) | null) => void;

  // ────────────────────────────────────────────────────────────────────────────
  // BROWSE / SEARCH
  // ────────────────────────────────────────────────────────────────────────────
  allGenres: Array<{ id: number; name: string }>;
  setAllGenres: (genres: Array<{ id: number; name: string }>) => void;
  filterState: FilterState;
  setFilterState: (state: Partial<FilterState>) => void;
  currentBrowseLabel: string;
  setCurrentBrowseLabel: (label: string) => void;
  browseOffset: number;
  setBrowseOffset: (offset: number) => void;
  browseHasMore: boolean;
  setBrowseHasMore: (hasMore: boolean) => void;
  filterGeneration: number;
  setFilterGeneration: (gen: number) => void;
  lastResults: SearchResult[];
  setLastResults: (results: SearchResult[]) => void;

  // ────────────────────────────────────────────────────────────────────────────
  // DETAIL PAGE
  // ────────────────────────────────────────────────────────────────────────────
  currentDetailId: string | null;
  setCurrentDetailId: (id: string | null) => void;
  currentWatchStatus: WatchStatus | null;
  setCurrentWatchStatus: (status: WatchStatus | null) => void;
  currentUserRating: number | null;
  setCurrentUserRating: (rating: number | null) => void;
  episodeState: EpisodeState;
  setEpisodeState: (state: EpisodeState) => void;
  seasonEpisodes: { [season: number]: Episode[] };
  setSeasonEpisodes: (episodes: { [season: number]: Episode[] }) => void;

  // ────────────────────────────────────────────────────────────────────────────
  // LISTS
  // ────────────────────────────────────────────────────────────────────────────
  currentListId: string | null;
  setCurrentListId: (id: string | null) => void;
  addToListTitleId: string | null;
  setAddToListTitleId: (id: string | null) => void;
  currentListIsOwner: boolean;
  setCurrentListIsOwner: (isOwner: boolean) => void;
  currentListIsPublic: boolean;
  setCurrentListIsPublic: (isPublic: boolean) => void;
  currentListUserRating: number | null;
  setCurrentListUserRating: (rating: number | null) => void;
  currentListMembers: Array<{ user_id: string; role: string }>;
  setCurrentListMembers: (members: Array<{ user_id: string; role: string }>) => void;
  shareFoundUser: FoundUser | null;
  setShareFoundUser: (user: FoundUser | null) => void;

  // ────────────────────────────────────────────────────────────────────────────
  // COMMUNITY
  // ────────────────────────────────────────────────────────────────────────────
  communityOffset: number;
  setCommunityOffset: (offset: number) => void;
  communitySort: 'top_rated' | 'most_recent' | 'trending';
  setCommunitySort: (sort: 'top_rated' | 'most_recent' | 'trending') => void;
  communityLoaded: boolean;
  setCommunityLoaded: (loaded: boolean) => void;

  // ────────────────────────────────────────────────────────────────────────────
  // PROFILE
  // ────────────────────────────────────────────────────────────────────────────
  editProfileSelectedAvatar: string | null;
  setEditProfileSelectedAvatar: (avatar: string | null) => void;

  // ────────────────────────────────────────────────────────────────────────────
  // CONTENT WARNINGS (TRIGGER WARNINGS)
  // ────────────────────────────────────────────────────────────────────────────
  triggerWarningsEnabled: boolean;
  setTriggerWarningsEnabled: (enabled: boolean) => void;
  twPanelOpen: boolean;
  setTwPanelOpen: (open: boolean) => void;

  // ────────────────────────────────────────────────────────────────────────────
  // HERO CAROUSEL
  // ────────────────────────────────────────────────────────────────────────────
  heroSlides: Title[];
  setHeroSlides: (slides: Title[]) => void;
  heroIndex: number;
  setHeroIndex: (index: number) => void;
  heroTimer: NodeJS.Timeout | null;
  setHeroTimer: (timer: NodeJS.Timeout | null) => void;
  heroActiveLayer: number;
  setHeroActiveLayer: (layer: number) => void;

  // ────────────────────────────────────────────────────────────────────────────
  // TV QR AUTH
  // ────────────────────────────────────────────────────────────────────────────
  tvQRPollTimer: NodeJS.Timeout | null;
  setTvQRPollTimer: (timer: NodeJS.Timeout | null) => void;
  tvQRCode: string | null;
  setTvQRCode: (code: string | null) => void;

  // ────────────────────────────────────────────────────────────────────────────
  // MAPS & SETS — Mutable collections
  // ────────────────────────────────────────────────────────────────────────────
  listRatingMap: Map<string, { avg_rating: number; rating_count: number; user_rating: number | null }>;
  notInterestedSet: Set<string>;
  taggedSet: Set<string>;
  watchStatusMap: Map<string, WatchStatus>;
  watchRatingMap: Map<string, number | null>;
  userTriggerPrefs: Map<string, 'hide' | 'flag'>;
  dtddCache: Map<string, CachedTopic[]>;

  // ────────────────────────────────────────────────────────────────────────────
  // RESET HELPERS
  // ────────────────────────────────────────────────────────────────────────────
  resetDetailState: () => void;
  resetListState: () => void;
  resetBrowseState: () => void;
}

export const useAppStore = create<AppStore>((set) => ({
  // ────────────────────────────────────────────────────────────────────────────
  // NAVIGATION
  // ────────────────────────────────────────────────────────────────────────────
  currentView: 'home',
  setCurrentView: (view) => set({ currentView: view }),
  previousView: 'home',
  setPreviousView: (view) => set({ previousView: view }),
  searchTimer: null,
  setSearchTimer: (timer) => set({ searchTimer: timer }),
  activeFilter: '',
  setActiveFilter: (filter) => set({ activeFilter: filter }),
  yearFilterTimer: null,
  setYearFilterTimer: (timer) => set({ yearFilterTimer: timer }),
  toastTimer: null,
  setToastTimer: (timer) => set({ toastTimer: timer }),

  // ────────────────────────────────────────────────────────────────────────────
  // AUTH
  // ────────────────────────────────────────────────────────────────────────────
  currentSession: null,
  setCurrentSession: (session) => set({ currentSession: session }),
  userProfile: null,
  setUserProfile: (profile) => set({ userProfile: profile }),
  authMode: 'signin',
  setAuthMode: (mode) => set({ authMode: mode }),
  authRedirect: null,
  setAuthRedirect: (fn) => set({ authRedirect: fn }),

  // ────────────────────────────────────────────────────────────────────────────
  // BROWSE / SEARCH
  // ────────────────────────────────────────────────────────────────────────────
  allGenres: [],
  setAllGenres: (genres) => set({ allGenres: genres }),
  filterState: {
    genres: [],
    minRating: 0,
    yearFrom: '',
    yearTo: '',
    format: '',
    platform: '',
    runtime: '',
    country: '',
    cvrs: '',
    language: '',
    moodEnergy: 50,
    moodTone: 50,
    hideTagged: false,
  },
  setFilterState: (state) =>
    set((prev) => ({
      filterState: { ...prev.filterState, ...state },
    })),
  currentBrowseLabel: '',
  setCurrentBrowseLabel: (label) => set({ currentBrowseLabel: label }),
  browseOffset: 0,
  setBrowseOffset: (offset) => set({ browseOffset: offset }),
  browseHasMore: false,
  setBrowseHasMore: (hasMore) => set({ browseHasMore: hasMore }),
  filterGeneration: 0,
  setFilterGeneration: (gen) => set({ filterGeneration: gen }),
  lastResults: [],
  setLastResults: (results) => set({ lastResults: results }),

  // ────────────────────────────────────────────────────────────────────────────
  // DETAIL PAGE
  // ────────────────────────────────────────────────────────────────────────────
  currentDetailId: null,
  setCurrentDetailId: (id) => set({ currentDetailId: id }),
  currentWatchStatus: null,
  setCurrentWatchStatus: (status) => set({ currentWatchStatus: status }),
  currentUserRating: null,
  setCurrentUserRating: (rating) => set({ currentUserRating: rating }),
  episodeState: {},
  setEpisodeState: (state) => set({ episodeState: state }),
  seasonEpisodes: {},
  setSeasonEpisodes: (episodes) => set({ seasonEpisodes: episodes }),

  // ────────────────────────────────────────────────────────────────────────────
  // LISTS
  // ────────────────────────────────────────────────────────────────────────────
  currentListId: null,
  setCurrentListId: (id) => set({ currentListId: id }),
  addToListTitleId: null,
  setAddToListTitleId: (id) => set({ addToListTitleId: id }),
  currentListIsOwner: false,
  setCurrentListIsOwner: (isOwner) => set({ currentListIsOwner: isOwner }),
  currentListIsPublic: false,
  setCurrentListIsPublic: (isPublic) => set({ currentListIsPublic: isPublic }),
  currentListUserRating: null,
  setCurrentListUserRating: (rating) => set({ currentListUserRating: rating }),
  currentListMembers: [],
  setCurrentListMembers: (members) => set({ currentListMembers: members }),
  shareFoundUser: null,
  setShareFoundUser: (user) => set({ shareFoundUser: user }),

  // ────────────────────────────────────────────────────────────────────────────
  // COMMUNITY
  // ────────────────────────────────────────────────────────────────────────────
  communityOffset: 0,
  setCommunityOffset: (offset) => set({ communityOffset: offset }),
  communitySort: 'top_rated',
  setCommunitySort: (sort) => set({ communitySort: sort }),
  communityLoaded: false,
  setCommunityLoaded: (loaded) => set({ communityLoaded: loaded }),

  // ────────────────────────────────────────────────────────────────────────────
  // PROFILE
  // ────────────────────────────────────────────────────────────────────────────
  editProfileSelectedAvatar: null,
  setEditProfileSelectedAvatar: (avatar) => set({ editProfileSelectedAvatar: avatar }),

  // ────────────────────────────────────────────────────────────────────────────
  // CONTENT WARNINGS (TRIGGER WARNINGS)
  // ────────────────────────────────────────────────────────────────────────────
  triggerWarningsEnabled: false,
  setTriggerWarningsEnabled: (enabled) => set({ triggerWarningsEnabled: enabled }),
  twPanelOpen: false,
  setTwPanelOpen: (open) => set({ twPanelOpen: open }),

  // ────────────────────────────────────────────────────────────────────────────
  // HERO CAROUSEL
  // ────────────────────────────────────────────────────────────────────────────
  heroSlides: [],
  setHeroSlides: (slides) => set({ heroSlides: slides }),
  heroIndex: 0,
  setHeroIndex: (index) => set({ heroIndex: index }),
  heroTimer: null,
  setHeroTimer: (timer) => set({ heroTimer: timer }),
  heroActiveLayer: 0,
  setHeroActiveLayer: (layer) => set({ heroActiveLayer: layer }),

  // ────────────────────────────────────────────────────────────────────────────
  // TV QR AUTH
  // ────────────────────────────────────────────────────────────────────────────
  tvQRPollTimer: null,
  setTvQRPollTimer: (timer) => set({ tvQRPollTimer: timer }),
  tvQRCode: null,
  setTvQRCode: (code) => set({ tvQRCode: code }),

  // ────────────────────────────────────────────────────────────────────────────
  // MAPS & SETS — Mutable collections (read-only references)
  // ────────────────────────────────────────────────────────────────────────────
  listRatingMap: new Map(),
  notInterestedSet: new Set(),
  taggedSet: new Set(),
  watchStatusMap: new Map(),
  watchRatingMap: new Map(),
  userTriggerPrefs: new Map(),
  dtddCache: new Map(),

  // ────────────────────────────────────────────────────────────────────────────
  // RESET HELPERS
  // ────────────────────────────────────────────────────────────────────────────
  resetDetailState: () =>
    set({
      currentDetailId: null,
      currentWatchStatus: null,
      currentUserRating: null,
      episodeState: {},
      seasonEpisodes: {},
    }),

  resetListState: () =>
    set({
      currentListId: null,
      currentListIsOwner: false,
      currentListIsPublic: false,
      currentListUserRating: null,
      currentListMembers: [],
      shareFoundUser: null,
    }),

  resetBrowseState: () =>
    set({
      browseOffset: 0,
      browseHasMore: false,
      filterGeneration: 0,
      lastResults: [],
    }),
}));
