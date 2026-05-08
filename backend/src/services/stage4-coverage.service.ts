import { Stage4ProposalStatus } from '@meet-without-fear/shared';
import { prisma } from '../lib/prisma';

type Stage4CoverageStatus = 'COVERED' | 'PARTIAL' | 'OPEN';

type NeedRow = {
  id: string;
  need: string;
  vessel: {
    userId: string;
  };
};

type ProposalRow = {
  id: string;
  description: string;
  needsAddressed: string[];
  status: Stage4ProposalStatus;
};

export type Stage4NeedCoverageRefreshResult = {
  covered: number;
  partial: number;
  open: number;
  total: number;
};

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function words(value: string): string[] {
  return normalizeText(value)
    .split(' ')
    .filter((word) => word.length > 2);
}

function concepts(value: string): Set<string> {
  const normalized = normalizeText(value);
  const tokens = new Set<string>();

  const addIf = (concept: string, patterns: RegExp[]) => {
    if (patterns.some((pattern) => pattern.test(normalized))) {
      tokens.add(concept);
    }
  };

  addIf('stable-life-counts', [
    /\bstabil/,
    /\blife\b.*\bcount/,
    /\bcount\b.*\blife/,
    /\bnot\b.*\bmistake/,
    /\bthrow(?:n|ing)?\s+out\b/,
    /\bnot\b.*\btrial\b/,
    /\bnot\b.*\bwhole future\b/,
  ]);
  addIf('hear-wants-without-failure', [
    /\bhear\b.*\bwant/,
    /\bwant\b.*\bproof\b.*\bfail/,
    /\bproof\b.*\bfail/,
    /\bnot\b.*\bshut\b.*\bdown/,
    /\bnot\b.*\bcase against\b/,
    /\bnot\b.*\bcritique/,
    /\bnot\b.*\breasonab/,
  ]);
  addIf('stay-present-pause-return', [
    /\bstay present\b/,
    /\bpause\b/,
    /\bten minutes?\b/,
    /\bcome back\b/,
    /\breturn\b/,
    /\bwithout disappearing\b/,
    /\bdisappear/,
    /\bfreeze\b/,
  ]);
  addIf('voice-wants-before-editing', [
    /\bexpress\b.*\bwant/,
    /\bname\b.*\bwant/,
    /\bsay\b.*\bwant/,
    /\bbrings? one\b/,
    /\bone specific thing\b/,
    /\bwithout editing\b/,
    /\bsoften\b/,
    /\bmaking myself smaller\b/,
    /\bsmaller\b/,
  ]);
  addIf('agency-choice-life-mine', [
    /\bchoose\b/,
    /\bmy life\b.*\bmine\b/,
    /\blife\b.*\bmine\b/,
    /\bwithout asking\b.*\bapprove/,
    /\bsign up\b/,
    /\bresearch\b.*\bitinerary\b/,
    /\bcommitment\b/,
  ]);
  addIf('growth-movement-aliveness', [
    /\bgrow/,
    /\bbecoming\b/,
    /\bchange\b/,
    /\bmovement\b/,
    /\baliveness\b/,
    /\bsomething new\b/,
    /\bclass\b/,
    /\bhike\b/,
    /\bday trip\b/,
    /\brestaurant\b/,
    /\bitinerary\b/,
  ]);
  addIf('temperature-fear-regulation', [
    /\bmanage\b.*\bfear/,
    /\btemperature\b/,
    /\boverwhelm/,
    /\bscared\b/,
    /\bfear\b/,
    /\bname\b.*\boverwhelm/,
  ]);

  return tokens;
}

function overlapScore(needLabel: string, proposalText: string): number {
  const needWords = words(needLabel);
  if (needWords.length === 0) return 0;

  const proposalWords = new Set(words(proposalText));
  const overlap = needWords.filter((word) => proposalWords.has(word)).length;
  return overlap / needWords.length;
}

function conceptOverlapScore(needLabel: string, proposalText: string): number {
  const needConcepts = concepts(needLabel);
  if (needConcepts.size === 0) return 0;

  const proposalConcepts = concepts(proposalText);
  const overlap = [...needConcepts].filter((concept) => proposalConcepts.has(concept)).length;
  return overlap / needConcepts.size;
}

function proposalText(proposal: ProposalRow): string {
  return [proposal.description, ...proposal.needsAddressed].join(' ');
}

function classifyCoverage(
  need: NeedRow,
  proposals: ProposalRow[]
): { status: Stage4CoverageStatus; proposalIds: string[]; note: string } {
  const normalizedNeed = normalizeText(need.need);
  const scored = proposals
    .map((proposal) => {
      const addressed = proposal.needsAddressed.some((label) => {
        const normalizedLabel = normalizeText(label);
        return normalizedLabel === normalizedNeed ||
          normalizedLabel.includes(normalizedNeed) ||
          normalizedNeed.includes(normalizedLabel);
      });
      const text = proposalText(proposal);
      const normalizedProposalText = normalizeText(text);
      const directMention = normalizedProposalText.includes(normalizedNeed);
      const lexicalScore = overlapScore(need.need, text);
      const semanticScore = conceptOverlapScore(need.need, text);
      const score = addressed || directMention
        ? 1
        : Math.max(lexicalScore, Math.min(semanticScore, 0.74));
      return { proposal, score };
    })
    .filter((item) => item.score >= 0.25)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return {
      status: 'OPEN',
      proposalIds: [],
      note: 'Still open for Stage 4 discussion.',
    };
  }

  const bestScore = scored[0]?.score ?? 0;
  const proposalIds = scored.map((item) => item.proposal.id);
  if (bestScore >= 0.75) {
    return {
      status: 'COVERED',
      proposalIds,
      note: 'Covered by at least one active proposal.',
    };
  }

  return {
    status: 'PARTIAL',
    proposalIds,
    note: 'Partly addressed; may need more detail or adjustment.',
  };
}

export async function refreshStage4NeedCoverage(
  sessionId: string
): Promise<Stage4NeedCoverageRefreshResult> {
  const [needs, proposals] = await Promise.all([
    prisma.identifiedNeed.findMany({
      where: {
        confirmed: true,
        vessel: { sessionId },
      },
      include: {
        vessel: {
          select: {
            userId: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    }) as Promise<NeedRow[]>,
    prisma.strategyProposal.findMany({
      where: {
        sessionId,
        status: { not: Stage4ProposalStatus.REMOVED },
      },
      orderBy: { updatedAt: 'desc' },
    }) as Promise<ProposalRow[]>,
  ]);

  const coverageRows = needs.map((need) => {
    const coverage = classifyCoverage(need, proposals);
    return {
      sessionId,
      needId: need.id,
      needLabel: need.need,
      sourceUserId: need.vessel.userId,
      coverageStatus: coverage.status,
      coveringProposalIds: coverage.proposalIds,
      note: coverage.note,
    };
  });

  await prisma.$transaction(async (tx) => {
    await tx.stage4NeedCoverage.deleteMany({ where: { sessionId } });
    if (coverageRows.length > 0) {
      await tx.stage4NeedCoverage.createMany({ data: coverageRows });
    }
  });

  return {
    covered: coverageRows.filter((row) => row.coverageStatus === 'COVERED').length,
    partial: coverageRows.filter((row) => row.coverageStatus === 'PARTIAL').length,
    open: coverageRows.filter((row) => row.coverageStatus === 'OPEN').length,
    total: coverageRows.length,
  };
}
