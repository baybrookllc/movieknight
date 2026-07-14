'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import { FUNCTIONS_URL, getAuthHeader } from '@/lib/utils';
import type { DtddTopic } from '@/lib/types';

interface TriggerPref {
  user_id: string;
  topic_key: string;
  action: 'flag' | 'hide';
}

interface TriggerWarningsProps {
  userId: string;
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
  const [enabled, setEnabled] = useState(false);
  const [topics, setTopics] = useState<DtddTopic[]>([]);
  const [prefs, setPrefs] = useState<Record<string, 'flag' | 'hide'>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        // 1. Get tw_enabled from profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('tw_enabled')
          .eq('id', userId)
          .single();

        setEnabled(profile?.tw_enabled ?? false);

        // 2. Fetch recent watched titles (up to 10)
        const { data: watchHistory } = await supabase
          .from('watch_history')
          .select('title_id, titles(id)')
          .eq('user_id', userId)
          .in('status', ['watched', 'watching'])
          .is('episode_season', null)
          .order('updated_at', { ascending: false })
          .limit(10);

        const titleIds = (watchHistory ?? [])
          .map(h => h.title_id)
          .filter(Boolean);

        if (titleIds.length === 0) {
          setLoading(false);
          return;
        }

        // 3. Call dtdd-fetch edge function
        const authHeader = await getAuthHeader();
        const res = await fetch(`${FUNCTIONS_URL}/dtdd-fetch`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeader,
          },
          body: JSON.stringify({ title_ids: titleIds }),
        });

        if (!res.ok) {
          setLoading(false);
          return;
        }

        const { topics: fetchedTopics } = await res.json();
        setTopics(fetchedTopics ?? []);

        // 4. Fetch user preferences
        if (fetchedTopics && fetchedTopics.length > 0) {
          const topicKeys = fetchedTopics.map((t: DtddTopic) => t.topicKey);
          const { data: userPrefs } = await supabase
            .from('user_trigger_prefs')
            .select('topic_key, action')
            .eq('user_id', userId)
            .in('topic_key', topicKeys);

          const prefsMap: Record<string, 'flag' | 'hide'> = {};
          (userPrefs ?? []).forEach(pref => {
            prefsMap[pref.topic_key] = pref.action;
          });
          setPrefs(prefsMap);
        }

        setLoading(false);
      } catch (err) {
        console.error('[TriggerWarnings] Error:', err);
        setLoading(false);
      }
    })();
  }, [userId]);

  const handleToggleTW = async () => {
    setSaving(true);
    const newEnabled = !enabled;
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ tw_enabled: newEnabled })
        .eq('id', userId);

      if (error) {
        showToast('Failed to save preference', 'error');
      } else {
        setEnabled(newEnabled);
        showToast(newEnabled ? 'Trigger warnings enabled' : 'Trigger warnings disabled', 'success');
      }
    } catch (err) {
      showToast('Error updating preference', 'error');
    }
    setSaving(false);
  };

  const handleSetPreference = async (topicKey: string, action: 'flag' | 'hide') => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('user_trigger_prefs')
        .upsert(
          {
            user_id: userId,
            topic_key: topicKey,
            action: action,
          },
          { onConflict: 'user_id,topic_key' }
        );

      if (error) {
        showToast('Failed to save preference', 'error');
      } else {
        setPrefs(prev => ({ ...prev, [topicKey]: action }));
        const topic = topics.find(t => t.topicKey === topicKey);
        showToast(`${topic?.topicName || topicKey} ${action === 'hide' ? 'hidden' : 'flagged'}`, 'success');
      }
    } catch (err) {
      showToast('Error updating preference', 'error');
    }
    setSaving(false);
  };

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
            onChange={handleToggleTW}
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
                    onClick={() => handleSetPreference(topic.topicKey, 'flag')}
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
                    onClick={() => handleSetPreference(topic.topicKey, 'hide')}
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
