#!/usr/bin/env node

/**
 * Updates the build number in mobile/app.json and native iOS project
 * Used before deploying to TestFlight or Play Store
 */

const fs = require('fs');
const path = require('path');

const appJsonPath = path.join(__dirname, '..', 'mobile', 'app.json');
const iosInfoPlistPath = path.join(__dirname, '..', 'mobile', 'ios', 'MeetWithoutFear', 'Info.plist');

try {
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));

  // Increment iOS build number
  const currentBuildNumber = parseInt(appJson.expo.ios.buildNumber, 10) || 0;
  const newBuildNumber = currentBuildNumber + 1;
  appJson.expo.ios.buildNumber = String(newBuildNumber);

  // Increment Android version code
  const currentVersionCode = appJson.expo.android.versionCode || 0;
  appJson.expo.android.versionCode = currentVersionCode + 1;

  fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n');

  // Also update native iOS Info.plist if it exists
  if (fs.existsSync(iosInfoPlistPath)) {
    let plistContent = fs.readFileSync(iosInfoPlistPath, 'utf8');
    // Update CFBundleVersion in the plist
    plistContent = plistContent.replace(
      /<key>CFBundleVersion<\/key>\s*<string>\d+<\/string>/,
      `<key>CFBundleVersion</key>\n    <string>${newBuildNumber}</string>`
    );
    fs.writeFileSync(iosInfoPlistPath, plistContent);
    console.log(`Updated native iOS Info.plist CFBundleVersion: ${newBuildNumber}`);
  }

  console.log(`Updated build numbers:`);
  console.log(`  iOS buildNumber: ${appJson.expo.ios.buildNumber}`);
  console.log(`  Android versionCode: ${appJson.expo.android.versionCode}`);
} catch (error) {
  console.error('Error updating build number:', error.message);
  process.exit(1);
}
