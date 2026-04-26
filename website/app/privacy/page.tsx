import Link from "next/link";
import Image from "next/image";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen">
      {/* Gradient Top Bar */}
      <div className="h-1 bg-gradient-top" />

      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/90 backdrop-blur-lg border-b border-border">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.svg" alt="Meet Without Fear" width={48} height={40} />
            <span className="hidden min-[430px]:inline text-xl font-bold text-white">meet</span>
            <span className="hidden min-[430px]:inline text-xl font-bold text-brand-cyan">without fear</span>
          </Link>
        </div>
      </header>

      {/* Content */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-6 max-w-3xl">
          <h1 className="text-4xl font-bold mb-2">Privacy Policy</h1>
          <p className="text-muted-foreground mb-12">Last updated: April 19, 2026</p>

          <div className="space-y-8 text-foreground/90 leading-relaxed">
            <section>
              <h2 className="text-xl font-semibold mb-3">1. Information We Collect</h2>
              <p className="text-muted-foreground mb-3">
                We collect information you provide directly when creating an account and using the
                Service, including your name, email address, and session conversation data.
              </p>
              <p className="text-muted-foreground">
                We also collect anonymous usage analytics to improve the Service, which you can
                opt out of in your app settings.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">2. How We Use Your Information</h2>
              <p className="text-muted-foreground">
                Your information is used solely to provide and improve the Meet Without Fear
                Service. This includes facilitating conflict resolution sessions, personalizing
                your experience, and maintaining your conversation history.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">3. Data Encryption &amp; Security</h2>
              <p className="text-muted-foreground">
                Your session data and conversations are encrypted in transit and at rest. We
                implement industry-standard security measures to protect your personal information
                from unauthorized access, alteration, or disclosure.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">4. Data Sharing</h2>
              <p className="text-muted-foreground">
                We do not sell, trade, or share your personal data or conversation content with
                third parties. Session data is never used to train AI models. We may share
                anonymized, aggregated data for research purposes only.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">5. Session Privacy</h2>
              <p className="text-muted-foreground">
                In collaborative sessions, each participant&apos;s individual reflections remain
                private. Only shared messages sent through the resolution process are visible to
                other participants.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">6. Data Retention &amp; Deletion</h2>
              <p className="text-muted-foreground">
                You can export or delete your data at any time from your Account Settings.
                When you delete your account, all associated data is permanently removed from
                our systems within 30 days.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">7. Cookies &amp; Analytics</h2>
              <p className="text-muted-foreground">
                Our website uses essential cookies for authentication and analytics cookies
                (Mixpanel) to understand how users interact with the Service. You can disable
                analytics sharing in your app privacy settings.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">8. Children&apos;s Privacy</h2>
              <p className="text-muted-foreground">
                The Service is not intended for children under 13. We do not knowingly collect
                personal information from children under 13. If we discover such data has been
                collected, we will delete it promptly.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">9. Changes to This Policy</h2>
              <p className="text-muted-foreground">
                We may update this Privacy Policy from time to time. We will notify users of
                significant changes through the app or via email. Your continued use of the
                Service after changes constitutes acceptance of the updated policy.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">10. Contact</h2>
              <p className="text-muted-foreground">
                If you have questions about this Privacy Policy, please contact us at{" "}
                <a
                  href="mailto:support@meetwithoutfear.com"
                  className="text-brand-cyan hover:underline"
                >
                  support@meetwithoutfear.com
                </a>
                .
              </p>
            </section>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border">
        <div className="container mx-auto px-6 text-center text-muted-foreground text-sm">
          <div className="flex justify-center gap-6 mb-4">
            <Link href="/terms" className="hover:text-foreground transition-colors">
              Terms of Service
            </Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              Privacy Policy
            </Link>
          </div>
          <p>&copy; {new Date().getFullYear()} Meet Without Fear. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}
