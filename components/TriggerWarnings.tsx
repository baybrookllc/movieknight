'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import { FUNCTIONS_URL, getAuthHeader } from '@/lib/utils';
import type { DtddTopic } from '@/lib/types';

interface TriggerWarningsProps {
  userId: string;
}

interface TriggerWarningsData {
  enabled: boolean;
  topics: DtddTopic[];
  prefs: Record<string, 'flag' | 'hide'>;
}

const card: React.CSSProperties = {
  padding: 24,
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  marginBottom: 16,
};

const toggleStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  cursor: 'pointer',
};

const topicRow: React.CSSProperties = {
  padding: '12px 0',
  borderBottom: '1px solid var(--border)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: 13,
};

export default function TriggerWarnings({ userId }: TriggerWarningsProps) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const twQueryKey = ['trigger-warnings', userId];

  const { data, isPending } = useQuery({
    queryKey: twQueryKey,
    enabled: !!userId,
    queryFn: async (): Promise<TriggerWarningsData> => {
      // 1. tw_enabled from the profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('tw_enabled')
        .eq('id', userId)
        .single();
      const enabled = profile?.tw_enabled ?? false;

      // 2. Recent watched titles (up to 10)
      const { data: watchHistory } = await supabase
        .from('watch_history')
        .select('title_id, titles(id)')
        .eq('user_id', userId)
        .in('status', ['watched', 'watching'])
        .is('episode_season', null)
        .order('updated_at', { ascending: false })
        .limit(10);

      const titleIds = (watchHistory ?? []).map(h => h.title_id).filter(Boolean);
      if (titleIds.length === 0) return { enabled, topics: [], prefs: {} };

      // 3. dtdd-fetch edge function. A non-OK response is not fatal — the user
      //    still needs the master toggle, so fall through with no topics.
      const authHeader = await getAuthHeader();
      const res = await fetch(`${FUNCTIONS_URL}/dtdd-fetch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({ title_ids: titleIds }),
      });
      if (!res.ok) return { enabled, topics: [], prefs: {} };

      const { topics: fetchedTopics } = await res.json();
      const topics: DtddTopic[] = fetchedTopics ?? [];
      if (topics.length === 0) return { enabled, topics, prefs: {} };

      // 4. This user's per-topic preferences
      const { data: userPrefs } = await supabase
        .from('user_trigger_prefs')
        .select('topic_key, action')
        .eq('user_id', userId)
        .in('topic_key', topics.map(t => t.topicKey));

      const prefs: Record<string, 'flag' | 'hide'> = {};
      (userPrefs ?? []).forEach(p => { prefs[p.topic_key] = p.action; });
      return { enabled, topics, prefs };
    },
  });

  const enabled = data?.enabled ?? false;
  const topics = data?.topics ?? [];
  const prefs = data?.prefs ?? {};
  // `isPending` stays true while the query is disabled — gate on userId.
  const loading = !!userId && isPending;

  // Both mutations below are optimistic: the control moves the instant you click
  // it and rolls back if the write fails. Previously the UI only updated *after*
  // a successful round-trip, so every toggle/flag had a visible lag.
  const { mutate: toggleTW, isPending: togglingTW } = useMutation({
    mutationFn: async (newEnabled: boolean) => {
      const { error } = await supabase
        .from('profiles')
        .update({ tw_enabled: newEnabled })
        .eq('id', userId);
      if (error) throw error;
      return newEnabled;
    },
    onMutate: async (newEnabled) => {
      await queryClient.cancelQueries({ queryKey: twQueryKey });
      const previous = queryClient.getQueryData<TriggerWarningsData>(twQueryKey);
      queryClient.setQueryData<TriggerWarningsData>(twQueryKey, (old) =>
        old ? { ...old, enabled: newEnabled } : old
      );
      return { previous };
    },
    onError: (_err, _newEnabled, context) => {
      if (context?.previous) queryClient.setQueryData(twQueryKey, context.previous);
      showToast('Failed to save preference', 'error');
    },
    onSuccess: (newEnabled) =>
      showToast(newEnabled ? 'Trigger warnings enabled' : 'Trigger warnings disabled', 'success'),
  });

  const { mutate: setPreference, isPending: savingPref } = useMutation({
    mutationFn: async ({ topicKey, action }: { topicKey: string; action: 'flag' | 'hide' }) => {
      const { error } = await supabase
        .from('user_trigger_prefs')
        .upsert({ user_id: userId, topic_key: topicKey, action }, { onConflict: 'user_id,topic_key' });
      if (error) throw error;
      return { topicKey, action };
    },
    onMutate: async ({ topicKey, action }) => {
      await queryClient.cancelQueries({ queryKey: twQueryKey });
      const previous = queryClient.getQueryData<TriggerWarningsData>(twQueryKey);
      queryClient.setQueryData<TriggerWarningsData>(twQueryKey, (old) =>
        old ? { ...old, prefs: { ...old.prefs, [topicKey]: action } } : old
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(twQueryKey, context.previous);
      showToast('Failed to save preference', 'error');
    },
    onSuccess: ({ topicKey, action }) => {
      const topic = topics.find(t => t.topicKey === topicKey);
      showToast(`${topic?.topicName || topicKey} ${action === 'hide' ? 'hidden' : 'flagged'}`, 'success');
    },
  });

  const saving = togglingTW || savingPref;

  if (loading) {
    return (
      <div style={card}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 16 }}>
          Content Warnings
        </h2>
        <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
          <div className="spinner" style={{ width: 24, height: 24, borderWidth: 2 }} />
        </div>
      </div>
    );
  }

  return (
    <div style={card}>
      <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 16 }}>
        Content Warnings
      </h2>

      {/* Master toggle */}
      <div style={{ marginBottom: 20 }}>
        <label style={toggleStyle}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={() => toggleTW(!enabled)}
            disabled={saving}
            style={{ cursor: 'pointer' }}
          />
          <span style={{ fontSize: 14, fontWeight: 500 }}>
            {enabled ? 'Show trigger warnings' : 'Hide trigger warnings'}
          </span>
        </label>
      </div>

      {/* Topics list */}
      {topics.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '12px 0' }}>
          No content warnings found in your watch history
        </div>
      ) : (
        <div>
          {topics.map(topic => {
            const pref = prefs[topic.topicKey];
            const total = topic.yesSum + topic.noSum;
            const percentage = total > 0 ? Math.round((topic.yesSum / total) * 100) : 0;

            return (
              <div key={topic.topicKey} style={topicRow}>
                <div>
                  <div style={{ fontWeight: 500, marginBottom: 2 }}>{topic.topicName}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {percentage}% of viewers flagged ({topic.yesSum} votes)
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => setPreference({ topicKey: topic.topicKey, action: 'flag' })}
                    disabled={saving}
                    style={{
                      padding: '6px 12px',
                      fontSize: 11,
                      fontWeight: 500,
                      background: pref === 'flag' ? 'var(--accent)' : 'var(--bg-surface-2)',
                      color: pref === 'flag' ? '#fff' : 'var(--text)',
                      border: 'none',
                      borderRadius: 'var(--radius)',
                      cursor: 'pointer',
                    }}
                  >
                    Flag
                  </button>
                  <button
                    onClick={() => setPreference({ topicKey: topic.topicKey, action: 'hide' })}
                    disabled={saving}
                    style={{
                      padding: '6px 12px',
                      fontSize: 11,
                      fontWeight: 500,
                      background: pref === 'hide' ? '#ef4444' : 'var(--bg-surface-2)',
                      color: pref === 'hide' ? '#fff' : 'var(--text)',
                      border: 'none',
                      borderRadius: 'var(--radius)',
                      cursor: 'pointer',
                    }}
                  >
                    Hide
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
