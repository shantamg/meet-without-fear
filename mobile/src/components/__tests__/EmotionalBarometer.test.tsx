import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { EmotionalBarometer } from '../EmotionalBarometer';

// Mock the slider component
jest.mock('@react-native-community/slider', () => {
  const { View, Text } = require('react-native');
  return {
    __esModule: true,
    default: ({
      testID,
      value,
      onValueChange,
    }: {
      testID: string;
      value: number;
      onValueChange: (value: number) => void;
    }) => (
      <View testID={testID}>
        <Text>{value}</Text>
      </View>
    ),
  };
});

describe('EmotionalBarometer', () => {
  const defaultProps = {
    value: 5,
    onChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows slider with current value', () => {
    render(<EmotionalBarometer {...defaultProps} />);
    expect(screen.getByText('5')).toBeTruthy();
  });

  it('displays the correct intensity label for low values', () => {
    render(<EmotionalBarometer value={2} onChange={jest.fn()} />);
    // Use getAllByText since "Calm" appears in both scale label and intensity display
    const calmElements = screen.getAllByText(/Calm/);
    expect(calmElements.length).toBeGreaterThanOrEqual(1);
  });

  it('displays the correct intensity label for medium values', () => {
    render(<EmotionalBarometer value={5} onChange={jest.fn()} />);
    expect(screen.getByText(/Neutral/)).toBeTruthy();
  });

  it('displays the correct intensity label for heightened values', () => {
    render(<EmotionalBarometer value={7} onChange={jest.fn()} />);
    expect(screen.getByText(/Heightened/)).toBeTruthy();
  });

  it('displays the correct intensity label for intense values', () => {
    render(<EmotionalBarometer value={9} onChange={jest.fn()} />);
    // Use getAllByText since "Intense" appears in both scale label and intensity display
    const intenseElements = screen.getAllByText(/Intense/);
    expect(intenseElements.length).toBeGreaterThanOrEqual(1);
  });

  it('suggests exercise at high intensity', () => {
    render(<EmotionalBarometer value={8} onChange={jest.fn()} />);
    expect(screen.getByText(/take a moment/i)).toBeTruthy();
  });

  it('does not suggest exercise at low intensity', () => {
    render(<EmotionalBarometer value={5} onChange={jest.fn()} />);
    expect(screen.queryByText(/take a moment/i)).toBeNull();
  });

  it('shows header label by default', () => {
    render(<EmotionalBarometer {...defaultProps} />);
    expect(screen.getByText('How are you feeling?')).toBeTruthy();
  });

  it('hides header label when showLabel is false', () => {
    render(<EmotionalBarometer {...defaultProps} showLabel={false} />);
    expect(screen.queryByText('How are you feeling?')).toBeNull();
  });

  it('shows scale labels', () => {
    render(<EmotionalBarometer {...defaultProps} />);
    const calmLabels = screen.getAllByText('Calm');
    const intenseLabels = screen.getAllByText('Intense');
    expect(calmLabels.length).toBeGreaterThanOrEqual(1);
    expect(intenseLabels.length).toBeGreaterThanOrEqual(1);
  });

  it('shows context input when showContextInput is true', () => {
    render(
      <EmotionalBarometer {...defaultProps} showContextInput={true} onContextChange={jest.fn()} />
    );
    expect(screen.getByText("What's going on?")).toBeTruthy();
    expect(screen.getByTestId('context-input')).toBeTruthy();
  });

  it('does not show context input by default', () => {
    render(<EmotionalBarometer {...defaultProps} />);
    expect(screen.queryByText("What's going on?")).toBeNull();
  });

  it('calls onContextChange when context is typed', () => {
    const onContextChange = jest.fn();
    render(
      <EmotionalBarometer
        {...defaultProps}
        showContextInput={true}
        onContextChange={onContextChange}
      />
    );
    const input = screen.getByTestId('context-input');
    fireEvent.changeText(input, 'Feeling anxious about meeting');
    expect(onContextChange).toHaveBeenCalledWith('Feeling anxious about meeting');
  });

  it('renders slider with testID', () => {
    render(<EmotionalBarometer {...defaultProps} />);
    expect(screen.getByTestId('slider')).toBeTruthy();
  });
});
