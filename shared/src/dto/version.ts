export type AppUpdateStatus = 'up-to-date' | 'optional-update' | 'required-update';

export interface VersionCheckResponse {
  updateStatus: AppUpdateStatus;
  latestVersion: string;
  latestBuildNumber: number;
  message?: string;
  downloadUrl?: string;
}
