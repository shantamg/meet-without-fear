import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ArrowRight } from 'lucide-react-native';
import { Logo } from '@/src/components';
import { designFonts, useAppAppearance } from '@/src/theme';

const SPLASH_PAIRS = [
  ['Heated', 'Heard'],
  ['Enemy', 'Human'],
  ['Blame', 'Needs'],
  ['Opposition', 'Win-win'],
] as const;

/**
 * Welcome screen - the first screen users see before authentication.
 */
export default function WelcomeScreen() {
  const router = useRouter();
  const { palette } = useAppAppearance();
  const styles = useStyles();

  const handleGetStarted = () => {
    router.push('/(public)/auth-options');
  };

  const handleTerms = () => {
    WebBrowser.openBrowserAsync('https://meetwithoutfear.com/terms').catch(() => {
      Alert.alert('Error', 'Could not open Terms of Service');
    });
  };

  const handlePrivacy = () => {
    WebBrowser.openBrowserAsync('https://meetwithoutfear.com/privacy').catch(() => {
      Alert.alert('Error', 'Could not open Privacy Policy');
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.centerSection}>
        <View style={styles.mark}>
          <Logo size={132} />
          <Text style={styles.wordmark}>meet without fear</Text>
        </View>

        <AnimatedPhrasePair />

        <Text style={styles.subtitle}>
          A quieter way through{'\n'}the conversations that matter most.
        </Text>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.primaryButton} onPress={handleGetStarted}>
          <Text style={styles.primaryButtonText}>Get started</Text>
          <ArrowRight color={palette.bg} size={16} strokeWidth={1.8} />
        </TouchableOpacity>

        <View style={styles.legalLinks}>
          <TouchableOpacity onPress={handleTerms}>
            <Text style={styles.legalText}>Terms of Service</Text>
          </TouchableOpacity>
          <Text style={styles.legalDivider}>·</Text>
          <TouchableOpacity onPress={handlePrivacy}>
            <Text style={styles.legalText}>Privacy Policy</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

function AnimatedPhrasePair() {
  const styles = useStyles();
  const phraseOpacity = useRef(new Animated.Value(1)).current;
  const phraseOffset = useRef(new Animated.Value(0)).current;
  const activeIndexRef = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    let mounted = true;

    const animateNext = () => {
      const nextIndex = (activeIndexRef.current + 1) % SPLASH_PAIRS.length;

      Animated.parallel([
        Animated.timing(phraseOpacity, {
          toValue: 0,
          duration: 300,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(phraseOffset, {
          toValue: -8,
          duration: 300,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (!finished || !mounted) return;
        activeIndexRef.current = nextIndex;
        setActiveIndex(nextIndex);
        phraseOpacity.setValue(0);
        phraseOffset.setValue(10);

        Animated.parallel([
          Animated.timing(phraseOpacity, {
            toValue: 1,
            duration: 460,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(phraseOffset, {
            toValue: 0,
            duration: 460,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]).start();
      });
    };

    const timer = setInterval(animateNext, 2600);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [phraseOffset, phraseOpacity]);

  return (
    <View style={styles.phrasePair}>
      <Animated.View
        style={[
          styles.phraseLayer,
          {
            opacity: phraseOpacity,
            transform: [{ translateY: phraseOffset }],
          },
        ]}
      >
        <PhrasePairRow pair={SPLASH_PAIRS[activeIndex]} />
      </Animated.View>
    </View>
  );
}

function PhrasePairRow({ pair }: { pair: readonly [string, string] }) {
  const styles = useStyles();
  const [phraseA, phraseB] = pair;

  return (
    <View style={styles.phraseRow}>
      <Text style={styles.phraseA}>{phraseA}</Text>
      <Text style={styles.phraseArrow}>→</Text>
      <Text style={styles.phraseB}>{phraseB}</Text>
    </View>
  );
}

const useStyles = () => {
  const { palette } = useAppAppearance();

  return useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: palette.bg,
      paddingTop: 18,
    },
    centerSection: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 28,
      gap: 18,
    },
    mark: {
      alignItems: 'center',
      gap: 14,
      marginBottom: 4,
    },
    wordmark: {
      fontFamily: designFonts.serif,
      fontSize: 24,
      fontStyle: 'italic',
      letterSpacing: 0.1,
      color: palette.text,
    },
    phrasePair: {
      position: 'relative',
      minHeight: 56,
      width: '100%',
      marginTop: 14,
      marginBottom: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    phraseLayer: {
      position: 'absolute',
      inset: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    phraseRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 18,
    },
    phraseA: {
      fontFamily: designFonts.serif,
      fontSize: 38,
      lineHeight: 42,
      fontStyle: 'italic',
      color: palette.textMuted,
    },
    phraseArrow: {
      fontFamily: designFonts.serif,
      fontSize: 26,
      lineHeight: 30,
      color: palette.accent,
      marginTop: -2,
    },
    phraseB: {
      fontFamily: designFonts.serif,
      fontSize: 38,
      lineHeight: 42,
      color: palette.text,
    },
    subtitle: {
      fontSize: 16,
      lineHeight: 24,
      color: palette.textMuted,
      textAlign: 'center',
      maxWidth: 300,
    },
    footer: {
      paddingHorizontal: 22,
      paddingBottom: 28,
      alignItems: 'center',
      gap: 24,
    },
    primaryButton: {
      width: '100%',
      minHeight: 54,
      borderRadius: 999,
      backgroundColor: palette.accent,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 18,
      paddingVertical: 16,
    },
    primaryButtonText: {
      color: palette.bg,
      fontSize: 15,
      fontWeight: '500',
    },
    legalLinks: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
    },
    legalText: {
      color: palette.textFaint,
      fontFamily: designFonts.mono,
      fontSize: 10,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    legalDivider: {
      color: palette.textFaint,
      fontFamily: designFonts.mono,
      fontSize: 10,
      opacity: 0.6,
    },
  }), [palette]);
};
