/**
 * TakeawayRow Component
 *
 * Individual takeaway row with two modes:
 * - View mode (default): tappable text row showing the takeaway content
 * - Edit mode (on tap): multiline TextInput that saves on blur if changed
 *
 * The theme label (if present) is shown as a small muted tag above the content.
 * Saving on blur calls onUpdate only if the trimmed text is non-empty and different.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { TakeawayDTO } from '@meet-without-fear/shared';
import { useAppAppearance } from '../theme';

// ============================================================================
// Types
// ============================================================================

interface TakeawayRowProps {
  takeaway: TakeawayDTO;
  onUpdate: (takeawayId: string, content: string) => void;
  /** Called when the row enters edit mode — e.g. to close other swipeables */
  onStartEdit?: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function TakeawayRow({ takeaway, onUpdate, onStartEdit }: TakeawayRowProps) {
  const { palette } = useAppAppearance();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(takeaway.content);

  // Keep local edit text in sync when the cache updates from the server
  useEffect(() => {
    if (!isEditing) {
      setEditText(takeaway.content);
    }
  }, [takeaway.content, isEditing]);

  const handlePress = useCallback(() => {
    onStartEdit?.();
    setIsEditing(true);
  }, [onStartEdit]);

  const handleBlur = useCallback(() => {
    const trimmed = editText.trim();
    if (trimmed.length > 0 && trimmed !== takeaway.content) {
      onUpdate(takeaway.id, trimmed);
    }
    setIsEditing(false);
  }, [editText, takeaway.content, takeaway.id, onUpdate]);

  if (isEditing) {
    return (
      <View style={[styles.row, styles.rowEditing]}>
        {takeaway.theme ? (
          <Text style={styles.themeLabel}>{takeaway.theme}</Text>
        ) : null}
        <TextInput
          style={styles.editInput}
          value={editText}
          onChangeText={setEditText}
          onBlur={handleBlur}
          multiline
          autoFocus
          autoCorrect
          accessibilityLabel="Edit takeaway text"
          placeholderTextColor={palette.textFaint}
        />
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={handlePress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Takeaway: ${takeaway.content}. Tap to edit.`}
    >
      {takeaway.theme ? (
        <Text style={styles.themeLabel}>{takeaway.theme}</Text>
      ) : null}
      <Text style={styles.contentText}>{takeaway.content}</Text>
    </TouchableOpacity>
  );
}

// ============================================================================
// Styles
// ============================================================================

type Palette = ReturnType<typeof useAppAppearance>['palette'];

const makeStyles = (palette: Palette) => StyleSheet.create({
    row: {
      paddingHorizontal: 24,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: palette.divider,
      backgroundColor: palette.bg,
    },
    rowEditing: {
      backgroundColor: palette.bgElev,
    },
    themeLabel: {
      fontSize: 11,
      color: palette.textFaint,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 4,
    },
    contentText: {
      fontSize: 15,
      color: palette.text,
      lineHeight: 22,
    },
    editInput: {
      fontSize: 15,
      color: palette.text,
      lineHeight: 22,
      minHeight: 44,
      // Remove default TextInput outline on web
      outlineWidth: 0,
    } as any,
  });
