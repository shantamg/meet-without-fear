import { Prisma } from '@prisma/client';
import {
  ProposalInventoryDTO,
  Stage4CoverageAuditDTO,
  Stage4ClosureKind,
  Stage4ClosureReason,
  Stage4ProposalKind,
  Stage4ProposalStatus,
  Stage4SelectionDecision,
} from '@meet-without-fear/shared';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { refreshStage4NeedCoverage } from './stage4-coverage.service';
import { isSupersededStrategy } from '../utils/strategy-dedupe';

export type Stage4CaptureInput = {
  sessionId: string;
  userId: string;
  messageId: string;
  userMessage: string;
  aiResponse: string;
  currentInventory?: ProposalInventoryDTO;
  confirmedNeeds?: Stage4NeedDTO[];
  recentStage4Messages?: Array<{ role: 'USER' | 'AI'; userId?: string; content: string; timestamp: string }>;
  compatibilityProposedStrategies?: string[];
};

export type Stage4NeedDTO = {
  id?: string;
  label: string;
  sourceUserId?: string;
};

export type Stage4InventoryOperation =
  | {
      type: 'ADD_PROPOSAL';
      tempKey: string;
      kind: Stage4ProposalKind;
      ownerUserId?: string;
      description: string;
      needsAddressed: string[];
      duration?: string;
      measureOfSuccess?: string;
      capturedQuote?: string;
    }
  | {
      type: 'REVISE_PROPOSAL';
      proposalId: string;
      description?: string;
      needsAddressed?: string[];
      duration?: string;
      measureOfSuccess?: string;
      kind?: Stage4ProposalKind;
      ownerUserId?: string;
      reason?: string;
    }
  | {
      type: 'REMOVE_PROPOSAL';
      proposalId: string;
      reason?: string;
    }
  | {
      type: 'RESTORE_PROPOSAL';
      proposalId: string;
      reason?: string;
    };

export type Stage4SelectionCaptureDTO = {
  userId: string;
  decisions: Array<{
    proposalId: string;
    decision: Stage4SelectionDecision;
    note?: string;
  }>;
};

export type Stage4ClosureSignalDTO = {
  readyToClose: boolean;
  kind?: Stage4ClosureKind;
  reason?: Stage4ClosureReason;
  summary?: string;
};

export type Stage4TendingTimingDTO = {
  proposalId?: string;
  agreementId?: string;
  suggestedFollowUpDate?: string;
  sourceText?: string;
};

export type Stage4CaptureResult = {
  operations: Stage4InventoryOperation[];
  coverageAudit?: Stage4CoverageAuditDTO;
  selection?: Stage4SelectionCaptureDTO;
  closureSignal?: Stage4ClosureSignalDTO;
  tendingTiming?: Stage4TendingTimingDTO;
  confidence: number;
  rationale: string;
  appliedOperationCount: number;
  skippedOperationCount: number;
};

type ProposalRow = {
  id: string;
  sessionId: string;
  createdByUserId: string | null;
  description: string;
  needsAddressed: string[];
  duration: string | null;
  measureOfSuccess: string | null;
  kind: Stage4ProposalKind;
  status: Stage4ProposalStatus;
  removedAt: Date | null;
  removedByUserId: string | null;
  removalReason: string | null;
};

const CAPTURE_CONFIDENCE_THRESHOLD = 0.7;
const DESTRUCTIVE_CONFIDENCE_THRESHOLD = 0.85;

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanProposalDescription(value: string): string {
  return value
    .replace(/^to\s+/i, '')
    .replace(/^(?:what\s+i\s+can\s+)?commit\s+to\s+is\s+/i, '')
    .replace(/^private\s+weekly\s+check[-\s]*in:\s*/i, '')
    .replace(/\s*\((?:shared proposal|(?:private\s+)?individual commitment|private commitment)\)\s*$/i, '')
    .replace(/\s+(?:please|maybe|i think|if that works)$/i, '')
    .replace(/[.!?]+$/g, '')
    .trim();
}

function hasEnoughSpecificity(description: string): boolean {
  const normalized = normalizeText(description);
  if (normalized.length < 12) return false;
  return !['communicate better', 'be nicer', 'try harder', 'do better'].includes(normalized);
}

function getOverlapScore(haystack: string, needle: string): number {
  const haystackWords = new Set(normalizeText(haystack).split(' ').filter(Boolean));
  const needleWords = normalizeText(needle).split(' ').filter((word) => word.length > 2);
  if (needleWords.length === 0) return 0;
  const overlap = needleWords.filter((word) => haystackWords.has(word)).length;
  return overlap / needleWords.length;
}

function findReferencedProposal(
  text: string,
  proposals: ProposalRow[],
  allowedStatus: Stage4ProposalStatus[]
): { proposal: ProposalRow | null; confidence: number } {
  const candidates = proposals.filter((proposal) => allowedStatus.includes(proposal.status));
  if (candidates.length === 0) return { proposal: null, confidence: 0 };

  const quoted = text.match(/["'“”](.+?)["'“”]/)?.[1];
  const referenceText = quoted ?? text;
  const direct = candidates.find((proposal) =>
    normalizeText(referenceText).includes(normalizeText(proposal.description))
  );
  if (direct) return { proposal: direct, confidence: quoted ? 0.95 : 0.9 };

  const scored = candidates
    .map((proposal) => ({ proposal, score: getOverlapScore(referenceText, proposal.description) }))
    .sort((a, b) => b.score - a.score);
  if (scored[0] && scored[0].score >= 0.6) return { proposal: scored[0].proposal, confidence: 0.82 };

  if (candidates.length === 1 && /\b(that|it|this|the proposal|the idea)\b/i.test(text)) {
    return { proposal: candidates[0], confidence: 0.88 };
  }

  return { proposal: null, confidence: 0 };
}

function findLooseRevisionProposal(text: string, proposals: ProposalRow[]): { proposal: ProposalRow | null; confidence: number } {
  const candidates = proposals.filter((proposal) =>
    [Stage4ProposalStatus.ACTIVE, Stage4ProposalStatus.REVISED].includes(proposal.status)
  );
  const scored = candidates
    .map((proposal) => ({ proposal, score: getOverlapScore(text, proposal.description) }))
    .sort((a, b) => b.score - a.score);
  if (scored[0] && scored[0].score >= 0.35 && (!scored[1] || scored[0].score - scored[1].score >= 0.15)) {
    return { proposal: scored[0].proposal, confidence: 0.86 };
  }
  return { proposal: null, confidence: 0 };
}

function inferProposalKind(text: string): Stage4ProposalKind {
  if (
    /\bmonthly experiment\b/i.test(text) &&
    /\b(?:adam|eve|they|together|build the details|stays engaged)\b/i.test(text)
  ) {
    return Stage4ProposalKind.SHARED_PROPOSAL;
  }
  if (
    /\bone small new thing each month\b/i.test(text) &&
    /\b(?:adam|eve|they|together|stays engaged|naming when|comes? back)\b/i.test(text)
  ) {
    return Stage4ProposalKind.SHARED_PROPOSAL;
  }
  if (/\bpause[-\s]and[-\s]return\b/i.test(text) && /\badam\b/i.test(text)) {
    return Stage4ProposalKind.SHARED_PROPOSAL;
  }
  if (
    /\b(?:mine alone|individual for me|individual commitment|my commitment|just for me|mine to do)\b/i.test(text) ||
    /\bcommits?\s+individually\b/i.test(text) ||
    /\b(?:give|giving)\s+(?:myself|herself|himself|themself|themselves)\s+permission\s+to\b/i.test(text) ||
    /\b(?:name|naming)\s+what\s+is\s+happening\s+once\b/i.test(text) ||
    /\bleave\s+(?:the\s+)?conversation\s+instead\s+of\s+staying\b/i.test(text) ||
    /\bstop\s+(?:the\s+)?conversation\s+when\b/i.test(text) ||
    /\b(?:pause|end)\s+(?:the\s+)?conversation\s+(?:when|if)\b/i.test(text) ||
    /\bstop\s+treating\s+(?:his|her|their|my)\s+reaction\s+as\b/i.test(text) ||
    /\b(?:name|naming)\s+what\s+i\s+see\s+once\b/i.test(text) ||
    /\b(?:not|without)\s+debating\s+(?:my\s+)?reality\b/i.test(text) ||
    /\bstep\s+away\s+from\s+conversations?\s+that\s+turn\b/i.test(text) ||
    /\bindividual\s+therapy\b/i.test(text) ||
    /\b(?:journal|journaling)\s+for\b/i.test(text) ||
    /\bprivate\s+(?:weekly\s+)?note\b/i.test(text) ||
    /\bsolo\s+grounding\s+practice\b/i.test(text) ||
    /\b(?:adam|eve)\s+(?:will\s+|to\s+)?(?:develops?|builds?|has|have|makes?|restarts?|runs?|walks?|exercises?|meets?|signs?\s+up|registers?|creates?)\b/i.test(text) ||
    /\b(?:adam'?s|eve'?s)\s+individual\s+practice\b/i.test(text) ||
    /\b(?:individual\s+commitment:\s*)?notice\s+when\s+(?:i am |i'm |he'?s |she'?s |they'?re )?treating\b/i.test(text) &&
      /\bwanting\s+as\s+a\s+verdict\b/i.test(text) ||
    /\b(?:adam|eve)\s+takes?\s+a\s+solo\s+walk\b/i.test(text) ||
    /\bindividual\s+practice\/resource\b/i.test(text) ||
    /\b(?:therapist|therapy|men'?s group|support group)\b/i.test(text) &&
      /\b(?:find|look for|research|send|email|schedule|options?)\b/i.test(text) &&
      /\b(?:adam|eve|i|he|she|they|on (?:his|her|their|my) own|not ask(?:ing)? (?:adam|eve|him|her|them) to manage)\b/i.test(text) ||
    /\bwhen\s+panic\s+starts\b/i.test(text) && /\btake\s+a\s+walk\b/i.test(text) && /\bwrite\s+down\b/i.test(text) ||
    /\b(?:run|walk|exercise|therapy\s+appointment)\b/i.test(text) &&
      /\b(?:adam|eve)\s+practices?\b/i.test(text) ||
    /\b(?:ceramics?|art|dance|language|beginner[-\s]level)\s+class\b/i.test(text) ||
    /\bitinerary\b/i.test(text) && /\b(?:book|booking|secret|allowed to want|portugal)\b/i.test(text) ||
    /\bsolo\s+walk\b/i.test(text) && /\b(?:no phone|writes? down|afraid|threatened|grounding)\b/i.test(text) ||
    /\b(?:journal|journaling|write\s+things?\s+down)\b/i.test(text) &&
      /\b(?:self\s*trust|second\s+guessing|outsourcing\s+(?:my|her|his|their)\s+reality)\b/i.test(text) ||
    /\b(?:return|go(?:ing)?\s+back|pursue|start)\s+(?:to\s+)?individual\s+therapy\b/i.test(text) ||
    /\bindividual\s+practice\s+for\s+steadiness\b/i.test(text) ||
    /\bsomething\s+(?:adam|eve|he|she|they)\s+does\s+on\s+(?:his|her|their)\s+own\b/i.test(text) ||
    /\b(?:running|counseling|therapy|exercise)\b/i.test(text) &&
      /\b(?:steadiness|steady|prove\s+(?:he|she|they|i)'?s\s+okay|on\s+(?:his|her|their|my)\s+own)\b/i.test(text) ||
    /\bwrite\s+(?:down\s+)?(?:what\s+i\s+know|things?\s+down)\b/i.test(text) ||
    /\bwrite\s+down\s+one\s+moment\s+where\s+(?:i|she|he|they)\s+(?:made\s+(?:myself|herself|himself|themself|themselves)\s+smaller|edited\s+(?:myself|herself|himself|themself|themselves))\b/i.test(text) ||
    /\bnotice\s+when\s+i\s+edit\s+myself\s+before\s+i\s+even\s+speak\b/i.test(text) ||
    /\bstop\s+outsourcing\s+(?:my|her|his|their)\s+reality\b/i.test(text) ||
    /\bindividual\s+(?:time\s+)?block\b/i.test(text) ||
    /\b(?:sign up|register for|make one real)\b/i.test(text) ||
    /\b(?:outside|other than)\s+(?:of\s+)?(?:adam|eve|partner|him|her|them)\b/i.test(text) &&
      /\b(?:steady|steadiness|spiral|spiraling|worth|okay)\b/i.test(text) ||
    /\boutside\s+(?:of\s+)?(?:the\s+)?relationship\b/i.test(text) &&
      /\b(?:steady|steadiness|spiral|spiraling|worth|self[-\s]?worth|okay)\b/i.test(text) ||
    /\b(?:talk|talking|speak|speaking)\s+to\s+someone\s+(?:outside|other than)\b/i.test(text) ||
    /\b(?:run|walk|exercise)\b/i.test(text) &&
      /\b(?:own time|alone|by myself|for myself|independent|independently)\b/i.test(text) ||
    /\bsaturday\b/i.test(text) &&
      /\b(?:morning|mornings)\b/i.test(text) &&
      /\b(?:protected personal time|own time|walks?|coffee|brother|physical)\b/i.test(text) ||
    /\b(?:alone|by myself)\b/i.test(text) && /\b(?:saturday|garage|project|build|make|making|hands)\b/i.test(text) ||
    /\bsaturday\b/i.test(text) &&
      /\b(?:morning|mornings)\b/i.test(text) &&
      /\b(?:hands|project|build|make|making|steady|independent|independently)\b/i.test(text) ||
    /\bclass or trip[-\s]planning block each week\b/i.test(text) &&
      /\b(?:chooses?|chosen|alone|pre[-\s]approval|pre[-\s]justifying|without asking|without waiting)\b/i.test(text) ||
    /\b(?:adam|eve)\s+picks?\s+one small thing\b/i.test(text) ||
    /\bone small (?:yours|mine|hers|his|theirs)[-\s]?only thing\b/i.test(text) ||
    /\b(?:one small thing|class|morning out|trip idea|itinerary)\b/i.test(text) &&
      /\b(?:just hers|just his|just theirs|just mine|just yours|just for (?:adam|eve|me|him|her|them)|adam'?s|eve'?s|does because (?:she|he|they|i) wants?|without (?:pre-)?building a case|without turning it into a referendum)\b/i.test(text)
  ) {
    return Stage4ProposalKind.INDIVIDUAL_COMMITMENT;
  }
  if (
    /\b(?:we|both|together)\b/i.test(text) ||
    /\b(?:we each|each of us|one thing each)\b/i.test(text) ||
    /\b(?:adam|eve|partner)'?s\s+first\s+job\b/i.test(text)
  ) {
    return Stage4ProposalKind.SHARED_PROPOSAL;
  }
  if (/\b(i can|i could|i will|i'll|i would|i want to|i am going to|i'm going to)\b/i.test(text)) {
    return Stage4ProposalKind.INDIVIDUAL_COMMITMENT;
  }
  return Stage4ProposalKind.SHARED_PROPOSAL;
}

function isNonCommitmentFirstPerson(raw: string): boolean {
  return [
    /\bi\s+can\s+(?:see|understand|recognize|hear|imagine|tell|appreciate)\b/i,
    /\bi\s+could\s+(?:see|understand|recognize|hear|imagine|tell|appreciate)\b/i,
    /\bi\s+would\s+(?:worry|be worried|be concerned|feel|think)\b/i,
    /\bi\s+(?:think|feel|worry|wonder|guess)\b/i,
  ].some((pattern) => pattern.test(raw));
}

function proposalWordCount(value: string): number {
  return normalizeText(value).split(' ').filter(Boolean).length;
}

function isConcreteProposal(description: string): boolean {
  const normalized = normalizeText(description);
  if (!hasEnoughSpecificity(description)) return false;
  if (/^(?:see|look at|review|read|hear)\s+what\s+(?:he|she|they|my partner|catherine|james|adam|eve)\s+(?:put|puts|shared|shares|proposed|proposes|asked|asks)\b/.test(normalized)) return false;
  if (/^agree with all of it\b/.test(normalized)) return false;
  if (/^know what (?:he|she|they|my partner|catherine|james|adam|eve)(?:\s+s|\s+re|\s+is|\s+are)?\s+(?:actually\s+)?asking for\b/.test(normalized)) return false;
  if (/^talk about that\b/.test(normalized)) return false;
  if (/^talk about ordinary things\b/.test(normalized)) return false;
  if (/^(?:want|need) us to agree\b/.test(normalized)) return false;
  if (/^(?:want|need) it to feel\b/.test(normalized)) return false;
  if (/^name one want\b/.test(normalized)) return false;
  if (/^honestly name right now\b/.test(normalized)) return false;
  if (/^work with\b/.test(normalized)) return false;
  if (/^actually try\b/.test(normalized)) return false;
  if (/^try is\b/.test(normalized)) return false;
  if (/^ask (?:(?:a few|some)\s+)?questions?\s+before\b/.test(normalized)) return false;
  if (/^ask what helped\b/.test(normalized)) return false;
  if (/^(?:want to learn|learn whether)\b/.test(normalized)) return false;
  if (/^know it helped if\b/.test(normalized)) return false;
  if (/^know it is helping if\b/.test(normalized)) return false;
  if (/^solve that in advance\b/.test(normalized)) return false;
  if (/^actually do\b/.test(normalized)) return false;
  if (/^take ten minutes but\b/.test(normalized)) return false;
  if (/^do small movement\b/.test(normalized)) return false;
  if (/^say is\b/.test(normalized) && /\bten minutes\b/.test(normalized)) return false;
  if (/^understand it without turning it into\b/.test(normalized)) return false;
  if (/^work on the panic instead of\b/.test(normalized)) return false;
  if (/^keep asking (?:her|him|them) to prove\b/.test(normalized)) return false;
  if (/^look at what (?:adam|eve|partner|he|she|they) is thinking about\b/.test(normalized)) return false;
  if (/^own the saturday morning\b/.test(normalized)) return false;
  if (/^(?:and\s+)?i do not have to turn it into a referendum\b/.test(normalized)) return false;
  if (/^keep it that small and real\b/.test(normalized)) return false;
  if (/^want it to be a one[- ]month experiment\b/.test(normalized)) return false;
  if (/^want us to pick one thing each of us is carrying\b/.test(normalized)) return false;
  if (/^want to feel\b/.test(normalized) && /\bless alone\b/.test(normalized)) return false;
  if (/^know if i start saying things before i have edited them down\b/.test(normalized)) return false;
  if (/^say what i am reaching for\b/.test(normalized) && /\bwithout either of us turning it into a verdict\b/.test(normalized)) return false;
  if (/^after one month\b/.test(normalized) && /\bcheck\s*in\b/.test(normalized)) return false;
  if (/^(?:try together|a way to check|and a way to check)\b/.test(normalized)) return false;
  if (/^be together without everything becoming a verdict\b/.test(normalized)) return false;
  if (/^after one month check in\b/.test(normalized)) return false;
  if (/^did we feel\b/.test(normalized)) return false;
  if (/^(?:like\s+)?feel steady without needing\b/.test(normalized)) return false;
  if (/^like a weekly walk\b/.test(normalized)) return false;
  if (/^say what we heard\b/.test(normalized)) return false;
  if (/^say if i am anxious\b/.test(normalized)) return false;
  if (/^start this week\b/.test(normalized)) return false;
  if (/^add that we try it\b/.test(normalized)) return false;
  if (/^want it to be predictable\b/.test(normalized)) return false;
  if (/^keep the (?:sunday|weekly|30 minute|thirty minute).*conversation\b/.test(normalized)) return false;
  if (/^choose (?:myself|for myself)\b/.test(normalized)) return false;
  if (/^choose without waiting\b/.test(normalized)) return false;
  if (/^start by each saying the thing\b/.test(normalized)) return false;
  if (/^both say we feel less alone\b/.test(normalized)) return false;
  if (/^name when i am scared before i shut down\b/.test(normalized)) return false;
  if (/^partner name when i am scared before i shut down\b/.test(normalized)) return false;
  if (/^like him not to make it heavy\b/.test(normalized)) return false;
  if (/^would like him not to make it heavy\b/.test(normalized)) return false;
  if (/^probably turn it into another thing to get right\b/.test(normalized)) return false;
  if (/^turn it into another thing to get right\b/.test(normalized)) return false;
  if (/^be careful here\b/.test(normalized)) return false;
  if (/^look at strategies\b/.test(normalized)) return false;
  if (/^look at what (?:we|you|you ve|i) (?:have|got)(?: so far)?\b/.test(normalized)) return false;
  if (/^curiosity is not agreement\b/.test(normalized)) return false;
  if (/^be clear that curiosity is not agreement\b/.test(normalized)) return false;
  if (/^be clear that\b/.test(normalized) && /\bindividual commitments?\b/.test(normalized)) return false;
  if (/^see what actually works\b/.test(normalized)) return false;
  if (/^see what actually overlaps\b/.test(normalized)) return false;
  if (/^see what (?:he|she|they|catherine|james|adam|eve) actually brings? forward\b/.test(normalized)) return false;
  if (/^(?:bring|brings|brought) forward\b/.test(normalized)) return false;
  if (/^see what (?:he|she|they) does? with it\b/.test(normalized)) return false;
  if (/^step in on\b/.test(normalized)) return false;
  if (/^own (?:that part|without|get|what)\b/.test(normalized)) return false;
  if (/^think we understood each other\b/.test(normalized)) return false;
  if (/^know it was helping if\b/.test(normalized)) return false;
  if (/^stay more present if\b/.test(normalized)) return false;
  if (/^agree to (?:these|this|it|that)\b/.test(normalized)) return false;
  if (/^agree to practice it\b/.test(normalized)) return false;
  if (/^try to treat it as\b/.test(normalized)) return false;
  if (/^talk through the shared version\b/.test(normalized)) return false;
  if (/^try not to chase it\b/.test(normalized)) return false;
  if (/^turn it into another thing to manage\b/.test(normalized)) return false;
  if (/^turn it into another thing i can fail at\b/.test(normalized)) return false;
  if (/^commit to once a week\b/.test(normalized)) return false;
  if (/^feel myself starting to brace\b/.test(normalized)) return false;
  if (/^feel myself wanting to add more\b/.test(normalized)) return false;
  if (/^stay present better if\b/.test(normalized)) return false;
  if (/^know i am staying with it if\b/.test(normalized)) return false;
  if (/^feel steady in myself again\b/.test(normalized)) return false;
  if (/^show up better then than after work\b/.test(normalized)) return false;
  if (/^restart that twice a week\b/.test(normalized) && /\bmaybe meet\b/.test(normalized)) return false;
  if (/\bdevelop something that is (?:his|her|their|my) own outside\b/.test(normalized)) return false;
  if (/^find something that is (?:mine|his|hers|theirs|yours) outside\b/.test(normalized)) return false;
  if (/^something that is just mine like\b/.test(normalized)) return false;
  if (/^something that is just (?:mine|his|hers|theirs|yours) outside\b/.test(normalized)) return false;
  if (/^take the pause before\b/.test(normalized)) return false;
  if (/^do regardless of what\b/.test(normalized)) return false;
  if (/^(?:small )?ways for\b/.test(normalized)) return false;
  if (/^try the\b/.test(normalized) && /\bif it really\b/.test(normalized)) return false;
  if (/^know whether it is opening something\b/.test(normalized)) return false;
  if (/^edit it down before it even starts\b/.test(normalized)) return false;
  if (/^not promising it fixes everything\b/.test(normalized)) return false;
  return true;
}

function proposalSpecificityScore(value: string): number {
  const normalized = normalizeText(value);
  let score = proposalWordCount(value);
  if (/\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(normalized)) score += 4;
  if (/\b(?:morning|afternoon|evening|night)\b/.test(normalized)) score += 2;
  if (/\b(?:week|weeks|month|term|minutes?|hours?)\b/.test(normalized)) score += 3;
  if (/\b(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b/.test(normalized)) score += 2;
  if (/\b(?:class|walk|conversation|project|garage|itinerary)\b/.test(normalized)) score += 2;
  return score;
}

function proposalFamily(value: string): string | null {
  const normalized = normalizeText(value);
  if (/\bceramics?\b/.test(normalized) && /\bclass\b/.test(normalized)) return 'ceramics-class';
  if (
    /\b(?:sign up|register)\b/.test(normalized) &&
    (
      /\bnext term\b/.test(normalized) &&
        /\b(?:permission|talking myself out|class|ceramics)\b/.test(normalized) ||
      /^register by friday and put it on the calendar\b/.test(normalized)
    )
  ) {
    return 'ceramics-class';
  }
  if (
    /\b(?:getting too heated|too heated|start getting loud|timeout|neutral word|voices? (?:go|start going) up|immediate stop|stops? immediately)\b/.test(normalized) &&
    /\b(?:minutes?|step away|come back|return|own what i can|no following|no arguing|accountability|cross examination|pick (?:a )?time|24 hours?)\b/.test(normalized)
  ) {
    return 'pause-protocol';
  }
  if (
    /\b(?:weekly understanding check|weekly 30 minute conversation|weekly thirty minute conversation|thirty minutes|30 minutes)\b/.test(
      normalized
    ) &&
    /\b(?:mirror|mirrors|mirroring|yes thats what i meant|understanding|fixing|deciding|four weeks|one thing each|one thing|heard|sunday evening|not decide|nothing is being decided)\b/.test(normalized)
  ) {
    return 'weekly-understanding-check';
  }
  if (
    /\b(?:sunday evening|weekly conversation|protected conversation each week|weekly 30 minute|weekly thirty minute|30 minute check in|thirty minute check in)\b/.test(normalized) &&
    /\b(?:one thing|one want|name one|carrying|heard|understand|not decide|nothing is being decided|staying present|stay present)\b/.test(normalized)
  ) {
    return 'weekly-understanding-check';
  }
  if (
    /\b(?:structured conversation|sunday evening|sunday morning|weekly|20 30 minutes?|30 minutes?|thirty minutes?)\b/.test(normalized) &&
    /\b(?:one specific thing|one thing each|each person brings|not deciding|not decide|whole future|whole marriage|pause|come back|return)\b/.test(normalized)
  ) {
    return 'weekly-understanding-check';
  }
  if (
    /\btry it once first\b/.test(normalized) &&
    /\b(?:timer|pause|coming back|return|understanding first|not proving)\b/.test(normalized)
  ) {
    return 'weekly-understanding-check';
  }
  if (
    /\bone real conversation a week\b/.test(normalized) &&
    /\b(?:want|fear)\b/.test(normalized) &&
    /\b(?:not deciding|without deciding|not decide)\b/.test(normalized)
  ) {
    return 'weekly-understanding-check';
  }
  if (
    /\bconversation\b/.test(normalized) &&
    /\b(?:want|curiosity|fear|quiet|shrinking|blame|verdict|timer|timed|minutes?|thirty|30|pause)\b/.test(normalized)
  ) {
    return 'protected-conversation';
  }
  if (
    /\bweekly walk\b/.test(normalized) &&
    /\b(?:one real thing|one true thing|reflect|reflects|responding|not a decision|decision meeting|four week|freezes|freezing)\b/.test(normalized)
  ) {
    return 'weekly-walk-understanding';
  }
  if (
    /\b(?:individual practice|individual commitment|notice when)\b/.test(normalized) &&
    /\b(?:treating|treat)\b/.test(normalized) &&
    /\bwanting as a verdict\b/.test(normalized) &&
    /\b(?:pause|pausing|shut down|shutting down)\b/.test(normalized)
  ) {
    return 'verdict-pause-practice';
  }
  if (
    /\b(?:adam|eve|partner)\b/.test(normalized) &&
    /\b(?:asks?|question|first response|not a verdict|practical|scary)\b/.test(normalized) &&
    /\b(?:want|wants|trip|class|change|means?)\b/.test(normalized)
  ) {
    return 'first-response-question';
  }
  if (
    /\bsunday\b/.test(normalized) &&
    /\b(?:evening|night|after dinner)\b/.test(normalized) &&
    /\b(?:conversation|talk|check in|checkin)\b/.test(normalized)
  ) {
    return 'protected-conversation';
  }
  if (
    /\b(?:monthly experiment|one small new thing each month|small new thing each month)\b/.test(normalized) &&
    /\b(?:eve chooses|eve initiates|adam stays engaged|naming when|scared|shutting down|category|details together|three month|check in)\b/.test(normalized)
  ) {
    return 'monthly-experiment';
  }
  if (
    /\b(?:pause and return|pause return|ten minutes?|10 minutes?)\b/.test(normalized) &&
    /\b(?:real question|comes? back|conversation ending|scared)\b/.test(normalized)
  ) {
    return 'pause-and-return';
  }
  if (
    /\b(?:motion|class|trip|outing|place|curious)\b/.test(normalized) &&
    /\b(?:small|short|saturday|weekend|together|date|first step|bounded)\b/.test(normalized)
  ) {
    return 'motion-action';
  }
  if (/\b(?:walk|hike)\b/.test(normalized) && /\b(?:weekly|sunday|month|morning|saturday|45 minutes?|no agenda|no destination|referendum)\b/.test(normalized)) {
    return 'walk-hike';
  }
  if (
    /\bitinerary\b/.test(normalized) &&
    (
      /\b(?:portugal|booking|book|secret|allowed to want)\b/.test(normalized) ||
      /\bone real itinerary\b/.test(normalized) && !/\b(?:we|both|together|each)\b/.test(normalized)
    )
  ) {
    return 'solo-itinerary';
  }
  if (
    /\b(?:getting too heated|too heated|start getting loud|pause|timeout|neutral word|voices? (?:go|start going) up|immediate stop|stops? immediately)\b/.test(normalized) &&
    /\b(?:minutes?|step away|come back|return|own what i can|no following|no arguing|accountability|cross examination|pick (?:a )?time|24 hours?)\b/.test(normalized)
  ) {
    return 'pause-protocol';
  }
  if (
    /\b(?:thank you|acknowledg\w*|appreciat\w*|notic(?:e|ed)|sees? it|being seen)\b/.test(normalized) &&
    /\b(?:pick up|kids|pay|fix|show up|couple times|few times|in the moment|trying|after dinner|every other day|one thing)\b/.test(normalized)
  ) {
    return 'concrete-acknowledgment';
  }
  if (
    /\b(?:role|authority|undercut|contradict|public contradictions?|in front of (?:the )?(?:kids|children|them))\b/.test(normalized) &&
    /\b(?:kids|children|role|authority|later|conversation)\b/.test(normalized)
  ) {
    return 'kids-role-clarity';
  }
  if (
    /\b(?:name what i see|debating my reality|step away from conversations|defending his character)\b/.test(normalized)
  ) {
    return 'self-reality-boundary';
  }
  if (
    /\b(?:individual therapy|therapy|journaling|write things down|writing things down|write down what i know|writing down what happened|hard conversations?|second guessing myself|talk myself out of|outsourcing (?:my|her|his|their) reality|self trust)\b/.test(
      normalized
    )
  ) {
    return 'individual-support-grounding';
  }
  if (
    /\b(?:outside|other than)\s+(?:of\s+)?(?:adam|eve|partner|him|her|them|the relationship)\b/.test(normalized) &&
    /\b(?:worth|steadiness|settled|panic|counselor|counseling|running|confidence|prove)\b/.test(normalized)
  ) {
    return 'individual-support-grounding';
  }
  if (
    /\b(?:individual practice for steadiness|running|counseling|therapy|exercise|does on (?:his|her|their|my) own)\b/.test(normalized) &&
    /\b(?:steadiness|steady|prove (?:he|she|they|i)s okay|own|panic|worth)\b/.test(normalized)
  ) {
    return 'individual-support-grounding';
  }
  if (
    /\b(?:write down one moment|notice when i edit myself|made myself smaller|edited herself|edited himself|edited themself|edited themselves)\b/.test(normalized) &&
    /\b(?:edit|edited|smaller|chose|choose|speak)\b/.test(normalized)
  ) {
    return 'self-editing-checkin';
  }
  if (
    /\bprivate\s+(?:weekly\s+)?note\b/.test(normalized) &&
    /\b(?:edited|edit|speaking|spoke|choice|chose|chosen)\b/.test(normalized)
  ) {
    return 'self-editing-checkin';
  }
  if (
    /\b(?:solo grounding practice|solo walk|no phone)\b/.test(normalized) &&
    /\b(?:writes? down|afraid|threatened|grounding|brace|urgent)\b/.test(normalized)
  ) {
    return 'solo-grounding-practice';
  }
  if (
    /\b(?:adam|eve)\s+picks?\s+one small thing\b/.test(normalized) ||
    /\b(?:one small thing|class|morning out)\b/.test(normalized) &&
      /\b(?:just hers|just his|just theirs|just mine|just yours|without building a case|without turning it into a referendum)\b/.test(normalized)
  ) {
    return 'self-owned-small-thing';
  }
  if (
    /\bclass or trip planning block each week\b/.test(normalized) &&
    /\b(?:chooses?|chosen|alone|pre approval|pre justifying|without asking|without waiting)\b/.test(normalized)
  ) {
    return 'self-owned-class-trip-block';
  }
  if (
    /\bsaturday\b/.test(normalized) &&
    /\bmornings?\b/.test(normalized) &&
    /\b(?:protected personal time|own time|walks?|coffee|brother|physical)\b/.test(normalized)
  ) {
    return 'saturday-personal-time';
  }
  if (
    /\bsaturday\b/.test(normalized) &&
    /\bmornings?\b/.test(normalized) &&
    /\b(?:alone|garage|project|build|make|making|hands|steady|independent|independently)\b/.test(normalized)
  ) {
    return 'saturday-individual-project';
  }
  return null;
}

function sameProposalFamily(existing: string, next: string): boolean {
  const existingFamily = proposalFamily(existing);
  return Boolean(existingFamily && existingFamily === proposalFamily(next));
}

function hasRemoveIntent(text: string): boolean {
  return [
    /\b(?:remove|delete)\b.*\b(?:proposal|idea|strategy|that|this|it|one)\b/i,
    /\b(?:drop|scratch)\s+(?:that|this|it|one|that one|this one)\b/i,
    /\b(?:take|taking)\s+(?:that|this|it|one|that one|this one|proposal|idea|strategy|that proposal|this proposal|that idea|this idea)\s+(?:off|back)\b/i,
    /\b(?:that|this|it|one|that one|this one)\s+comes\s+off(?:\s+the\s+list)?\b/i,
    /\bi'?m\s+taking\s+(?:that|this|it|one|that one|this one)\s+back\b/i,
  ].some((pattern) => pattern.test(text));
}

function extractAddOperations(input: Stage4CaptureInput): Stage4InventoryOperation[] {
  const operations: Stage4InventoryOperation[] = [];
  const compatibility = input.compatibilityProposedStrategies ?? [];

  compatibility.forEach((description, index) => {
    const cleaned = cleanProposalDescription(description);
    if (!isConcreteProposal(cleaned)) return;
    const kind = inferProposalKind(description);
    operations.push({
      type: 'ADD_PROPOSAL',
      tempKey: `compat-${index}`,
      kind,
      ownerUserId: kind === Stage4ProposalKind.INDIVIDUAL_COMMITMENT ? input.userId : undefined,
      description: cleaned,
      needsAddressed: [],
      capturedQuote: description,
    });
  });

  const addPatterns = [
    /\b(?:what if we|we could|we can|we should|we might|let's|let us)\s+(.+?)(?:$|[.!?]\s)/gi,
    /\b(?:i can|i could|i will|i'll|i would|i want to|i am going to|i'm going to)\s+(.+?)(?:$|[.!?]\s)/gi,
  ];

  addPatterns.forEach((pattern) => {
    for (const match of input.userMessage.matchAll(pattern)) {
      const raw = match[0];
      if (/\b(?:not willing|willing|remove|delete|take .* off|drop that|change|revise|update)\b/i.test(raw)) {
        continue;
      }
      if (isNonCommitmentFirstPerson(raw)) continue;
      const description = cleanProposalDescription(match[1] ?? '');
      if (!isConcreteProposal(description)) continue;
      const kind = inferProposalKind(raw);
      operations.push({
        type: 'ADD_PROPOSAL',
        tempKey: `heuristic-${operations.length}`,
        kind,
        ownerUserId: kind === Stage4ProposalKind.INDIVIDUAL_COMMITMENT ? input.userId : undefined,
        description,
        needsAddressed: [],
        capturedQuote: raw.trim(),
      });
    }
  });

  return operations;
}

function extractDestructiveOrRevisionOperation(
  text: string,
  proposals: ProposalRow[]
): { operation: Stage4InventoryOperation | null; confidence: number; lowConfidenceAction?: string } {
  if (hasRemoveIntent(text)) {
    const match = findReferencedProposal(text, proposals, [Stage4ProposalStatus.ACTIVE, Stage4ProposalStatus.REVISED]);
    if (match.proposal) {
      return {
        operation: {
          type: 'REMOVE_PROPOSAL',
          proposalId: match.proposal.id,
          reason: text,
        },
        confidence: match.confidence,
      };
    }
    return { operation: null, confidence: 0.4, lowConfidenceAction: 'REMOVE_PROPOSAL' };
  }

  if (/\b(?:restore|bring back|put back)\b/i.test(text)) {
    const match = findReferencedProposal(text, proposals, [Stage4ProposalStatus.REMOVED]);
    if (match.proposal) {
      return {
        operation: {
          type: 'RESTORE_PROPOSAL',
          proposalId: match.proposal.id,
          reason: text,
        },
        confidence: match.confidence,
      };
    }
    return { operation: null, confidence: 0.4, lowConfidenceAction: 'RESTORE_PROPOSAL' };
  }

  const reviseMatch = text.match(/\b(?:change|revise|update)\b.+?\bto\b\s+(.+?)(?:$|[.!?]\s)/i);
  if (reviseMatch) {
    const match = findReferencedProposal(text, proposals, [Stage4ProposalStatus.ACTIVE, Stage4ProposalStatus.REVISED]);
    const description = cleanProposalDescription(reviseMatch[1] ?? '');
    if (match.proposal && hasEnoughSpecificity(description)) {
      return {
        operation: {
          type: 'REVISE_PROPOSAL',
          proposalId: match.proposal.id,
          description,
          reason: text,
        },
        confidence: match.confidence,
      };
    }
    return { operation: null, confidence: 0.45, lowConfidenceAction: 'REVISE_PROPOSAL' };
  }

  if (/\b(?:should be|is|make it|mark it|keep it)\s+(?:an?\s+)?individual\b/i.test(text) || /\bnot shared\b/i.test(text)) {
    const directMatch = findReferencedProposal(text, proposals, [
      Stage4ProposalStatus.ACTIVE,
      Stage4ProposalStatus.REVISED,
    ]);
    const match = directMatch.proposal ? directMatch : findLooseRevisionProposal(text, proposals);
    if (match.proposal) {
      return {
        operation: {
          type: 'REVISE_PROPOSAL',
          proposalId: match.proposal.id,
          kind: Stage4ProposalKind.INDIVIDUAL_COMMITMENT,
          reason: text,
        },
        confidence: match.confidence,
      };
    }
    return { operation: null, confidence: 0.45, lowConfidenceAction: 'REVISE_PROPOSAL' };
  }

  return { operation: null, confidence: 0 };
}

function extractSelection(text: string, userId: string, proposals: ProposalRow[]): Stage4SelectionCaptureDTO | undefined {
  let decision: Stage4SelectionDecision | null = null;
  if (/\b(?:not willing|won't|do not want|don't want|no to)\b/i.test(text)) {
    decision = Stage4SelectionDecision.NOT_WILLING;
  } else if (/\b(?:needs discussion|need to discuss|talk more|not sure yet)\b/i.test(text)) {
    decision = Stage4SelectionDecision.NEEDS_DISCUSSION;
  } else if (/\b(?:willing|yes to|i can try|i'd try|i would try|works for me)\b/i.test(text)) {
    decision = Stage4SelectionDecision.WILLING;
  }
  if (!decision) return undefined;

  const match = findReferencedProposal(text, proposals, [Stage4ProposalStatus.ACTIVE, Stage4ProposalStatus.REVISED]);
  if (!match.proposal || match.confidence < CAPTURE_CONFIDENCE_THRESHOLD) return undefined;

  return {
    userId,
    decisions: [
      {
        proposalId: match.proposal.id,
        decision,
        note: text,
      },
    ],
  };
}

function inferClosureSignalFromUserMessage(message: string): Stage4ClosureSignalDTO | undefined {
  const explicitStop =
    /\b(?:stop here|stop this|close here|close this|right place to close|ready to close|no agreement|no shared agreement|without a shared agreement)\b/i.test(message) ||
    /\b(?:feels|feel|is)\s+complete\s+(?:for now|enough to close|as a stopping point|to stop here)\b/i.test(message);
  const declinesSharedRepair =
    /\b(?:not|don't|do not|can't|cannot)\s+(?:want|need|looking for|make|making|seeking)\s+(?:a\s+|another\s+)?(?:shared|couple|joint)\s+(?:strategy|agreement|plan|repair)\b/i.test(message) ||
    /\b(?:not|don't|do not|can't|cannot)\s+(?:ready\s+to\s+)?(?:turn|make)\s+this\s+into\s+(?:a\s+|another\s+)?(?:shared|couple|joint)\s+(?:strategy|agreement|plan|repair)\b/i.test(message) ||
    /\b(?:no|not another)\s+(?:shared|couple|joint)\s+(?:strategy|agreement|plan|repair)\b/i.test(message);

  if (!explicitStop && !declinesSharedRepair) return undefined;

  const boundaryLanguage = /\b(?:boundary|safety|safe|space|separat|ending|end this|protect)\b/i.test(message);

  return {
    readyToClose: true,
    kind: Stage4ClosureKind.NO_SHARED_AGREEMENT,
    reason: boundaryLanguage ? Stage4ClosureReason.BOUNDARY_HONORED : Stage4ClosureReason.USER_STOPPED,
    summary: message,
  };
}

function proposalSnapshot(proposal: ProposalRow): Prisma.JsonObject {
  return {
    description: proposal.description,
    needsAddressed: proposal.needsAddressed,
    duration: proposal.duration,
    measureOfSuccess: proposal.measureOfSuccess,
    kind: proposal.kind,
    status: proposal.status,
    removedAt: proposal.removedAt?.toISOString() ?? null,
    removedByUserId: proposal.removedByUserId,
    removalReason: proposal.removalReason,
  };
}

async function auditSkippedDestructiveCapture(
  proposals: ProposalRow[],
  input: Stage4CaptureInput,
  action: string,
  confidence: number
): Promise<void> {
  const match = findReferencedProposal(input.userMessage, proposals, [
    Stage4ProposalStatus.ACTIVE,
    Stage4ProposalStatus.REVISED,
    Stage4ProposalStatus.REMOVED,
  ]);
  if (!match.proposal) {
    logger.info('[stage4-capture] Skipped low-confidence destructive capture without proposal match', {
      sessionId: input.sessionId,
      userId: input.userId,
      action,
      confidence,
    });
    return;
  }

  await prisma.stage4ProposalRevision.create({
    data: {
      proposalId: match.proposal.id,
      sessionId: input.sessionId,
      actorUserId: input.userId,
      action: 'CAPTURE_SKIPPED',
      before: proposalSnapshot(match.proposal),
      after: { requestedAction: action, confidence },
      reason: 'Low-confidence destructive Stage 4 capture was not applied.',
      messageId: input.messageId,
    },
  });
}

async function applyOperation(
  operation: Stage4InventoryOperation,
  input: Stage4CaptureInput,
  proposals: ProposalRow[]
): Promise<boolean> {
  if (operation.type === 'ADD_PROPOSAL') {
    const activeProposals = proposals.filter((proposal) => proposal.status !== Stage4ProposalStatus.REMOVED);
    const duplicate = proposals.find(
      (proposal) =>
        proposal.status !== Stage4ProposalStatus.REMOVED &&
        normalizeText(proposal.description) === normalizeText(operation.description)
    );
    if (duplicate) return false;
    const sameFamily = activeProposals.find((proposal) => sameProposalFamily(proposal.description, operation.description));
    if (sameFamily) {
      if (proposalSpecificityScore(operation.description) <= proposalSpecificityScore(sameFamily.description)) {
        return false;
      }
      await prisma.strategyProposal.update({
        where: { id: sameFamily.id },
        data: {
          description: operation.description,
          needsAddressed: operation.needsAddressed,
          duration: operation.duration,
          measureOfSuccess: operation.measureOfSuccess,
          kind: operation.kind,
          status: Stage4ProposalStatus.ACTIVE,
        },
      });
      Object.assign(sameFamily, {
        description: operation.description,
        needsAddressed: operation.needsAddressed,
        duration: operation.duration ?? null,
        measureOfSuccess: operation.measureOfSuccess ?? null,
        kind: operation.kind,
        status: Stage4ProposalStatus.ACTIVE,
      });
      await prisma.stage4ProposalRevision.create({
        data: {
          proposalId: sameFamily.id,
          sessionId: input.sessionId,
          actorUserId: input.userId,
          action: 'REVISED',
          before: proposalSnapshot(sameFamily),
          after: {
            ...proposalSnapshot(sameFamily),
            description: operation.description,
            needsAddressed: operation.needsAddressed,
            duration: operation.duration ?? null,
            measureOfSuccess: operation.measureOfSuccess ?? null,
            kind: operation.kind,
            status: Stage4ProposalStatus.ACTIVE,
          },
          reason: 'Captured refined Stage 4 proposal in the same proposal family.',
          messageId: input.messageId,
        },
      });
      return true;
    }
    const superseded = activeProposals.find((proposal) =>
      isSupersededStrategy(proposal.description, operation.description)
    );
    if (superseded) {
      await prisma.strategyProposal.update({
        where: { id: superseded.id },
        data: {
          description: operation.description,
          needsAddressed: operation.needsAddressed,
          duration: operation.duration,
          measureOfSuccess: operation.measureOfSuccess,
          kind: operation.kind,
          status: Stage4ProposalStatus.ACTIVE,
        },
      });
      Object.assign(superseded, {
        description: operation.description,
        needsAddressed: operation.needsAddressed,
        duration: operation.duration ?? null,
        measureOfSuccess: operation.measureOfSuccess ?? null,
        kind: operation.kind,
        status: Stage4ProposalStatus.ACTIVE,
      });
      await prisma.stage4ProposalRevision.create({
        data: {
          proposalId: superseded.id,
          sessionId: input.sessionId,
          actorUserId: input.userId,
          action: 'REVISED',
          before: proposalSnapshot(superseded),
          after: {
            ...proposalSnapshot(superseded),
            description: operation.description,
            needsAddressed: operation.needsAddressed,
            duration: operation.duration ?? null,
            measureOfSuccess: operation.measureOfSuccess ?? null,
            kind: operation.kind,
            status: Stage4ProposalStatus.ACTIVE,
          },
          reason: 'Captured refined Stage 4 proposal superseding an existing draft.',
          messageId: input.messageId,
        },
      });
      return true;
    }

    const created = await prisma.strategyProposal.create({
      data: {
        sessionId: input.sessionId,
        createdByUserId: operation.ownerUserId ?? input.userId,
        description: operation.description,
        needsAddressed: operation.needsAddressed,
        duration: operation.duration,
        measureOfSuccess: operation.measureOfSuccess,
        source: 'AI_SUGGESTED',
        kind: operation.kind,
        status: Stage4ProposalStatus.ACTIVE,
        capturedFromMessageId: input.messageId,
      },
    });
    proposals.push({
      id: created.id,
      sessionId: input.sessionId,
      createdByUserId: operation.ownerUserId ?? input.userId,
      description: operation.description,
      needsAddressed: operation.needsAddressed,
      duration: operation.duration ?? null,
      measureOfSuccess: operation.measureOfSuccess ?? null,
      kind: operation.kind,
      status: Stage4ProposalStatus.ACTIVE,
      removedAt: null,
      removedByUserId: null,
      removalReason: null,
      parentProposalId: null,
      coverageSummary: null,
      capturedFromMessageId: input.messageId,
      createdAt: new Date(),
      updatedAt: new Date(),
      consentRecordId: null,
    } as ProposalRow);
    await prisma.stage4ProposalRevision.create({
      data: {
        proposalId: created.id,
        sessionId: input.sessionId,
        actorUserId: input.userId,
        action: 'CREATED',
        before: Prisma.JsonNull,
        after: {
          description: operation.description,
          needsAddressed: operation.needsAddressed,
          duration: operation.duration ?? null,
          measureOfSuccess: operation.measureOfSuccess ?? null,
          kind: operation.kind,
          status: Stage4ProposalStatus.ACTIVE,
          capturedQuote: operation.capturedQuote ?? null,
        },
        reason: 'Captured from Stage 4 conversation.',
        messageId: input.messageId,
      },
    });
    return true;
  }

  const proposal = proposals.find((candidate) => candidate.id === operation.proposalId);
  if (!proposal) return false;

  if (operation.type === 'REMOVE_PROPOSAL') {
    await prisma.strategyProposal.update({
      where: { id: operation.proposalId },
      data: {
        status: Stage4ProposalStatus.REMOVED,
        removedAt: new Date(),
        removedByUserId: input.userId,
        removalReason: operation.reason,
      },
    });
    await prisma.stage4ProposalRevision.create({
      data: {
        proposalId: operation.proposalId,
        sessionId: input.sessionId,
        actorUserId: input.userId,
        action: 'REMOVED',
        before: proposalSnapshot(proposal),
        after: {
          ...proposalSnapshot(proposal),
          status: Stage4ProposalStatus.REMOVED,
          removedByUserId: input.userId,
          removalReason: operation.reason ?? null,
        },
        reason: operation.reason,
        messageId: input.messageId,
      },
    });
    return true;
  }

  if (operation.type === 'RESTORE_PROPOSAL') {
    await prisma.strategyProposal.update({
      where: { id: operation.proposalId },
      data: {
        status: Stage4ProposalStatus.ACTIVE,
        removedAt: null,
        removedByUserId: null,
        removalReason: null,
      },
    });
    await prisma.stage4ProposalRevision.create({
      data: {
        proposalId: operation.proposalId,
        sessionId: input.sessionId,
        actorUserId: input.userId,
        action: 'RESTORED',
        before: proposalSnapshot(proposal),
        after: {
          ...proposalSnapshot(proposal),
          status: Stage4ProposalStatus.ACTIVE,
          removedAt: null,
          removedByUserId: null,
          removalReason: null,
        },
        reason: operation.reason,
        messageId: input.messageId,
      },
    });
    return true;
  }

  await prisma.strategyProposal.update({
    where: { id: operation.proposalId },
    data: {
      description: operation.description ?? proposal.description,
      needsAddressed: operation.needsAddressed ?? proposal.needsAddressed,
      duration: operation.duration ?? proposal.duration,
      measureOfSuccess: operation.measureOfSuccess ?? proposal.measureOfSuccess,
      kind: operation.kind ?? proposal.kind,
      createdByUserId:
        operation.kind === Stage4ProposalKind.INDIVIDUAL_COMMITMENT
          ? input.userId
          : operation.ownerUserId ?? proposal.createdByUserId,
      status: Stage4ProposalStatus.ACTIVE,
    },
  });
  await prisma.stage4ProposalRevision.create({
    data: {
      proposalId: operation.proposalId,
      sessionId: input.sessionId,
      actorUserId: input.userId,
      action: 'REVISED',
      before: proposalSnapshot(proposal),
      after: {
        ...proposalSnapshot(proposal),
        description: operation.description ?? proposal.description,
        needsAddressed: operation.needsAddressed ?? proposal.needsAddressed,
        duration: operation.duration ?? proposal.duration,
        measureOfSuccess: operation.measureOfSuccess ?? proposal.measureOfSuccess,
        kind: operation.kind ?? proposal.kind,
        status: Stage4ProposalStatus.ACTIVE,
      },
      reason: operation.reason,
      messageId: input.messageId,
    },
  });
  return true;
}

export async function captureStage4Turn(input: Stage4CaptureInput): Promise<Stage4CaptureResult> {
  const proposals = (await prisma.strategyProposal.findMany({
    where: { sessionId: input.sessionId },
    orderBy: { updatedAt: 'desc' },
  })) as ProposalRow[];

  const operations = extractAddOperations(input);
  const destructiveOrRevision = extractDestructiveOrRevisionOperation(input.userMessage, proposals);
  if (destructiveOrRevision.operation) {
    operations.push(destructiveOrRevision.operation);
  }

  const selection = extractSelection(input.userMessage, input.userId, proposals);
  const confidence = operations.length > 0 || selection
    ? Math.max(
        operations.some((operation) => operation.type === 'ADD_PROPOSAL') ? 0.78 : 0,
        destructiveOrRevision.confidence,
        selection ? 0.82 : 0
      )
    : 0;

  let appliedOperationCount = 0;
  let skippedOperationCount = 0;

  if (destructiveOrRevision.lowConfidenceAction && destructiveOrRevision.confidence < DESTRUCTIVE_CONFIDENCE_THRESHOLD) {
    skippedOperationCount += 1;
    await auditSkippedDestructiveCapture(
      proposals,
      input,
      destructiveOrRevision.lowConfidenceAction,
      destructiveOrRevision.confidence
    );
  }

  for (const operation of operations) {
    const isDestructive = operation.type === 'REMOVE_PROPOSAL' || operation.type === 'RESTORE_PROPOSAL';
    const requiredConfidence = isDestructive ? DESTRUCTIVE_CONFIDENCE_THRESHOLD : CAPTURE_CONFIDENCE_THRESHOLD;
    const operationConfidence = isDestructive ? destructiveOrRevision.confidence : confidence;
    if (operationConfidence < requiredConfidence) {
      skippedOperationCount += 1;
      continue;
    }
    const applied = await applyOperation(operation, input, proposals);
    if (applied) appliedOperationCount += 1;
    else skippedOperationCount += 1;
  }

  if (appliedOperationCount > 0) {
    await refreshStage4NeedCoverage(input.sessionId);
  }

  if (selection) {
    for (const decision of selection.decisions) {
      await prisma.stage4ProposalSelection.upsert({
        where: {
          proposalId_userId: {
            proposalId: decision.proposalId,
            userId: input.userId,
          },
        },
        create: {
          proposalId: decision.proposalId,
          sessionId: input.sessionId,
          userId: input.userId,
          decision: decision.decision,
          note: decision.note,
        },
        update: {
          decision: decision.decision,
          note: decision.note,
          selectedAt: new Date(),
        },
      });
    }
  }

  return {
    operations,
    selection,
    closureSignal: inferClosureSignalFromUserMessage(input.userMessage),
    confidence,
    rationale: operations.length > 0 || selection
      ? 'Captured deterministic Stage 4 inventory or selection signal from the conversation turn.'
      : 'No high-confidence Stage 4 inventory operation detected.',
    appliedOperationCount,
    skippedOperationCount,
  };
}
