import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccuracyFeedbackDrawer } from '../AccuracyFeedbackDrawer';

describe('AccuracyFeedbackDrawer', () => {
  const defaultProps = {
    visible: true,
    statement: 'You felt ignored during the planning conversation.',
    partnerName: 'Alex',
    onAccurate: jest.fn(),
    onPartiallyAccurate: jest.fn(),
    onInaccurate: jest.fn(),
    onClose: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('asks for rough feedback before opening the feedback coach path', () => {
    render(<AccuracyFeedbackDrawer {...defaultProps} />);

    fireEvent.press(screen.getByTestId('accuracy-inaccurate-button'));

    expect(screen.getByText('What feels off?')).toBeTruthy();
    expect(screen.getByTestId('accuracy-rough-feedback-input')).toBeTruthy();
    expect(defaultProps.onInaccurate).not.toHaveBeenCalled();
    expect(defaultProps.onClose).not.toHaveBeenCalled();
  });

  it('requires non-empty rough feedback', () => {
    render(<AccuracyFeedbackDrawer {...defaultProps} />);

    fireEvent.press(screen.getByTestId('accuracy-inaccurate-button'));

    expect(screen.getByTestId('accuracy-feedback-continue').props.accessibilityState).toEqual({
      disabled: true,
    });
    expect(defaultProps.onInaccurate).not.toHaveBeenCalled();
  });

  it('submits trimmed rough feedback and closes', () => {
    render(<AccuracyFeedbackDrawer {...defaultProps} />);

    fireEvent.press(screen.getByTestId('accuracy-inaccurate-button'));
    fireEvent.changeText(
      screen.getByTestId('accuracy-rough-feedback-input'),
      '  It misses that I felt dismissed.  '
    );
    fireEvent.press(screen.getByTestId('accuracy-feedback-continue'));

    expect(defaultProps.onInaccurate).toHaveBeenCalledWith('It misses that I felt dismissed.');
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('can go back from the rough feedback step', () => {
    render(<AccuracyFeedbackDrawer {...defaultProps} />);

    fireEvent.press(screen.getByTestId('accuracy-inaccurate-button'));
    fireEvent.press(screen.getByTestId('accuracy-feedback-back'));

    expect(screen.getByText('How accurate is this?')).toBeTruthy();
    expect(screen.queryByTestId('accuracy-rough-feedback-input')).toBeNull();
  });
});
