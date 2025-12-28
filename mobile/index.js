import { registerRootComponent } from 'expo';
import { ExpoRoot } from 'expo-router';

// Must be a compile-time string literal!
const ctx = require.context('./app');

export function App() {
  return <ExpoRoot context={ctx} />;
}

registerRootComponent(App);
