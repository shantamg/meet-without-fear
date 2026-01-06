/**
 * People Tracking DTOs
 *
 * Data Transfer Objects for tracking people mentioned across Inner Work features.
 */

import { MentionSourceType } from '../enums';

// ============================================================================
// Person
// ============================================================================

export interface PersonDTO {
  id: string;
  name: string;
  aliases: string[];
  relationship: string | null;
  firstMentioned: string; // ISO 8601
  lastMentioned: string; // ISO 8601
  mentionCounts: {
    innerThoughts: number;
    gratitude: number;
    needs: number;
    conflict: number;
    total: number;
  };
}

export interface PersonDetailDTO extends PersonDTO {
  recentMentions: PersonMentionDTO[];
  patterns: {
    topContexts: { sourceType: MentionSourceType; count: number }[];
    needsConnections: { needName: string; count: number }[];
    averageSentiment: number | null;
  };
}

// ============================================================================
// Person Mention
// ============================================================================

export interface PersonMentionDTO {
  id: string;
  sourceType: MentionSourceType;
  sourceId: string;
  context: string | null;
  sentiment: number | null;
  createdAt: string; // ISO 8601
}

// ============================================================================
// API Requests/Responses
// ============================================================================

// GET /api/v1/people/tracked
export interface ListTrackedPeopleRequest {
  limit?: number;
  sortBy?: 'recent' | 'frequent' | 'name';
}

export interface ListTrackedPeopleResponse {
  people: PersonDTO[];
  total: number;
}

// GET /api/v1/people/:id
export interface GetPersonResponse {
  person: PersonDetailDTO;
}

// PATCH /api/v1/people/:id
export interface UpdatePersonRequest {
  name?: string;
  relationship?: string;
  aliases?: string[];
}

export interface UpdatePersonResponse {
  person: PersonDTO;
}

// POST /api/v1/people/:id/merge
export interface MergePeopleRequest {
  mergeIntoId: string;
}

export interface MergePeopleResponse {
  person: PersonDTO;
  mergedCount: number; // How many mentions were merged
}

// DELETE /api/v1/people/:id
export interface DeletePersonResponse {
  success: boolean;
}

// ============================================================================
// Internal Extraction Types (not exposed via API)
// ============================================================================

export interface ExtractedPeopleResult {
  people: string[];
  newPeople: string[];
  matchedPeople: { name: string; personId: string }[];
}
