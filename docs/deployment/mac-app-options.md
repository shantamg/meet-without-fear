---
created: 2026-03-11
updated: 2026-03-11
status: reference
---

# Mac App Distribution Options

> **Note:** None of these options have been implemented. This document captures research into potential Mac app packaging approaches.

## Option 1: Expo Web + Tauri (Recommended)

Build a web bundle from the existing Expo app and wrap it in Tauri for a native Mac `.app`.

**Pros:**
- Fastest path — Expo already supports web via `react-native-web`
- Tauri produces small (~5MB) native bundles
- Most React Native code works on web out of the box

**Cons:**
- Native modules (e.g., Ably, push notifications) need web-compatible equivalents
- UI needs responsive layout adjustments for larger screens

**Steps:**
```bash
# 1. Add web support
npx expo install react-dom react-native-web @expo/metro-runtime

# 2. Test in browser
npx expo start --web

# 3. Set up Tauri
npm install -D @tauri-apps/cli
npx tauri init
npx tauri build
```

## Option 2: Expo Web + Electron

Same as Option 1 but using Electron instead of Tauri.

**Pros:**
- Larger ecosystem, more community support
- Better compatibility with Node.js native modules

**Cons:**
- Much larger bundle size (~150MB+)
- Higher memory usage

## Option 3: React Native macOS (react-native-macos)

Microsoft's fork that renders native AppKit views on macOS.

**Pros:**
- Truly native Mac experience (AppKit, not a web wrapper)
- Best performance and OS integration

**Cons:**
- Limited Expo support — likely requires ejecting or custom dev client
- Some React Native components may not support macOS target
- More platform-specific code needed

**Link:** https://github.com/microsoft/react-native-macos

## Option 4: Mac Catalyst

Run the iOS build on Mac via Apple's Catalyst framework.

**Pros:**
- Automatic if you already have an iOS app
- No additional codebase to maintain

**Cons:**
- Requires Apple Developer account + App Store or notarization
- UI can feel like a scaled iPad app
- Limited control over Mac-specific UX

## Assessment TODO

- [ ] Test `npx expo start --web` and identify what breaks
- [ ] Audit native module usage for web compatibility (Ably, SecureStore, etc.)
- [ ] Evaluate responsive layout needs for desktop screen sizes
- [ ] Decide between Tauri vs Electron based on native module requirements
