import React from 'react';
import { formatPrice } from '../../utils/formatters';

interface FormattedPriceProps {
  value?: number;
}

export function FormattedPrice({ value }: FormattedPriceProps) {
  const { intPart, primaryDec, secondaryDec, full } = formatPrice(value);

  return (
    <span className="price-component" title={full}>
      ${intPart}.{primaryDec}
      <span style={{ color: '#888' }}>{secondaryDec}</span>
    </span>
  );
}
