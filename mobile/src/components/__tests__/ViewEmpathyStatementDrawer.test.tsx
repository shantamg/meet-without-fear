import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ViewEmpathyStatementDrawer } from '../ViewEmpathyStatementDrawer';

describe('ViewEmpathyStatementDrawer', () => {
  const defaultProps = {
    visible: true,
    statement: 'I understand why this felt frustrating.',
    partnerName: 'Alex',
    onShare: jest.fn(),
    onClose: jest.fn(),
    onSendRefinement: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not show accept/reject buttons while revising', () => {
    render(<ViewEmpathyStatementDrawer {...defaultProps} isRevising />);

    expect(screen.getByText('Refine further')).toBeTruthy();
    expect(screen.getByText('Resubmit')).toBeTruthy();
    expect(screen.queryByText('I accept their experience')).toBeNull();
    expect(screen.queryByText('I cannot accept this')).toBeNull();
  });

  it('preserves resubmit action while revising', () => {
    render(<ViewEmpathyStatementDrawer {...defaultProps} isRevising />);

    fireEvent.press(screen.getByTestId('share-empathy-button'));

    expect(defaultProps.onShare).toHaveBeenCalledTimes(1);
  });
});
