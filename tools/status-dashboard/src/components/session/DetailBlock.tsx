import React from 'react';
import { SmartDataViewer } from './SmartDataViewer';

interface DetailBlockProps {
  title: string;
  data: any;
  defaultOpen?: boolean;
}

/**
 * Simplified DetailBlock that uses SmartDataViewer for consistent data display.
 */
export function DetailBlock({ title, data, defaultOpen = false }: DetailBlockProps) {
  return (
    <SmartDataViewer 
      data={data} 
      title={title} 
      defaultOpen={defaultOpen} 
    />
  );
}
