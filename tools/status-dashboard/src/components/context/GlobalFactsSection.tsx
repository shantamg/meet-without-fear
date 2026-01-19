import React from 'react';
import { GlobalFact } from '../../types';

interface GlobalFactsSectionProps {
  globalFacts?: GlobalFact[];
}

// Category color mapping (same as NotableFactsSection)
const CATEGORY_COLORS: Record<string, string> = {
  'people': 'blue',
  'people & relationships': 'blue',
  'logistics': 'gray',
  'situational': 'gray',
  'conflict': 'red',
  'emotional': 'purple',
  'emotional context': 'purple',
  'history': 'amber',
};

function getCategoryColor(category: string): string {
  const normalizedCategory = category.toLowerCase();
  return CATEGORY_COLORS[normalizedCategory] || 'gray';
}

/**
 * GlobalFactsSection displays cross-session facts grouped by category.
 */
export function GlobalFactsSection({ globalFacts }: GlobalFactsSectionProps) {
  if (!globalFacts || globalFacts.length === 0) {
    return (
      <div className="context-section global-facts">
        <div className="section-header">
          <h4>Global Facts</h4>
        </div>
        <div className="section-content">
          <div className="empty-section">No global facts</div>
        </div>
      </div>
    );
  }

  // Group facts by category
  const factsByCategory = globalFacts.reduce((acc, fact) => {
    const category = fact.category || 'uncategorized';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(fact.fact);
    return acc;
  }, {} as Record<string, string[]>);

  return (
    <div className="context-section global-facts">
      <div className="section-header">
        <h4>Global Facts</h4>
        <span className="fact-count">{globalFacts.length} facts</span>
      </div>

      <div className="section-content">
        <div className="facts-by-category">
          {Object.entries(factsByCategory).map(([category, facts]) => (
            <div key={category} className="category-group">
              <span className={`category-badge ${getCategoryColor(category)}`}>
                {category}
              </span>
              <ul className="category-facts">
                {facts.map((fact, idx) => (
                  <li key={idx} className="global-fact">{fact}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
