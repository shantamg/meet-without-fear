export type SessionStatus = 'CREATED' | 'INVITED' | 'ACTIVE' | 'WAITING' | 'PAUSED' | 'ABANDONED' | 'RESOLVED' | 'COMPLETED' | 'ARCHIVED';

export interface User {
  id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email: string;
}

export interface RelationshipMember {
  id: string;
  userId: string;
  user: User;
  role: string;
  nickname?: string | null;
  createdAt?: string;
}

export interface Relationship {
  id: string;
  members: RelationshipMember[];
}

export interface SessionStats {
  totalCost: number;
  totalTokens: number;
  activityCount: number;
  turnCount: number;
}

export interface Session {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: SessionStatus;
  type: string; // 'PARTNER' | 'INNER_WORK'
  relationship?: Relationship;
  title?: string | null;
  user?: User;
  stats?: SessionStats;
}

export interface SessionSummary {
  totalCost: number;
  totalTokens: number;
}
