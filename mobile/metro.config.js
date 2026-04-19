const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getSentryExpoConfig(projectRoot);

// Watch the workspace root for shared package changes
config.watchFolders = [workspaceRoot];

// Let Metro know where to resolve packages
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

config.resolver.disableHierarchicalLookup = true;

// SVG transformer
config.transformer.babelTransformerPath = require.resolve('react-native-svg-transformer');
config.resolver.assetExts = config.resolver.assetExts.filter(ext => ext !== 'svg');
config.resolver.sourceExts = [...config.resolver.sourceExts, 'svg'];

// Path aliases for shared package
config.resolver.alias = {
  '@shared': path.resolve(workspaceRoot, 'shared/src'),
  '@shared/*': path.resolve(workspaceRoot, 'shared/src/*'),
};

// =============================================================================
// Custom module resolution
// =============================================================================
// Handles:
// 1. E2E Mode: Replace @clerk/clerk-expo with mock module
// 2. Web platform: Replace @sentry/react-native with no-op shim
// 3. Web platform: Replace @clerk/clerk-expo/token-cache (browser-incompatible)
// =============================================================================

const isE2EMode = process.env.EXPO_PUBLIC_E2E_MODE === 'true';

// Save original resolver for fallback
const originalResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // --- Web: shim @sentry/react-native ---
  if (platform === 'web' && moduleName === '@sentry/react-native') {
    return {
      filePath: path.resolve(projectRoot, 'src/shims/sentry-web.ts'),
      type: 'sourceFile',
    };
  }

  // Also shim the Sentry metro plugin import on web (only used at config time, but
  // prevents any accidental runtime import)
  if (platform === 'web' && moduleName === '@sentry/react-native/metro') {
    return {
      filePath: path.resolve(projectRoot, 'src/shims/sentry-web.ts'),
      type: 'sourceFile',
    };
  }

  // --- Web: shim Clerk Expo token-cache (uses expo-secure-store, browser-incompatible) ---
  if (platform === 'web' && moduleName === '@clerk/clerk-expo/token-cache') {
    return {
      filePath: path.resolve(projectRoot, 'src/shims/clerk-token-cache-web.ts'),
      type: 'sourceFile',
    };
  }

  // --- E2E Mode: mock Clerk ---
  if (isE2EMode) {
    if (moduleName === '@clerk/clerk-expo') {
      return {
        filePath: path.resolve(projectRoot, 'src/mocks/clerk-expo.ts'),
        type: 'sourceFile',
      };
    }

    if (moduleName === '@clerk/clerk-expo/token-cache') {
      return {
        filePath: path.resolve(projectRoot, 'src/mocks/clerk-expo-token-cache.ts'),
        type: 'sourceFile',
      };
    }
  }

  // Fallback to original resolver
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }

  // Use context's default resolver as final fallback
  return context.resolveRequest(context, moduleName, platform);
};

if (isE2EMode) {
  console.log('[Metro] E2E Mode: @clerk/clerk-expo replaced with mock module');
}

module.exports = config;
