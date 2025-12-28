module.exports = function (api) {
  api.cache(true);

  const isTest = process.env.NODE_ENV === 'test';

  return {
    presets: [['babel-preset-expo', { unstable_transformImportMeta: true }]],
    plugins: [
      [
        'module-resolver',
        {
          extensions: ['.js', '.jsx', '.ts', '.tsx'],
          alias: {
            '@shared': '../shared/src',
          },
        },
      ],
      // Exclude reanimated plugin in test environment - it requires react-native-worklets/plugin
      // which is not available and causes "Cannot find module" errors during Jest runs
      !isTest && 'react-native-reanimated/plugin',
    ].filter(Boolean),
  };
};
