/**
 * Web stub for useOTAUpdate.
 * OTA updates are not applicable on web — the web app always serves
 * the latest deployed build.
 */

export function useOTAUpdate() {
  return {
    showUpdateBanner: false,
    applyUpdate: async () => {},
    dismissUpdate: () => {},
  };
}
