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
  stage?: number;
  participants?: string;
  relationship?: Relationship;
  title?: string | null;
  user?: User;
  stats?: SessionStats;
}

export type SessionSortField = 'participants' | 'status' | 'stage' | 'turns' | 'cost' | 'age';
export type SortOrder = 'asc' | 'desc';

export interface SessionFilters {
  search?: string;
  status?: SessionStatus[];
  type?: 'PARTNER' | 'INNER_WORK';
  stage?: number[];
  dateRange?: 'today' | '7d' | '30d' | 'all';
  sort?: SessionSortField;
  order?: SortOrder;
}

export interface SessionSummary {
  totalCost: number;
  totalTokens: number;
}
