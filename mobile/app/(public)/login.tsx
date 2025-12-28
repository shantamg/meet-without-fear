/**
 * Legacy login route stub for tests.
 * Redirects to the unified auth screen.
 */
import { Redirect } from 'expo-router';

export default function LoginRedirect() {
  return <Redirect href="/(public)" />;
}
