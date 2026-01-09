
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
}

export interface Relationship {
  id: string;
  members: RelationshipMember[];
}

export interface Session {
  id: string;
  status: string;
  type: string;
  createdAt: string; // ISO date
  updatedAt: string; // ISO date
  relationship: Relationship;
}

export interface AuditLogData {
  sessionId?: string;
  turnId?: string;
  data?: any;
}

export interface AuditLogEntry {
  id?: string;
  timestamp: string;
  section: 'USER' | 'INTENT' | 'RETRIEVAL' | 'RESPONSE' | 'COST' | 'LLM_START' | 'PROMPT' | 'MEMORY_DETECTION' | 'ERROR';
  message: string;
  turnId?: string;
  sessionId?: string;
  data?: any;
  cost?: number;
}
