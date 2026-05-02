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
    onAcceptWithoutRevising: jest.fn(),
    onDeclineAcceptance: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows partner-side acceptance actions while revising', () => {
    render(<ViewEmpathyStatementDrawer {...defaultProps} isRevising />);

    expect(screen.getByText('Refine further')).toBeTruthy();
    expect(screen.getByText('Resubmit')).toBeTruthy();
    expect(screen.getByText('I accept their experience')).toBeTruthy();
    expect(screen.getByText('I cannot accept this')).toBeTruthy();
  });

  it('calls accept callback and closes when accepting without revising', () => {
    render(<ViewEmpathyStatementDrawer {...defaultProps} isRevising />);

    fireEvent.press(screen.getByTestId('accept-without-revising-button'));

    expect(defaultProps.onAcceptWithoutRevising).toHaveBeenCalledTimes(1);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('asks for a reason before declining acceptance', () => {
    render(<ViewEmpathyStatementDrawer {...defaultProps} isRevising />);

    fireEvent.press(screen.getByTestId('decline-acceptance-button'));
    expect(screen.getByTestId('decline-acceptance-reason-input')).toBeTruthy();

    fireEvent.changeText(
      screen.getByTestId('decline-acceptance-reason-input'),
      'This still misses why I was hurt.'
    );
    fireEvent.press(screen.getByTestId('submit-decline-acceptance-button'));

    expect(defaultProps.onDeclineAcceptance).toHaveBeenCalledWith(
      'This still misses why I was hurt.'
    );
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('preserves resubmit action while revising', () => {
    render(<ViewEmpathyStatementDrawer {...defaultProps} isRevising />);

    fireEvent.press(screen.getByTestId('share-empathy-button'));

    expect(defaultProps.onShare).toHaveBeenCalledTimes(1);
  });
});
