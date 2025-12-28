/**
 * Legacy signup route stub for tests.
 * Redirects to the unified auth screen.
 */
import { Redirect } from 'expo-router';

export default function SignupRedirect() {
  return <Redirect href="/(public)" />;
}
