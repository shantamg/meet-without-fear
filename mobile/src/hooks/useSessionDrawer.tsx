/**
 * Session Drawer Hook
 *
 * Manages the state of the hamburger menu drawer:
 * - Open/close state
 * - Selected tab (Inner Thoughts vs Partner Sessions)
 * - Exposed via context for global access
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

// ============================================================================
// Types
// ============================================================================

export type DrawerTab = 'inner-thoughts' | 'partner-sessions';

export interface SessionDrawerContextValue {
  /** Whether the drawer is currently open */
  isOpen: boolean;
  /** Open the drawer */
  openDrawer: () => void;
  /** Close the drawer */
  closeDrawer: () => void;
  /** Toggle the drawer open/closed */
  toggleDrawer: () => void;
  /** Currently selected tab in the drawer */
  selectedTab: DrawerTab;
  /** Set the selected tab */
  setSelectedTab: (tab: DrawerTab) => void;
}

// ============================================================================
// Context
// ============================================================================

const SessionDrawerContext = createContext<SessionDrawerContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

export function SessionDrawerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState<DrawerTab>('inner-thoughts');

  const openDrawer = useCallback(() => setIsOpen(true), []);
  const closeDrawer = useCallback(() => setIsOpen(false), []);
  const toggleDrawer = useCallback(() => setIsOpen((prev) => !prev), []);

  const value: SessionDrawerContextValue = {
    isOpen,
    openDrawer,
    closeDrawer,
    toggleDrawer,
    selectedTab,
    setSelectedTab,
  };

  return (
    <SessionDrawerContext.Provider value={value}>
      {children}
    </SessionDrawerContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useSessionDrawer(): SessionDrawerContextValue {
  const context = useContext(SessionDrawerContext);
  if (!context) {
    throw new Error('useSessionDrawer must be used within a SessionDrawerProvider');
  }
  return context;
}
