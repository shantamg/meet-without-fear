const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

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
// E2E Mode: Replace Clerk with mock module
// =============================================================================
// When EXPO_PUBLIC_E2E_MODE=true, substitute @clerk/clerk-expo with a no-op mock.
// This prevents the "useAuth can only be used within <ClerkProvider>" error
// because the mock exports don't have the same runtime context requirements.
// =============================================================================

const isE2EMode = process.env.EXPO_PUBLIC_E2E_MODE === 'true';

if (isE2EMode) {
  // Save original resolver for fallback
  const originalResolveRequest = config.resolver.resolveRequest;

  config.resolver.resolveRequest = (context, moduleName, platform) => {
    // Mock @clerk/clerk-expo main module
    if (moduleName === '@clerk/clerk-expo') {
      return {
        filePath: path.resolve(projectRoot, 'src/mocks/clerk-expo.ts'),
        type: 'sourceFile',
      };
    }

    // Mock @clerk/clerk-expo/token-cache subpath
    if (moduleName === '@clerk/clerk-expo/token-cache') {
      return {
        filePath: path.resolve(projectRoot, 'src/mocks/clerk-expo-token-cache.ts'),
        type: 'sourceFile',
      };
    }

    // Fallback to original resolver
    if (originalResolveRequest) {
      return originalResolveRequest(context, moduleName, platform);
    }

    // Use context's default resolver as final fallback
    return context.resolveRequest(context, moduleName, platform);
  };

  console.log('[Metro] E2E Mode: @clerk/clerk-expo replaced with mock module');
}

module.exports = config;
