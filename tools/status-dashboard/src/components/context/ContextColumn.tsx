import { ContextBundle } from '../../types';
import { RecentMessagesSection } from './RecentMessagesSection';
import { NotableFactsSection } from './NotableFactsSection';
import { EmotionalThreadSection } from './EmotionalThreadSection';
import { SessionSummarySection } from './SessionSummarySection';
import { UserMemoriesSection } from './UserMemoriesSection';
import { InnerThoughtsSection } from './InnerThoughtsSection';
import { PriorThemesSection } from './PriorThemesSection';
import { GlobalFactsSection } from './GlobalFactsSection';

interface ContextColumnProps {
  userId: string;
  userName: string;
  context: ContextBundle;
}

/**
 * ContextColumn displays all context sections for a single user.
 * Used in the side-by-side layout for partner sessions.
 */
export function ContextColumn({ userName, context }: ContextColumnProps) {
  return (
    <div className="context-column">
      <div className="context-column-header">
        <h3>{userName}</h3>
        <span className="stage-badge">Stage {context.stageContext.stage}</span>
        <span className="intent-badge" title={context.intent.reason}>
          {context.intent.intent.replace('_', ' ')}
        </span>
      </div>

      <div className="context-sections">
        <NotableFactsSection facts={context.notableFacts} />

        <EmotionalThreadSection emotionalThread={context.emotionalThread} />

        <SessionSummarySection sessionSummary={context.sessionSummary} />

        <UserMemoriesSection userMemories={context.userMemories} />

        <InnerThoughtsSection innerThoughtsContext={context.innerThoughtsContext} />

        <PriorThemesSection priorThemes={context.priorThemes} />

        <GlobalFactsSection globalFacts={context.globalFacts} />

        <RecentMessagesSection
          recentTurns={context.conversationContext.recentTurns}
          turnCount={context.conversationContext.turnCount}
          sessionDurationMinutes={context.conversationContext.sessionDurationMinutes}
        />
      </div>
    </div>
  );
}
