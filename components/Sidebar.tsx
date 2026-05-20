'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { useBadges } from '@/components/BadgeProvider';
import { useNav } from '@/components/NavProvider';

const NAV_ITEMS = [
  {
    href: '/home',
    label: 'Home',
    icon: (
      <svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
    ),
  },
  {
    href: '/trending',
    label: 'Trending',
    icon: (
      <svg viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
    ),
  },
  {
    href: '/browse',
    label: 'Browse',
    icon: (
      <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    ),
  },
  {
    href: '/lists',
    label: 'Lists',
    icon: (
      <svg viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
    ),
  },
  {
    href: '/calendar',
    label: 'Coming Soon',
    icon: (
      <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
    ),
  },
  {
    href: '/mood',
    label: 'Mood',
    icon: (
      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
    ),
  },
  { type: 'spacer' },
  {
    href: '/for-you',
    label: 'For You',
    auth: true,
    icon: (
      <svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
    ),
  },
  {
    href: '/messages',
    label: 'Messages',
    auth: true,
    badge: 'messages',
    icon: (
      <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    ),
  },
  {
    href: '/notifications',
    label: 'Notifications',
    auth: true,
    badge: 'notifications',
    icon: (
      <svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
    ),
  },
  {
    href: '/profile',
    label: 'Profile',
    auth: true,
    icon: (
      <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
    ),
  },
] as const;

export default function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { badges } = useBadges();
  const { mobileOpen, close } = useNav();

  const getBadge = (badge?: string) => {
    if (!badge || !user) return 0;
    if (badge === 'messages') return badges.messages;
    if (badge === 'notifications') return badges.notifications + badges.friendRequests;
    return 0;
  };

  return (
    <nav className={`app-sidebar${mobileOpen ? ' mobile-open' : ''}`}>
      <div className="sidebar-nav">
        {NAV_ITEMS.map((item, i) => {
          if ('type' in item && item.type === 'spacer') {
            return <div key={i} style={{ flex: 1 }} />;
          }

          const navItem = item as { href: string; label: string; auth?: boolean; badge?: string; icon: React.ReactNode };
          if (navItem.auth && !user) return null;

          const isActive = pathname === navItem.href || pathname.startsWith(navItem.href + '/');
          const badgeCount = getBadge(navItem.badge);

          return (
            <Link
              key={navItem.href}
              href={navItem.href}
              className={`sidebar-link${isActive ? ' active' : ''}`}
              onClick={close}
            >
              {navItem.icon}
              {navItem.label}
              {badgeCount > 0 && (
                <span className="sidebar-badge">
                  {badgeCount > 99 ? '99+' : badgeCount}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
