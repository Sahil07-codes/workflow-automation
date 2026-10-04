export type PageGroup = "public" | "auth" | "onboarding" | "app" | "settings" | "phase2";

export interface PageDefinition {
  path: string;
  title: string;
  description: string;
  group: PageGroup;
  resource: string;
  eyebrow?: string;
  legal?: boolean;
}

export const pages: PageDefinition[] = [
  { path: "/", title: "A more thoughtful job search", description: "Make your next move with clarity and control.", group: "public", resource: "" },
  { path: "/signup", title: "Create your account", description: "Start with your email address. We’ll verify it before asking for anything else.", group: "auth", resource: "/auth/signup" },
  { path: "/signup/verify-email", title: "Verify your email", description: "Enter the verification code sent to your email address.", group: "auth", resource: "/auth/verify-email" },
  { path: "/signup/mobile", title: "Add your mobile number", description: "Your email is verified. Add a mobile number for the second verification step.", group: "auth", resource: "/auth/signup/mobile" },
  { path: "/signup/verify-mobile", title: "Verify your mobile", description: "Confirm your mobile number to secure your account.", group: "auth", resource: "/auth/verify-mobile" },
  { path: "/signup/credentials", title: "Create a password", description: "Verify both contact methods before creating your login password.", group: "auth", resource: "/auth/signup/credentials" },
  { path: "/auth/google/callback", title: "Connecting your account", description: "We’re checking your sign-in and account status.", group: "auth", resource: "/auth/google/callback" },
  { path: "/signup/complete", title: "Account verification", description: "Your account status is checked before onboarding begins.", group: "auth", resource: "/auth/verification-status" },
  { path: "/login", title: "Welcome back", description: "Sign in to continue your job search.", group: "auth", resource: "/auth/login" },
  { path: "/onboarding", title: "Your profile setup", description: "Move through each step at your own pace. Your progress is saved by your account.", group: "onboarding", resource: "/onboarding" },
  { path: "/onboarding/contact", title: "Basic details", description: "Tell us the name and location you want associated with your profile.", group: "onboarding", resource: "/profile" },
  { path: "/onboarding/professional", title: "Professional background", description: "Choose the path that best describes you and add your relevant background.", group: "onboarding", resource: "/profile" },
  { path: "/onboarding/preferences", title: "Preferences & skills", description: "Tell us what roles, locations, work arrangements, and skills matter to you.", group: "onboarding", resource: "/preferences" },
  { path: "/onboarding/privacy", title: "Privacy & visibility", description: "Choose how your profile may be used and who can discover it.", group: "onboarding", resource: "/profile" },
  { path: "/onboarding/review", title: "Review your profile", description: "Check your details and visibility choice before confirming your profile.", group: "onboarding", resource: "/profile" },
  { path: "/app/dashboard", title: "Dashboard", description: "A clear view of what needs your attention and what happens next.", group: "app", resource: "/dashboard" },
  { path: "/app/jobs", title: "Discover jobs", description: "Explore opportunities using the job data available to your account.", group: "app", resource: "/jobs" },
  { path: "/app/jobs/submit", title: "Submit job links", description: "Send public job postings for processing and review their status.", group: "app", resource: "/jobs/links" },
  { path: "/app/jobs/:id", title: "Job details", description: "Review the role and its match details.", group: "app", resource: "/jobs/:id" },
  { path: "/app/applications", title: "Applications", description: "Track every application through its current state.", group: "app", resource: "/applications" },
  { path: "/app/applications/approval", title: "Review applications", description: "Review eligible applications before approving any action.", group: "app", resource: "/applications" },
  { path: "/app/applications/:id/approval", title: "Review before applying", description: "Nothing is submitted until you review and approve it.", group: "app", resource: "/applications/:id" },
  { path: "/app/applications/:id/preparing", title: "Preparing application", description: "Preparation state is reported by the application service.", group: "app", resource: "/applications/:id" },
  { path: "/app/applications/:id/answer", title: "Your input is needed", description: "We won’t guess. Review the question and provide your answer.", group: "app", resource: "/applications/:id" },
  { path: "/app/applications/:id/manual-assist", title: "Manual assistance", description: "Automation paused. Review the next step provided by the application service.", group: "app", resource: "/applications/:id" },
  { path: "/app/applications/:id", title: "Application details", description: "Review the current state, activity, and next action.", group: "app", resource: "/applications/:id" },
  { path: "/app/profile", title: "Profile", description: "Manage the profile information used to prepare applications.", group: "settings", resource: "/profile" },
  { path: "/app/resume", title: "Resume", description: "Manage your resume and review its processing status.", group: "settings", resource: "/resume" },
  { path: "/app/preferences", title: "Job preferences", description: "Manage the preferences used to find relevant roles.", group: "settings", resource: "/preferences" },
  { path: "/app/answer-bank", title: "Answer bank", description: "Review saved answers and decide when they can be reused.", group: "settings", resource: "/answer-bank" },
  { path: "/app/notifications", title: "Notifications", description: "See account updates and actions that may need your attention.", group: "settings", resource: "/notifications" },
  { path: "/app/billing", title: "Subscription", description: "Manage your plan, payment status, invoices, and account entitlements.", group: "settings", resource: "/billing" },
  { path: "/app/referrals", title: "Referrals", description: "Review referral details and qualification status.", group: "settings", resource: "/referrals" },
  { path: "/app/settings", title: "Settings", description: "Manage your profile, job preferences, saved answers, subscription, and referrals.", group: "settings", resource: "/settings" },
  { path: "/app/settings/security", title: "Security & sessions", description: "Review the security controls available for your account.", group: "settings", resource: "/settings/security" },
  { path: "/app/settings/privacy", title: "Privacy & data", description: "Review data controls and available privacy actions.", group: "settings", resource: "/settings/privacy" },
  { path: "/privacy", title: "Privacy", description: "Privacy information supplied by the product team.", group: "public", resource: "/legal/privacy", legal: true },
  { path: "/terms", title: "Terms", description: "Terms supplied by the product’s approved legal source.", group: "public", resource: "/legal/terms", legal: true },
  { path: "/refunds", title: "Refunds", description: "Refund information supplied by the product’s approved legal source.", group: "public", resource: "/legal/refunds", legal: true },
  { path: "/r/:code", title: "You’ve been invited", description: "Continue to sign up. Referral qualification is confirmed later.", group: "public", resource: "" },
  { path: "/a/:token", title: "Application review", description: "Approval links are validated by the server before details are shown.", group: "public", resource: "/approvals/link" },
  { path: "/app/settings/connected-accounts", title: "Connected accounts", description: "Review connected account status without exposing credentials.", group: "phase2", resource: "/connected-accounts" },
  { path: "/app/settings/connected-accounts/:id/consent", title: "Review account consent", description: "Understand the requested access and risks before consenting.", group: "phase2", resource: "/connected-accounts/:id/consent" },
  { path: "/app/resume/tailored", title: "Tailor a resume", description: "Create a role-specific resume using only verified profile facts.", group: "phase2", resource: "/resumes/tailored" },
  { path: "/app/resume/tailored/:id", title: "Resume preview", description: "Review the generated resume and its source profile.", group: "phase2", resource: "/resumes/tailored/:id" },
  { path: "/app/settings/connected-accounts/dummy-mode", title: "Experimental account mode", description: "This experimental capability is disabled unless enabled by the service.", group: "phase2", resource: "/connected-accounts/dummy-mode" },
];

export const navigation = [
  {
    label: "Workspace",
    links: [
      { label: "Dashboard", to: "/app/dashboard", icon: "dashboard" },
      { label: "Discover jobs", to: "/app/jobs", icon: "search" },
      { label: "Add job links", to: "/app/jobs/submit", icon: "link" },
      { label: "Applications", to: "/app/applications", icon: "briefcase" },
      { label: "Profile", to: "/app/profile", icon: "user" },
    ],
  },
  {
    label: "Manage",
    links: [
      { label: "Preferences", to: "/app/preferences", icon: "sliders" },
      { label: "Answer bank", to: "/app/answer-bank", icon: "message" },
      { label: "Resume", to: "/app/resume", icon: "file" },
      { label: "Notifications", to: "/app/notifications", icon: "message" },
    ],
  },
  {
    label: "Account",
    links: [
      { label: "Subscription", to: "/app/billing", icon: "billing" },
      { label: "Referrals", to: "/app/referrals", icon: "referrals" },
    ],
  },
];

export const onboardingSteps = [
  { label: "Basic details", to: "/onboarding/contact" },
  { label: "Background", to: "/onboarding/professional" },
  { label: "Preferences & skills", to: "/onboarding/preferences" },
  { label: "Privacy", to: "/onboarding/privacy" },
  { label: "Review", to: "/onboarding/review" },
];
