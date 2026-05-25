import { NeedCategory } from '../enums';
import type { IdentifiedNeedDTO } from './needs';

export type NeedEditOperationType = 'updateNeedText' | 'addNeed' | 'removeNeed';

export type AffectedNeedOperation = 'text_change' | 'category_change' | 'add' | 'remove';

export interface NeedEditOperation {
  type: NeedEditOperationType;
  needId?: string;
  newText?: string;
  text?: string;
  category?: NeedCategory;
  newCategory?: NeedCategory;
}

export interface NeedEditPreviewValue {
  text: string;
  category?: NeedCategory;
}

export interface AffectedNeed {
  needId?: string;
  before?: NeedEditPreviewValue;
  after?: NeedEditPreviewValue;
  operation: AffectedNeedOperation;
  warning?: string;
}

export interface NeedEditPlan {
  summary: string;
  operations: NeedEditOperation[];
  affectedNeeds: AffectedNeed[];
}

export interface NeedEditConversationTurn {
  request: string;
  plan?: NeedEditPlan;
  clarification?: string;
}

export interface InterpretNeedEditRequest {
  request: string;
  targetNeedId?: string;
  conversationHistory?: NeedEditConversationTurn[];
}

export interface InterpretNeedEditResponse {
  clarificationNeeded?: boolean;
  clarificationMessage?: string;
  plan?: NeedEditPlan;
}

export interface ApplyNeedEditsRequest {
  operations: NeedEditOperation[];
}

export interface ApplyNeedEditsResponse {
  needs: IdentifiedNeedDTO[];
  applied: AffectedNeed[];
  warnings: string[];
}

export interface DeleteNeedResponse {
  deleted: true;
  needId: string;
  need?: IdentifiedNeedDTO;
}
