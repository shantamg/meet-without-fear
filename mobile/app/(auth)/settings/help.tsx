/**
 * Help & Support Screen
 *
 * Provides help resources, FAQ, and contact options.
 */

import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Alert,
} from 'react-native';
import { Stack } from 'expo-router';
import {
  HelpCircle,
  MessageCircle,
  Mail,
  BookOpen,
  ChevronRight,
  ExternalLink,
  Heart,
} from 'lucide-react-native';
import { colors } from '@/src/theme';

interface FAQItem {
  question: string;
  answer: string;
}

const faqItems: FAQItem[] = [
  {
    question: 'How does Meet Without Fear work?',
    answer:
      'Meet Without Fear guides you through a structured conflict resolution process using AI-assisted conversations. You can work through conflicts individually or invite others to join collaborative sessions.',
  },
  {
    question: 'Is my data private?',
    answer:
      'Yes, your session data and conversations are encrypted and never shared with third parties. You can export or delete your data at any time from Account Settings.',
  },
  {
    question: 'Can I use this with my partner?',
    answer:
      'Absolutely! You can invite your partner, family members, friends, or colleagues to join sessions. The app will guide both of you through the resolution process.',
  },
  {
    question: 'What if I need professional help?',
    answer:
      'Meet Without Fear is designed to help with everyday conflicts and communication challenges. For serious mental health concerns or domestic issues, we encourage you to seek professional support.',
  },
];

export default function HelpSupportScreen() {
  const handleEmailSupport = () => {
    Linking.openURL('mailto:support@meetwithoutfear.com?subject=Support Request').catch(() => {
      Alert.alert('Error', 'Could not open email app');
    });
  };

  const handleOpenDocs = () => {
    Linking.openURL('https://meetwithoutfear.com/docs').catch(() => {
      Alert.alert('Error', 'Could not open documentation');
    });
  };

  const handleFeedback = () => {
    Linking.openURL('mailto:feedback@meetwithoutfear.com?subject=App Feedback').catch(() => {
      Alert.alert('Error', 'Could not open email app');
    });
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Help & Support',
          headerShown: true,
          headerBackTitle: 'Back',
          headerStyle: {
            backgroundColor: colors.bgPrimary,
          },
          headerTintColor: colors.textPrimary,
          headerTitleStyle: {
            fontWeight: '600',
            color: colors.textPrimary,
          },
        }}
      />

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Welcome Message */}
        <View style={styles.welcomeCard}>
          <HelpCircle color={colors.accent} size={28} />
          <View style={styles.welcomeText}>
            <Text style={styles.welcomeTitle}>How can we help?</Text>
            <Text style={styles.welcomeSubtitle}>
              Find answers to common questions or get in touch with our support team.
            </Text>
          </View>
        </View>

        {/* Contact Options */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact Us</Text>

          <TouchableOpacity style={styles.contactItem} onPress={handleEmailSupport}>
            <View style={styles.contactItemLeft}>
              <View style={styles.iconCircle}>
                <Mail color={colors.textPrimary} size={20} />
              </View>
              <View>
                <Text style={styles.contactItemLabel}>Email Support</Text>
                <Text style={styles.contactItemDescription}>
                  Get help within 24 hours
                </Text>
              </View>
            </View>
            <ChevronRight color={colors.textSecondary} size={20} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.contactItem} onPress={handleOpenDocs}>
            <View style={styles.contactItemLeft}>
              <View style={styles.iconCircle}>
                <BookOpen color={colors.textPrimary} size={20} />
              </View>
              <View>
                <Text style={styles.contactItemLabel}>Documentation</Text>
                <Text style={styles.contactItemDescription}>
                  Browse guides and tutorials
                </Text>
              </View>
            </View>
            <ExternalLink color={colors.textSecondary} size={18} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.contactItem} onPress={handleFeedback}>
            <View style={styles.contactItemLeft}>
              <View style={styles.iconCircle}>
                <MessageCircle color={colors.textPrimary} size={20} />
              </View>
              <View>
                <Text style={styles.contactItemLabel}>Send Feedback</Text>
                <Text style={styles.contactItemDescription}>
                  Help us improve the app
                </Text>
              </View>
            </View>
            <ChevronRight color={colors.textSecondary} size={20} />
          </TouchableOpacity>
        </View>

        {/* FAQ Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>

          {faqItems.map((item, index) => (
            <View key={index} style={styles.faqItem}>
              <Text style={styles.faqQuestion}>{item.question}</Text>
              <Text style={styles.faqAnswer}>{item.answer}</Text>
            </View>
          ))}
        </View>

        {/* Made with Love */}
        <View style={styles.footer}>
          <Heart color={colors.error} size={16} fill={colors.error} />
          <Text style={styles.footerText}>Made with love for better relationships</Text>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPage,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 24,
  },
  welcomeCard: {
    flexDirection: 'row',
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    padding: 16,
    gap: 16,
    alignItems: 'flex-start',
  },
  welcomeText: {
    flex: 1,
  },
  welcomeTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  welcomeSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginLeft: 4,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    padding: 16,
  },
  contactItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contactItemLabel: {
    fontSize: 16,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  contactItemDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  faqItem: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    padding: 16,
  },
  faqQuestion: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  faqAnswer: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingTop: 16,
  },
  footerText: {
    fontSize: 13,
    color: colors.textMuted,
  },
});
