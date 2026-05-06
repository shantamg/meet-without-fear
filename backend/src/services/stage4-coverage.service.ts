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

function overlapScore(needLabel: string, proposalText: string): number {
  const needWords = words(needLabel);
  if (needWords.length === 0) return 0;

  const proposalWords = new Set(words(proposalText));
  const overlap = needWords.filter((word) => proposalWords.has(word)).length;
  return overlap / needWords.length;
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
      const score = addressed || directMention ? 1 : overlapScore(need.need, text);
      return { proposal, score };
    })
    .filter((item) => item.score >= 0.34)
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
