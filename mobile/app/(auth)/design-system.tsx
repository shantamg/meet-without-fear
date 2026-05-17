import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MemorySuggestion, MessageRole } from '@meet-without-fear/shared';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Clock,
  Moon,
  PanelBottom,
  PanelRight,
  Search,
  Sun,
  X,
} from 'lucide-react-native';

import { ChatBubble } from '@/src/components/ChatBubble';
import { ChatIndicator } from '@/src/components/ChatIndicator';
import { ChatInput } from '@/src/components/ChatInput';
import { CompactAgreementBar } from '@/src/components/CompactAgreementBar';
import { EmotionSlider } from '@/src/components/EmotionSlider';
import { FeelHeardConfirmation } from '@/src/components/FeelHeardConfirmation';
import { GuidedActionPanel } from '@/src/components/GuidedActionPanel';
import { SessionChatHeader } from '@/src/components/SessionChatHeader';
import { ShareTopicDrawer } from '@/src/components/ShareTopicDrawer';
import { ShareTopicPanel } from '@/src/components/ShareTopicPanel';
import { SupportOptionsModal } from '@/src/components/SupportOptionsModal';
import { EditSuggestionModal } from '@/src/components/EditSuggestionModal';
import { TranscriptionDrawer } from '@/src/components/TranscriptionDrawer';
import { WaitingBanner } from '@/src/components/WaitingBanner';
import { appWidthStyle, designFonts, useAppAppearance } from '@/src/theme';

type Section = 'inventory' | 'palette' | 'chat' | 'ctas' | 'states' | 'overlays';
type Palette = ReturnType<typeof useAppAppearance>['palette'];
type Mode = 'light' | 'dark' | 'system';

const sections: Array<{ id: Section; label: string }> = [
  { id: 'inventory', label: 'Inventory' },
  { id: 'palette', label: 'Palette' },
  { id: 'chat', label: 'Chat' },
  { id: 'ctas', label: 'CTAs' },
  { id: 'states', label: 'States' },
  { id: 'overlays', label: 'Overlays' },
];

export default function DesignSystemScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ section?: string; mode?: string; overlay?: string }>();
  const appearance = useAppAppearance();
  const { palette, preference, setPreference } = appearance;
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const requestedSection = sections.some((item) => item.id === params.section)
    ? (params.section as Section)
    : 'inventory';
  const [section, setSection] = useState<Section>(requestedSection);
  const [shareDrawerOpen, setShareDrawerOpen] = useState(params.overlay === 'share-topic');
  const [supportOpen, setSupportOpen] = useState(params.overlay === 'support');
  const [bottomSheetOpen, setBottomSheetOpen] = useState(params.overlay === 'sheet');
  const [transcriptionOpen, setTranscriptionOpen] = useState(params.overlay === 'transcription');
  const [editSuggestionOpen, setEditSuggestionOpen] = useState(params.overlay === 'edit-suggestion');
  const memorySuggestion = useMemo<MemorySuggestion>(() => ({
    id: 'design-memory-suggestion',
    suggestedContent: 'Sam prefers direct repair conversations after both people have had a little time to cool down.',
    category: 'RELATIONSHIP',
    confidence: 'high',
    evidence: 'Mentioned during a previous reflection about repair timing.',
  }), []);

  useEffect(() => {
    setSection(requestedSection);
  }, [requestedSection]);

  useEffect(() => {
    if (params.mode === 'light' || params.mode === 'dark' || params.mode === 'system') {
      void setPreference(params.mode);
    }
  }, [params.mode, setPreference]);

  useEffect(() => {
    setShareDrawerOpen(params.overlay === 'share-topic');
    setSupportOpen(params.overlay === 'support');
    setBottomSheetOpen(params.overlay === 'sheet');
    setTranscriptionOpen(params.overlay === 'transcription');
    setEditSuggestionOpen(params.overlay === 'edit-suggestion');
  }, [params.overlay]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft color={palette.textMuted} size={22} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Design review</Text>
          <Text style={styles.subtitle}>Color, type, chat, CTAs, drawers</Text>
        </View>
      </View>

      <View style={styles.modeRow}>
        {(['light', 'dark', 'system'] as const).map((mode: Mode) => (
          <TouchableOpacity
            key={mode}
            style={[styles.modeButton, preference === mode && styles.modeButtonActive]}
            onPress={() => setPreference(mode)}
            accessibilityRole="button"
            accessibilityLabel={`Use ${mode} appearance`}
          >
            {mode === 'dark' ? (
              <Moon color={preference === mode ? palette.bg : palette.textMuted} size={14} />
            ) : (
              <Sun color={preference === mode ? palette.bg : palette.textMuted} size={14} />
            )}
            <Text style={[styles.modeText, preference === mode && styles.modeTextActive]}>
              {mode}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.segmentRow}>
        {sections.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[styles.segmentButton, section === item.id && styles.segmentButtonActive]}
            onPress={() => setSection(item.id)}
            accessibilityRole="button"
            accessibilityLabel={`Show ${item.label}`}
          >
            <Text style={[styles.segmentText, section === item.id && styles.segmentTextActive]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {section === 'inventory' && <InventorySection styles={styles} palette={palette} />}
        {section === 'palette' && <PaletteSection styles={styles} palette={palette} />}
        {section === 'chat' && <ChatSection styles={styles} palette={palette} />}
        {section === 'ctas' && <CtaSection styles={styles} onOpenShareDrawer={() => setShareDrawerOpen(true)} />}
        {section === 'states' && <StateSection styles={styles} palette={palette} />}
        {section === 'overlays' && (
          <OverlaySection
            styles={styles}
            palette={palette}
            onOpenBottomSheet={() => setBottomSheetOpen(true)}
            onOpenEditSuggestion={() => setEditSuggestionOpen(true)}
            onOpenShareDrawer={() => setShareDrawerOpen(true)}
            onOpenSupport={() => setSupportOpen(true)}
            onOpenTranscription={() => setTranscriptionOpen(true)}
          />
        )}
      </ScrollView>

      <ShareTopicDrawer
        visible={shareDrawerOpen}
        action="OFFER_SHARING"
        partnerName="Sam"
        suggestedShareFocus="How much effort it takes to keep everything moving when you are already depleted."
        onAccept={() => setShareDrawerOpen(false)}
        onDecline={() => setShareDrawerOpen(false)}
        onClose={() => setShareDrawerOpen(false)}
      />
      <SupportOptionsModal
        visible={supportOpen}
        onSelectOption={() => setSupportOpen(false)}
        onClose={() => setSupportOpen(false)}
      />
      <BottomSheetPreview
        visible={bottomSheetOpen}
        palette={palette}
        styles={styles}
        onClose={() => setBottomSheetOpen(false)}
      />
      <TranscriptionDrawer
        visible={transcriptionOpen}
        displayTranscript="I am realizing I need to say this more clearly before it turns into another argument."
        phase="recording"
        elapsedSeconds={42}
        error={null}
        onStopAndSend={() => setTranscriptionOpen(false)}
        onCancel={() => setTranscriptionOpen(false)}
      />
      <EditSuggestionModal
        visible={editSuggestionOpen}
        suggestion={memorySuggestion}
        onClose={() => setEditSuggestionOpen(false)}
        onSave={() => setEditSuggestionOpen(false)}
      />
    </SafeAreaView>
  );
}

function InventorySection({ styles, palette }: { styles: ReturnType<typeof makeStyles>; palette: Palette }) {
  const rows = [
    { name: 'Riley', topic: 'Different needs around family visits', state: 'Ready for you', active: true, progress: 4 },
    { name: 'Maya', topic: 'Weekend planning tension', state: 'Invitation sent', active: false, progress: 1 },
    { name: 'Sam', topic: 'Feeling heard after arguments', state: 'In progress', active: false, progress: 2 },
  ];

  return (
    <View style={styles.sectionStack}>
      <SectionTitle styles={styles} eyebrow="Inventory" title="Audited mobile surfaces" />
      <View style={styles.inventoryGrid}>
        {[
          'Home',
          'Sidebar open / closed',
          'Conversation row menu',
          'Chat stages',
          'Inputs and indicators',
          'Guided CTAs',
          'Settings',
          'Drawers',
          'Sheets and modals',
          'Loading / empty / waiting',
        ].map((label) => (
          <View key={label} style={styles.inventoryPill}>
            <Check color={palette.accent} size={13} />
            <Text style={styles.inventoryPillText}>{label}</Text>
          </View>
        ))}
      </View>

      <SectionTitle styles={styles} eyebrow="Sidebar" title="Conversation list direction" />
      <View style={styles.conversationPreview}>
        <View style={styles.conversationHeader}>
          <Text style={styles.conversationTitle}>Conversations</Text>
          <View style={styles.searchIcon}>
            <Search color={palette.textFaint} size={16} />
          </View>
        </View>
        {rows.map((row) => (
          <View key={row.name} style={[styles.conversationRow, row.active && styles.conversationRowActive]}>
            <View style={styles.avatarMini}>
              <Text style={styles.avatarMiniText}>{row.name[0]}</Text>
            </View>
            <View style={styles.drawerPreviewCopy}>
              <View style={styles.rowTop}>
                <Text style={styles.drawerPreviewTitle}>{row.name}</Text>
                <Text style={styles.rowTime}>{row.active ? 'now' : '2h'}</Text>
              </View>
              <Text style={styles.drawerPreviewSubtitle} numberOfLines={1}>{row.topic}</Text>
              <View style={styles.rowFoot}>
                <View style={[styles.stateChip, row.active && styles.stateChipReady]}>
                  <View style={styles.stateDot} />
                  <Text style={[styles.stateChipText, row.active && styles.stateChipTextReady]}>
                    {row.state}
                  </Text>
                </View>
                <View style={styles.progressSegments}>
                  {[0, 1, 2, 3].map((index) => (
                    <View
                      key={index}
                      style={[
                        styles.progressSegment,
                        index < row.progress - 1 && styles.progressSegmentDone,
                        index === row.progress - 1 && styles.progressSegmentNow,
                      ]}
                    />
                  ))}
                </View>
              </View>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function PaletteSection({ styles, palette }: { styles: ReturnType<typeof makeStyles>; palette: Palette }) {
  const swatches: Array<[string, string]> = [
    ['bg', palette.bg],
    ['bgElev', palette.bgElev],
    ['bgPane', palette.bgPane],
    ['border', palette.border],
    ['text', palette.text],
    ['muted', palette.textMuted],
    ['faint', palette.textFaint],
    ['accent', palette.accent],
    ['accentSoft', palette.accentSoft],
    ['success', palette.success],
    ['warning', palette.warning],
    ['info', palette.info],
    ['danger', palette.danger],
    ['scrim', palette.scrim],
  ];

  return (
    <View style={styles.sectionStack}>
      <SectionTitle styles={styles} eyebrow="Tokens" title="Theme colors" />
      <View style={styles.swatchGrid}>
        {swatches.map(([name, value]) => (
          <View key={name} style={styles.swatchCard}>
            <View style={[styles.swatch, { backgroundColor: value }]} />
            <Text style={styles.swatchName}>{name}</Text>
            <Text style={styles.swatchValue}>{value}</Text>
          </View>
        ))}
      </View>

      <SectionTitle styles={styles} eyebrow="Type" title="Font scale" />
      <View style={styles.previewPanel}>
        <Text style={styles.serifSample}>A calmer place to have a hard conversation.</Text>
        <Text style={styles.bodySample}>
          Body copy should feel grounded, readable, and consistent across cards, rows, chat, and drawers.
        </Text>
        <Text style={styles.monoSample}>MONO LABEL / CURRENT STATE</Text>
      </View>
    </View>
  );
}

function ChatSection({ styles, palette }: { styles: ReturnType<typeof makeStyles>; palette: Palette }) {
  return (
    <View style={styles.sectionStack}>
      <SectionTitle styles={styles} eyebrow="Header" title="Chat chrome" />
      <View style={styles.devicePanel}>
        <SessionChatHeader
          partnerName="Sam"
          partnerOnline
          conversationTopic="Feeling stuck about household responsibilities"
          leftActionIcon="menu"
          onBackPress={() => {}}
          onPress={() => {}}
        />
        <View style={styles.chatPreview}>
          <ChatIndicator type="stage-chapter" metadata={{ stageName: 'Your Story' }} />
          <ChatBubble
            message={{
              id: 'ai-1',
              role: MessageRole.AI,
              content: "I'm glad you reached out. Tell me more about what's happening.",
              timestamp: new Date().toISOString(),
              skipTypewriter: true,
            }}
            enableTypewriter={false}
          />
          <ChatBubble
            message={{
              id: 'user-1',
              role: MessageRole.USER,
              content: "I feel like I do most of the work and they don't notice.",
              timestamp: new Date().toISOString(),
              skipTypewriter: true,
              status: 'read',
            }}
            enableTypewriter={false}
          />
          <ChatBubble
            message={{
              id: 'context-1',
              role: MessageRole.SHARED_CONTEXT,
              content: "I feel like I'm running on empty and I need someone to see how hard I'm trying.",
              timestamp: new Date().toISOString(),
              skipTypewriter: true,
            }}
            enableTypewriter={false}
            partnerName="Sam"
          />
          <ChatBubble
            message={{
              id: 'share-1',
              role: 'SHARE_SUGGESTION' as MessageRole,
              content: 'I want you to know I am not trying to keep score. I am asking for help before I run out.',
              timestamp: new Date().toISOString(),
              skipTypewriter: true,
            }}
            enableTypewriter={false}
          />
          <ChatIndicator type="reconciler-analyzing" />
          <ChatIndicator type="needs-identified" />
          <ChatIndicator type="empathy-validated" metadata={{ partnerName: 'Sam' }} />
        </View>
        <EmotionSlider value={5} onChange={() => {}} compact />
        <ChatInput onSend={() => {}} />
      </View>
      <View style={styles.noteRow}>
        <Check color={palette.accent} size={16} />
        <Text style={styles.noteText}>User messages, context cards, indicators, slider, and input on one surface.</Text>
      </View>
    </View>
  );
}

function CtaSection({
  styles,
  onOpenShareDrawer,
}: {
  styles: ReturnType<typeof makeStyles>;
  onOpenShareDrawer: () => void;
}) {
  return (
    <View style={styles.sectionStack}>
      <SectionTitle styles={styles} eyebrow="Bottom CTAs" title="Guided action panels" />
      <View style={styles.ctaStack}>
        <GuidedActionPanel
          tone="review"
          eyebrow="Empathy draft"
          title="Ready to review"
          compact
          pressable
          primaryAction={{ label: 'Review what you’ll share', onPress: () => {} }}
        />
        <GuidedActionPanel
          tone="review"
          eyebrow="Revision"
          title="Review the update"
          compact
          pressable
          primaryAction={{ label: 'Review revision', onPress: () => {} }}
        />
        <GuidedActionPanel
          tone="topic"
          eyebrow="Topic frame"
          title="Household chores and feeling unseen"
          compact
          primaryAction={{ label: 'Use this topic', onPress: () => {} }}
        />
        <ShareTopicPanel
          visible
          action="OFFER_SHARING"
          partnerName="Sam"
          onPress={onOpenShareDrawer}
        />
        <FeelHeardConfirmation onConfirm={() => {}} />
        <CompactAgreementBar onSign={() => {}} buttonLabel="Ready" />
        <GuidedActionPanel
          tone="needs"
          eyebrow="Needs review"
          title="Review needs together"
          subtitle="Open both needs lists side by side before continuing."
          primaryAction={{ label: 'Review', onPress: () => {} }}
        />
        <WaitingBanner status="partner-validating-empathy" partnerName="Sam" onExercisePress={() => {}} />
      </View>
    </View>
  );
}

function StateSection({ styles, palette }: { styles: ReturnType<typeof makeStyles>; palette: Palette }) {
  return (
    <View style={styles.sectionStack}>
      <SectionTitle styles={styles} eyebrow="States" title="Empty, loading, blocked, complete" />
      <View style={styles.stateGrid}>
        <View style={styles.stateCard}>
          <ActivityPreview color={palette.info} />
          <Text style={styles.actionTitle}>Loading</Text>
          <Text style={styles.actionSubtitle}>Warm neutral surface, muted progress, no bright spinner chrome.</Text>
        </View>
        <View style={styles.stateCard}>
          <Clock color={palette.textFaint} size={22} />
          <Text style={styles.actionTitle}>Waiting</Text>
          <Text style={styles.actionSubtitle}>Partner status stays calm and readable above the input.</Text>
        </View>
        <View style={styles.stateCard}>
          <X color={palette.danger} size={22} />
          <Text style={styles.actionTitle}>Blocked</Text>
          <Text style={styles.actionSubtitle}>Access and error states use semantic danger without loud fills.</Text>
        </View>
        <View style={styles.stateCard}>
          <Check color={palette.success} size={22} />
          <Text style={styles.actionTitle}>Complete</Text>
          <Text style={styles.actionSubtitle}>Resolved states use success tokens and restrained confirmation copy.</Text>
        </View>
      </View>

      <GuidedActionPanel
        tone="success"
        eyebrow="Resolved"
        title="You have enough for the next step"
        subtitle="The completion state keeps the same typography and CTA rhythm as in-progress panels."
        primaryAction={{ label: 'Continue', onPress: () => {} }}
      />
      <WaitingBanner status="partner-validating-empathy" partnerName="Sam" onExercisePress={() => {}} />
    </View>
  );
}

function ActivityPreview({ color }: { color: string }) {
  return (
    <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: color, opacity: 0.72 }} />
  );
}

function OverlaySection({
  styles,
  palette,
  onOpenBottomSheet,
  onOpenEditSuggestion,
  onOpenShareDrawer,
  onOpenSupport,
  onOpenTranscription,
}: {
  styles: ReturnType<typeof makeStyles>;
  palette: Palette;
  onOpenBottomSheet: () => void;
  onOpenEditSuggestion: () => void;
  onOpenShareDrawer: () => void;
  onOpenSupport: () => void;
  onOpenTranscription: () => void;
}) {
  return (
    <View style={styles.sectionStack}>
      <SectionTitle styles={styles} eyebrow="Tap targets" title="Drawers and sheets" />
      <ActionRow
        styles={styles}
        icon={<PanelRight color={palette.accent} size={18} />}
        title="Share topic drawer"
        subtitle="Full-screen drawer with bottom action stack"
        onPress={onOpenShareDrawer}
      />
      <ActionRow
        styles={styles}
        icon={<PanelBottom color={palette.accent} size={18} />}
        title="Bottom sheet sample"
        subtitle="Scrim, handle, compact content, CTA row"
        onPress={onOpenBottomSheet}
      />
      <ActionRow
        styles={styles}
        icon={<Moon color={palette.accent} size={18} />}
        title="Support options modal"
        subtitle="Stress-state modal and option rows"
        onPress={onOpenSupport}
      />
      <ActionRow
        styles={styles}
        icon={<PanelBottom color={palette.accent} size={18} />}
        title="Transcription drawer"
        subtitle="Voice transcript sheet with recording controls"
        onPress={onOpenTranscription}
      />
      <ActionRow
        styles={styles}
        icon={<PanelRight color={palette.accent} size={18} />}
        title="Edit suggestion modal"
        subtitle="Memory suggestion edit and preview flow"
        onPress={onOpenEditSuggestion}
      />

      <SectionTitle styles={styles} eyebrow="Drawer row" title="Inline drawer preview" />
      <View style={styles.drawerPreview}>
        {['Sent', 'Received', 'Pending'].map((label, index) => (
          <View key={label} style={styles.drawerPreviewRow}>
            <View style={styles.avatarMini}>
              <Text style={styles.avatarMiniText}>{label[0]}</Text>
            </View>
            <View style={styles.drawerPreviewCopy}>
              <Text style={styles.drawerPreviewTitle}>{label} item</Text>
              <Text style={styles.drawerPreviewSubtitle}>
                {index === 0 ? 'Shared empathy statement' : index === 1 ? 'New context from Sam' : 'Review requested'}
              </Text>
            </View>
            <ChevronRight color={palette.textFaint} size={18} />
          </View>
        ))}
      </View>
    </View>
  );
}

function ActionRow({
  styles,
  icon,
  title,
  subtitle,
  onPress,
}: {
  styles: ReturnType<typeof makeStyles>;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.actionRow} onPress={onPress} accessibilityRole="button">
      <View style={styles.actionIcon}>{icon}</View>
      <View style={styles.actionCopy}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionSubtitle}>{subtitle}</Text>
      </View>
      <ChevronRight color={styles.chevronColor.color} size={18} />
    </TouchableOpacity>
  );
}

function BottomSheetPreview({
  visible,
  palette,
  styles,
  onClose,
}: {
  visible: boolean;
  palette: Palette;
  styles: ReturnType<typeof makeStyles>;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.sheetScrim} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetTitle}>Review drawer</Text>
              <Text style={styles.sheetSubtitle}>A compact bottom surface for decisions.</Text>
            </View>
            <TouchableOpacity style={styles.sheetClose} onPress={onClose} accessibilityLabel="Close sheet">
              <X color={palette.textMuted} size={20} />
            </TouchableOpacity>
          </View>
          <View style={styles.previewPanel}>
            <Text style={styles.monoSample}>WHAT YOU'LL SHARE</Text>
            <Text style={styles.bodySample}>
              I can see that you are carrying a lot and still trying to show up.
            </Text>
          </View>
          <View style={styles.sheetActions}>
            <TouchableOpacity style={styles.secondaryButton} onPress={onClose}>
              <Text style={styles.secondaryButtonText}>Refine</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryButton} onPress={onClose}>
              <Text style={styles.primaryButtonText}>Share</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SectionTitle({
  styles,
  eyebrow,
  title,
}: {
  styles: ReturnType<typeof makeStyles>;
  eyebrow: string;
  title: string;
}) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.sectionHeading}>{title}</Text>
    </View>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: palette.bg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
    },
    iconButton: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.chipBg,
    },
    headerCopy: {
      flex: 1,
    },
    title: {
      fontSize: 24,
      lineHeight: 28,
      color: palette.text,
      fontFamily: designFonts.serif,
    },
    subtitle: {
      marginTop: 2,
      fontSize: 12,
      color: palette.textMuted,
      fontFamily: designFonts.sans,
    },
    modeRow: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 16,
      paddingTop: 12,
    },
    modeButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      minHeight: 32,
      borderRadius: 999,
      backgroundColor: palette.chipBg,
      borderWidth: 1,
      borderColor: palette.border,
    },
    modeButtonActive: {
      backgroundColor: palette.accent,
      borderColor: palette.accent,
    },
    modeText: {
      textTransform: 'capitalize',
      fontSize: 12,
      color: palette.textMuted,
      fontFamily: designFonts.sans,
      fontWeight: '700',
    },
    modeTextActive: {
      color: palette.bg,
    },
    segmentRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    segmentButton: {
      flexGrow: 1,
      flexBasis: '30%',
      minHeight: 38,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 10,
      backgroundColor: palette.chipBg,
      borderWidth: 1,
      borderColor: palette.border,
    },
    segmentButtonActive: {
      backgroundColor: palette.bgElev,
      borderColor: palette.borderStrong,
    },
    segmentText: {
      fontSize: 12,
      color: palette.textMuted,
      fontFamily: designFonts.sans,
      fontWeight: '700',
    },
    segmentTextActive: {
      color: palette.text,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      padding: 16,
      paddingBottom: 36,
    },
    sectionStack: {
      gap: 16,
    },
    inventoryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    inventoryPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      minHeight: 32,
      borderRadius: 999,
      backgroundColor: palette.chipBg,
      borderWidth: 1,
      borderColor: palette.border,
    },
    inventoryPillText: {
      color: palette.textMuted,
      fontSize: 12,
      fontFamily: designFonts.sans,
      fontWeight: '700',
    },
    sectionTitle: {
      gap: 4,
    },
    eyebrow: {
      fontSize: 10,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: palette.accent,
      fontFamily: designFonts.mono,
      fontWeight: '700',
    },
    sectionHeading: {
      fontSize: 20,
      lineHeight: 24,
      color: palette.text,
      fontFamily: designFonts.serif,
    },
    swatchGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    swatchCard: {
      width: '31%',
      minWidth: 96,
      backgroundColor: palette.bgElev,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 8,
      padding: 8,
      gap: 6,
    },
    swatch: {
      height: 42,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: palette.border,
    },
    swatchName: {
      fontSize: 12,
      color: palette.text,
      fontFamily: designFonts.sans,
      fontWeight: '700',
    },
    swatchValue: {
      fontSize: 10,
      color: palette.textMuted,
      fontFamily: designFonts.mono,
    },
    previewPanel: {
      backgroundColor: palette.bgElev,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 8,
      padding: 16,
      gap: 8,
    },
    serifSample: {
      fontSize: 28,
      lineHeight: 32,
      color: palette.text,
      fontFamily: designFonts.serif,
    },
    bodySample: {
      fontSize: 14,
      lineHeight: 21,
      color: palette.text,
      fontFamily: designFonts.sans,
    },
    monoSample: {
      fontSize: 10,
      letterSpacing: 0.8,
      color: palette.textMuted,
      fontFamily: designFonts.mono,
      fontWeight: '700',
    },
    devicePanel: {
      overflow: 'hidden',
      borderRadius: 8,
      backgroundColor: palette.bg,
      borderWidth: 1,
      borderColor: palette.border,
    },
    chatPreview: {
      paddingVertical: 10,
    },
    noteRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 12,
      backgroundColor: palette.chipBg,
      borderRadius: 8,
    },
    noteText: {
      flex: 1,
      color: palette.textMuted,
      fontSize: 13,
      lineHeight: 18,
      fontFamily: designFonts.sans,
    },
    ctaStack: {
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 8,
      backgroundColor: palette.bg,
    },
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: 72,
      paddingHorizontal: 14,
      backgroundColor: palette.bgElev,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 8,
    },
    actionIcon: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.chipBg,
    },
    actionCopy: {
      flex: 1,
    },
    actionTitle: {
      fontSize: 15,
      color: palette.text,
      fontFamily: designFonts.sans,
      fontWeight: '700',
    },
    actionSubtitle: {
      marginTop: 3,
      fontSize: 12,
      lineHeight: 17,
      color: palette.textMuted,
      fontFamily: designFonts.sans,
    },
    chevronColor: {
      color: palette.textFaint,
    },
    drawerPreview: {
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 8,
      backgroundColor: palette.bgElev,
    },
    conversationPreview: {
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 8,
      backgroundColor: palette.bgElev,
    },
    conversationHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 14,
      borderBottomWidth: 1,
      borderBottomColor: palette.divider,
    },
    conversationTitle: {
      flex: 1,
      textAlign: 'center',
      fontSize: 24,
      lineHeight: 28,
      color: palette.text,
      fontFamily: designFonts.serif,
    },
    searchIcon: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.chipBg,
    },
    conversationRow: {
      position: 'relative',
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      padding: 12,
      borderBottomWidth: 1,
      borderBottomColor: palette.divider,
    },
    conversationRowActive: {
      backgroundColor: palette.selected,
      borderLeftWidth: 2,
      borderLeftColor: palette.accent,
    },
    rowTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    rowTime: {
      fontSize: 10,
      color: palette.textFaint,
      fontFamily: designFonts.mono,
    },
    rowFoot: {
      marginTop: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    stateChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 8,
      minHeight: 22,
      borderRadius: 999,
      backgroundColor: palette.chipBg,
    },
    stateChipReady: {
      backgroundColor: palette.accentSoft,
    },
    stateChipText: {
      color: palette.textMuted,
      fontSize: 10,
      fontWeight: '700',
      fontFamily: designFonts.sans,
    },
    stateChipTextReady: {
      color: palette.accentText,
    },
    stateDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
      backgroundColor: palette.accent,
    },
    progressSegments: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    progressSegment: {
      width: 12,
      height: 3,
      borderRadius: 2,
      backgroundColor: palette.progressPending,
    },
    progressSegmentDone: {
      backgroundColor: palette.success,
    },
    progressSegmentNow: {
      backgroundColor: palette.accent,
    },
    stateGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    stateCard: {
      width: '48%',
      minWidth: 148,
      minHeight: 142,
      gap: 8,
      padding: 14,
      backgroundColor: palette.bgElev,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 8,
    },
    drawerPreviewRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 14,
      borderBottomWidth: 1,
      borderBottomColor: palette.divider,
    },
    avatarMini: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.accentSoft,
    },
    avatarMiniText: {
      color: palette.accentText,
      fontWeight: '800',
      fontFamily: designFonts.sans,
    },
    drawerPreviewCopy: {
      flex: 1,
    },
    drawerPreviewTitle: {
      fontSize: 14,
      color: palette.text,
      fontFamily: designFonts.sans,
      fontWeight: '700',
    },
    drawerPreviewSubtitle: {
      marginTop: 2,
      fontSize: 12,
      color: palette.textMuted,
      fontFamily: designFonts.sans,
    },
    sheetScrim: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: palette.scrim,
    },
    sheet: {
      ...appWidthStyle,
      backgroundColor: palette.bg,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      padding: 16,
      gap: 14,
      borderTopWidth: 1,
      borderColor: palette.borderStrong,
    },
    sheetHandle: {
      alignSelf: 'center',
      width: 42,
      height: 4,
      borderRadius: 2,
      backgroundColor: palette.borderStrong,
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    sheetTitle: {
      fontSize: 22,
      color: palette.text,
      fontFamily: designFonts.serif,
    },
    sheetSubtitle: {
      marginTop: 3,
      fontSize: 13,
      color: palette.textMuted,
      fontFamily: designFonts.sans,
    },
    sheetClose: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.chipBg,
    },
    sheetActions: {
      flexDirection: 'row',
      gap: 10,
    },
    secondaryButton: {
      flex: 1,
      minHeight: 46,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.bgElev,
      borderWidth: 1,
      borderColor: palette.border,
    },
    secondaryButtonText: {
      color: palette.text,
      fontSize: 14,
      fontWeight: '700',
      fontFamily: designFonts.sans,
    },
    primaryButton: {
      flex: 1,
      minHeight: 46,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.accent,
    },
    primaryButtonText: {
      color: palette.bg,
      fontSize: 14,
      fontWeight: '800',
      fontFamily: designFonts.sans,
    },
  });
