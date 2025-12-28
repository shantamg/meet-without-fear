import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FileText, MessageSquare, Heart, Target, Lightbulb, Share2, ChevronRight } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSession } from '@/src/hooks/useSessions';
import { useProgress } from '@/src/hooks/useStages';
import { createStyles } from '@/src/theme/styled';
import { Stage, STAGE_NAMES } from '@be-heard/shared';

type StageConfig = {
  id: string;
  title: string;
  description: string;
  stage: Stage;
  route: string;
  icon: typeof FileText;
};

/**
 * Session dashboard screen
 * Overview of session with navigation to different stages
 */
export default function SessionDashboardScreen() {
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { data: sessionData, isLoading } = useSession(id);
  const { data: progressData } = useProgress(id);

  const session = sessionData?.session;
  const currentStage = progressData?.myProgress.stage ?? session?.myProgress.stage ?? Stage.ONBOARDING;

  const stages: StageConfig[] = [
    {
      id: 'onboarding',
      icon: FileText,
      title: 'Curiosity Compact',
      description: 'Agree to the compact before you begin',
      stage: Stage.ONBOARDING,
      route: 'onboarding',
    },
    {
      id: 'witness',
      icon: MessageSquare,
      title: 'The Witness',
      description: 'Private AI space to get everything out',
      stage: Stage.WITNESS,
      route: 'witness',
    },
    {
      id: 'perspective',
      icon: Heart,
      title: 'Perspective Stretch',
      description: 'Draft and share understanding of your partner',
      stage: Stage.PERSPECTIVE_STRETCH,
      route: 'perspective',
    },
    {
      id: 'needs',
      icon: Target,
      title: 'Need Mapping',
      description: 'Confirm needs and find common ground',
      stage: Stage.NEED_MAPPING,
      route: 'needs',
    },
    {
      id: 'strategies',
      icon: Lightbulb,
      title: 'Strategic Repair',
      description: 'Co-design experiments and follow-ups',
      stage: Stage.STRATEGIC_REPAIR,
      route: 'strategies',
    },
  ];

  const handleStagePress = (route: string, targetStage: Stage) => {
    if (!id) return;
    // Allow current or completed stages; gate future ones visually
    if (targetStage > currentStage + 1) return;
    router.push(`/session/${id}/${route}`);
  };

  const handleInvite = () => {
    // TODO: Implement invite flow
  };

  if (isLoading || !session) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={styles.accentColor.color} />
          <Text style={styles.loadingText}>Loading session…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Session header */}
        <View style={styles.header}>
          <Text style={styles.title}>{session.partner?.name || 'Your Session'}</Text>
          <Text style={styles.subtitle}>{STAGE_NAMES[currentStage]}</Text>
          <Text style={styles.description}>
            A safe lane to be heard first, then move together through the stages.
          </Text>
          {session.partner?.name && (
            <View style={styles.personBadge}>
              <Text style={styles.personLabel}>Partner</Text>
              <Text style={styles.personName}>{session.partner.name}</Text>
            </View>
          )}
        </View>

        {/* Session stages */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Session Stages</Text>
          <View style={styles.stagesContainer}>
            {stages.map((stage) => {
              const isActive = currentStage >= stage.stage;
              const isCurrent = currentStage === stage.stage;
              const isLocked = stage.stage > currentStage + 1;
              return (
                <TouchableOpacity
                  key={stage.id}
                  style={[
                    styles.stageCard,
                    isActive && styles.stageCardActive,
                    isCurrent && styles.stageCardCurrent,
                    isLocked && styles.stageCardLocked,
                  ]}
                  onPress={() => handleStagePress(stage.route, stage.stage)}
                  disabled={isLocked}
                >
                  <View style={[styles.stageIcon, isActive && styles.stageIconActive]}>
                    <stage.icon color={isActive ? styles.iconActive.color : styles.iconMuted.color} size={22} />
                  </View>
                  <View style={styles.stageContent}>
                    <Text style={[styles.stageTitle, isActive && styles.stageTitleActive]}>
                      {stage.title}
                    </Text>
                    <Text style={styles.stageDescription}>{stage.description}</Text>
                  </View>
                  <ChevronRight color={isActive ? styles.iconActive.color : styles.iconMuted.color} size={20} />
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Actions */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.inviteButton} onPress={handleInvite}>
            <Share2 color={styles.inviteText.color} size={20} />
            <Text style={styles.inviteText}>Invite Someone to Listen</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = () =>
  createStyles((t) => ({
    container: {
      flex: 1,
      backgroundColor: t.colors.bgPrimary,
    },
    scrollView: {
      flex: 1,
    },
    content: {
      padding: t.spacing.lg,
      gap: t.spacing['2xl'],
    },
    header: {
      backgroundColor: t.colors.bgSecondary,
      borderRadius: 14,
      padding: t.spacing.lg,
      gap: t.spacing.sm,
      borderWidth: 1,
      borderColor: t.colors.border,
    },
    title: {
      fontSize: 22,
      fontWeight: '700',
      color: t.colors.textPrimary,
    },
    subtitle: {
      fontSize: 16,
      color: t.colors.textSecondary,
    },
    description: {
      fontSize: 14,
      color: t.colors.textSecondary,
      lineHeight: 20,
    },
    personBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.sm,
      marginTop: t.spacing.sm,
      paddingTop: t.spacing.sm,
      borderTopWidth: 1,
      borderTopColor: t.colors.border,
    },
    personLabel: {
      fontSize: 14,
      color: t.colors.textMuted,
    },
    personName: {
      fontSize: 14,
      fontWeight: '600',
      color: t.colors.textPrimary,
    },
    section: {
      gap: t.spacing.sm,
    },
    sectionTitle: {
      fontSize: 17,
      fontWeight: '600',
      color: t.colors.textPrimary,
    },
    stagesContainer: {
      gap: t.spacing.sm,
    },
    stageCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.colors.bgSecondary,
      borderRadius: 12,
      padding: t.spacing.lg,
      gap: t.spacing.md,
      borderWidth: 1,
      borderColor: t.colors.border,
      opacity: 0.7,
    },
    stageCardActive: {
      opacity: 1,
    },
    stageCardCurrent: {
      borderColor: t.colors.accent,
    },
    stageCardLocked: {
      opacity: 0.5,
    },
    stageIcon: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: t.colors.bgPrimary,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: t.colors.border,
    },
    stageIconActive: {
      borderColor: t.colors.accent,
    },
    stageContent: {
      flex: 1,
    },
    stageTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: t.colors.textMuted,
    },
    stageTitleActive: {
      color: t.colors.textPrimary,
    },
    stageDescription: {
      fontSize: 14,
      color: t.colors.textSecondary,
      marginTop: 2,
    },
    inviteButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.colors.bgSecondary,
      borderRadius: 12,
      padding: t.spacing.lg,
      gap: t.spacing.sm,
      borderWidth: 1,
      borderColor: t.colors.border,
    },
    inviteText: {
      color: t.colors.textPrimary,
      fontSize: 16,
      fontWeight: '600',
    },
    loading: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: t.spacing.md,
    },
    loadingText: {
      color: t.colors.textSecondary,
    },
    iconActive: {
      color: t.colors.accent,
    },
    iconMuted: {
      color: t.colors.textMuted,
    },
    accentColor: {
      color: t.colors.accent,
    },
  }));
