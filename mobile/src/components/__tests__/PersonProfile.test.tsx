/**
 * PersonProfile Component Tests
 *
 * Tests for the person profile component that displays avatar, name, and connection info.
 */

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { PersonProfile } from '../PersonProfile';

describe('PersonProfile', () => {
  it('renders person name', () => {
    render(
      <PersonProfile name="Alex Smith" initials="AS" connectedSince="Oct 2024" />
    );

    expect(screen.getByText('Alex Smith')).toBeTruthy();
  });

  it('renders person initials in avatar', () => {
    render(
      <PersonProfile name="Alex Smith" initials="AS" connectedSince="Oct 2024" />
    );

    expect(screen.getByText('AS')).toBeTruthy();
  });

  it('renders connected since date', () => {
    render(
      <PersonProfile name="Alex Smith" initials="AS" connectedSince="Oct 2024" />
    );

    expect(screen.getByText('Connected since Oct 2024')).toBeTruthy();
  });

  it('renders with testID for testing', () => {
    render(
      <PersonProfile name="Alex Smith" initials="AS" connectedSince="Oct 2024" />
    );

    expect(screen.getByTestId('person-profile')).toBeTruthy();
  });

  it('renders accessibility label for avatar', () => {
    render(
      <PersonProfile name="Alex Smith" initials="AS" connectedSince="Oct 2024" />
    );

    expect(screen.getByLabelText('Avatar for Alex Smith')).toBeTruthy();
  });

  it('handles single initial', () => {
    render(<PersonProfile name="Alex" initials="A" connectedSince="Jan 2025" />);

    expect(screen.getByText('A')).toBeTruthy();
  });

  it('handles long names', () => {
    render(
      <PersonProfile
        name="Alexander Christopher Smith-Johnson"
        initials="AS"
        connectedSince="Dec 2024"
      />
    );

    expect(screen.getByText('Alexander Christopher Smith-Johnson')).toBeTruthy();
  });
});
