export function useVersionCheck() {
  return {
    versionInfo: null,
    showVersionBanner: false,
    dismissVersionBanner: () => {},
  };
}
