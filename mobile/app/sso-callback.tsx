/**
 * Native fallback for the `/sso-callback` route.
 *
 * The real implementation lives in `sso-callback.web.tsx` — it handles the
 * browser's return from Clerk's OAuth redirect flow (web-only). Native
 * builds use the popup-native `useOAuth` + expo-web-browser path and never
 * land on this route, but Expo Router's route resolver requires every
 * `.web.tsx` file to have a base-name sibling to register the route. This
 * stub satisfies that requirement; if native somehow navigates here
 * (deep-link misconfiguration, etc.) we bounce straight back to the public
 * auth screen rather than rendering a broken blank view.
 */

import { Redirect } from 'expo-router';

export default function SsoCallbackNative() {
  return <Redirect href="/(public)" />;
}
