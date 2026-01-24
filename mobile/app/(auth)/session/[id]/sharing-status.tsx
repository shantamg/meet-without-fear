/**
 * Sharing Status Route
 *
 * @deprecated Sharing functionality has been moved to the Partner tab in the session screen.
 * This route now redirects to the session screen.
 */

import { useLocalSearchParams, Redirect } from 'expo-router';

export default function SharingStatusRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  // Redirect to the session screen - Partner tab will show sharing content
  return <Redirect href={`/session/${id}`} />;
}
