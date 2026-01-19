import React from 'react';
import { CategorizedFact } from '../../types';

interface NotableFactsSectionProps {
  facts?: CategorizedFact[];
}

// Category color mapping
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
 * NotableFactsSection displays notable facts with category badges.
 * Facts are shown as a flat list with colored category badges.
 */
export function NotableFactsSection({ facts }: NotableFactsSectionProps) {
  return (
    <div className="context-section notable-facts">
      <div className="section-header">
        <h4>Notable Facts</h4>
        {facts && facts.length > 0 && (
          <span className="fact-count">{facts.length} facts</span>
        )}
      </div>

      <div className="section-content">
        {!facts || facts.length === 0 ? (
          <div className="empty-section">No facts extracted yet</div>
        ) : (
          <ul className="fact-list">
            {facts.map((fact, idx) => (
              <li key={idx} className="fact-item">
                <span className={`category-badge ${getCategoryColor(fact.category)}`}>
                  {fact.category}
                </span>
                <span className="fact-text">{fact.fact}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
