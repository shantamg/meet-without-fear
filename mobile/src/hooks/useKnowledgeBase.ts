/**
 * Knowledge Base Hooks for Meet Without Fear Mobile
 *
 * React Query hooks for the Phase 16 knowledge base browse endpoints.
 * These endpoints let users explore their accumulated reflections grouped by
 * topic, person, and recurring theme.
 *
 * NOTE: DTOs defined locally here until Phase 16 publishes them to shared/.
 * See Phase 18 Research Pitfall 5 — shapes will align with Phase 16 once shipped.
 */

import { useQuery } from '@tanstack/react-query';
import { get } from '../lib/api';
import { knowledgeBaseKeys } from './queryKeys';

// ============================================================================
// Local Placeholder DTOs (until Phase 16 ships shared contracts)
// ============================================================================

export interface TopicSummaryDTO {
  id: string;
  label: string;
  takeawayCount: number;
  slug?: string;
}

export interface PersonSummaryDTO {
  id: string;
  label: string;
  takeawayCount: number;
  slug?: string;
}

export interface ThemeSummaryDTO {
  id: string;
  label: string;
  takeawayCount: number;
  slug?: string;
}

export interface TakeawayItem {
  id: string;
  content: string;
  theme?: string;
  sessionDate: string;
  sessionId: string;
}

export interface TopicDetailDTO {
  id: string;
  label: string;
  takeaways: TakeawayItem[];
}

export interface PersonDetailDTO {
  id: string;
  label: string;
  takeaways: TakeawayItem[];
}

export interface ThemeDetailDTO {
  id: string;
  label: string;
  takeaways: TakeawayItem[];
}

// ============================================================================
// List Hooks
// ============================================================================

/**
 * Fetch the list of all knowledge base topics (grouped by recurring topic tag).
 */
export function useKnowledgeBaseTopics() {
  return useQuery({
    queryKey: knowledgeBaseKeys.topics(),
    queryFn: () => get<{ items: TopicSummaryDTO[] }>('/inner-thoughts/knowledge-base/topics'),
    staleTime: 60_000, // 1 minute — read-heavy surface, no real-time updates
  });
}

/**
 * Fetch the list of all people mentioned across Inner Thoughts sessions.
 */
export function useKnowledgeBasePeople() {
  return useQuery({
    queryKey: knowledgeBaseKeys.people(),
    queryFn: () => get<{ items: PersonSummaryDTO[] }>('/inner-thoughts/knowledge-base/people'),
    staleTime: 60_000,
  });
}

/**
 * Fetch the list of recurring themes distilled across sessions.
 */
export function useKnowledgeBaseThemes() {
  return useQuery({
    queryKey: knowledgeBaseKeys.themes(),
    queryFn: () => get<{ items: ThemeSummaryDTO[] }>('/inner-thoughts/knowledge-base/themes'),
    staleTime: 60_000,
  });
}

// ============================================================================
// Detail Hooks
// ============================================================================

/**
 * Fetch the detail view for a topic: all takeaways tagged with this topic,
 * sorted chronologically.
 *
 * @param slug - Topic slug (from TopicSummaryDTO.slug). Query is disabled when falsy.
 */
export function useKnowledgeBaseTopicDetail(slug: string | undefined) {
  return useQuery({
    queryKey: knowledgeBaseKeys.topicDetail(slug ?? ''),
    queryFn: () =>
      get<{ topic: TopicDetailDTO }>(`/inner-thoughts/knowledge-base/topics/${slug}`),
    enabled: !!slug,
    staleTime: 60_000,
  });
}

/**
 * Fetch the detail view for a person: all takeaways where this person is mentioned.
 *
 * @param id - Person ID. Query is disabled when falsy.
 */
export function useKnowledgeBasePersonDetail(id: string | undefined) {
  return useQuery({
    queryKey: knowledgeBaseKeys.personDetail(id ?? ''),
    queryFn: () => get<{ person: PersonDetailDTO }>(`/inner-thoughts/knowledge-base/people/${id}`),
    enabled: !!id,
    staleTime: 60_000,
  });
}

/**
 * Fetch the detail view for a recurring theme: all takeaways contributing to this theme.
 *
 * @param id - Theme ID. Query is disabled when falsy.
 */
export function useKnowledgeBaseThemeDetail(id: string | undefined) {
  return useQuery({
    queryKey: knowledgeBaseKeys.themeDetail(id ?? ''),
    queryFn: () => get<{ theme: ThemeDetailDTO }>(`/inner-thoughts/knowledge-base/themes/${id}`),
    enabled: !!id,
    staleTime: 60_000,
  });
}
