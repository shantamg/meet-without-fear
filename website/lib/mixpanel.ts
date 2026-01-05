/**
 * Mixpanel tracking for Meet Without Fear website
 *
 * This module provides client-side analytics tracking with proper identity management
 * to link anonymous website visitors to authenticated users.
 */

import mixpanel from 'mixpanel-browser';

const MIXPANEL_TOKEN = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;
const USER_UUID_KEY = 'mwf_user_uuid';
const ALIAS_FLAG_PREFIX = 'mwf_aliased_';

let isInitialized = false;

/**
 * Initialize Mixpanel with configuration
 * Should be called once when the app loads
 */
export function initMixpanel(): void {
  if (isInitialized) return;

  if (!MIXPANEL_TOKEN) {
    console.warn('[Mixpanel] No token found, tracking disabled');
    return;
  }

  mixpanel.init(MIXPANEL_TOKEN, {
    debug: process.env.NODE_ENV === 'development',
    track_pageview: false, // We track page views manually
    persistence: 'localStorage',
  });

  // Identify returning user early so all events are tied to them
  const storedUuid = localStorage.getItem(USER_UUID_KEY);
  if (storedUuid) {
    mixpanel.identify(storedUuid);
    mixpanel.register({ user_id: storedUuid });
  }

  // Register environment super properties
  mixpanel.register({
    environment: process.env.NODE_ENV === 'production' ? 'prod' : 'dev',
    platform: 'web',
    schema_version: '2026-01',
  });

  isInitialized = true;
  console.log('[Mixpanel] Initialized');
}

/**
 * Track a page view with UTM parameters
 */
export function trackPageView(): void {
  if (!isInitialized) return;

  const url = new URL(window.location.href);
  const utmParams: Record<string, string | undefined> = {
    utm_source: url.searchParams.get('utm_source') ?? undefined,
    utm_medium: url.searchParams.get('utm_medium') ?? undefined,
    utm_campaign: url.searchParams.get('utm_campaign') ?? undefined,
    utm_term: url.searchParams.get('utm_term') ?? undefined,
    utm_content: url.searchParams.get('utm_content') ?? undefined,
  };

  // Remove undefined values
  const cleanUtmParams = Object.fromEntries(
    Object.entries(utmParams).filter(([, v]) => v !== undefined)
  );

  mixpanel.track('Website Visit', {
    path: window.location.pathname,
    referrer: document.referrer || undefined,
    ...cleanUtmParams,
  });
}

/**
 * Track a custom event
 */
export function trackEvent(
  eventName: string,
  properties?: Record<string, unknown>
): void {
  if (!isInitialized) {
    console.warn('[Mixpanel] Not initialized, event not tracked:', eventName);
    return;
  }

  mixpanel.track(eventName, properties);
}

/**
 * Identify a user after authentication
 * This should be called after successful OAuth sign-in
 *
 * @param userId - The user's unique identifier (from Clerk)
 */
export function identifyUser(userId: string): void {
  if (!isInitialized) return;

  // Store UUID for future sessions
  localStorage.setItem(USER_UUID_KEY, userId);

  // Check if we need to alias (first time this user logs in on this device)
  const aliasFlag = `${ALIAS_FLAG_PREFIX}${userId}`;
  const hasAliased = localStorage.getItem(aliasFlag);

  if (!hasAliased) {
    // First-time login: create alias to merge anonymous events
    mixpanel.alias(userId);
    localStorage.setItem(aliasFlag, 'true');
    console.log('[Mixpanel] Created alias for user:', userId);
  }

  // Identify the user
  mixpanel.identify(userId);

  // Register user_id as super property
  mixpanel.register({ user_id: userId });

  console.log('[Mixpanel] User identified:', userId);
}

/**
 * Set user profile properties
 */
export function setUserProperties(properties: Record<string, unknown>): void {
  if (!isInitialized) return;

  mixpanel.people.set(properties);
}

/**
 * Set user profile properties only if not already set
 */
export function setUserPropertiesOnce(
  properties: Record<string, unknown>
): void {
  if (!isInitialized) return;

  mixpanel.people.set_once(properties);
}

/**
 * Reset user identity (call on logout)
 */
export function resetUser(): void {
  if (!isInitialized) return;

  localStorage.removeItem(USER_UUID_KEY);
  mixpanel.reset();
  console.log('[Mixpanel] User reset');
}

/**
 * Get the current distinct ID
 */
export function getDistinctId(): string | undefined {
  if (!isInitialized) return undefined;

  return mixpanel.get_distinct_id();
}

// MVP Event Helpers

/**
 * Track successful sign in (calls identifyUser internally)
 */
export function trackSignIn(
  provider: string,
  userId: string,
  isNewUser: boolean
): void {
  identifyUser(userId);
  const eventName = isNewUser ? 'Sign Up Completed' : 'Sign In Completed';
  trackEvent(eventName, { method: 'oauth', provider, user_id: userId });
}

/**
 * Track invitation page view
 */
export function trackInvitationViewed(
  invitationId: string,
  status: 'pending' | 'expired' | 'accepted' | 'declined' | 'not_found'
): void {
  trackEvent('Invitation Page Viewed', { invitation_id: invitationId, status });
}

/**
 * Track invitation accepted
 */
export function trackInvitationAccepted(
  invitationId: string,
  inviterId?: string
): void {
  trackEvent('Invitation Accepted', {
    invitation_id: invitationId,
    inviter_id: inviterId,
  });
}

/**
 * Track app download click
 */
export function trackAppDownload(
  platform: 'ios' | 'android',
  source: string
): void {
  trackEvent('App Download Clicked', { platform, source });
}
