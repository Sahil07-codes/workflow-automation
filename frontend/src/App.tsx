import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, BriefcaseBusiness, CalendarDays, Check, ChevronDown,
  CircleHelp, Clock3, Copy, CreditCard, ExternalLink, FileText, FolderKanban, Gauge, Gift, Globe2, HeartHandshake, Home, LockKeyhole,
  Link2, Menu, MessageSquareText, MoreHorizontal, Receipt, Search, Settings2, ShieldCheck, SlidersHorizontal,
  Sparkles, UserRound, X,
} from "lucide-react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { navigation, onboardingSteps, pages, type PageDefinition, type PageGroup } from "./data/pages";
import { ApiError, apiRequest, getDisplayableData, isApiConfigured, isRecord, resourceUrl } from "./lib/api";
import { signupApi } from "./lib/auth";

const iconByName = {
  dashboard: Gauge,
  search: Search,
  link: Link2,
  briefcase: BriefcaseBusiness,
  billing: CreditCard,
  referrals: HeartHandshake,
  user: UserRound,
  file: FileText,
  sliders: SlidersHorizontal,
  message: MessageSquareText,
};

export default function App() {
  return (
    <Routes>
      {pages.map((page) => (
        <Route key={page.path} path={page.path} element={<PageRoute page={page} />} />
      ))}
      <Route path="/onboarding/resume" element={<Navigate to="/onboarding/contact" replace />} />
      <Route path="/onboarding/resume/processing" element={<Navigate to="/onboarding/contact" replace />} />
      <Route path="/onboarding/extraction" element={<Navigate to="/onboarding/professional" replace />} />
      <Route path="/onboarding/missing-information" element={<Navigate to="/onboarding/preferences" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function PageRoute({ page }: { page: PageDefinition }) {
  if (page.group === "public" && page.path === "/") return <LandingPage />;
  if (page.path === "/r/:code") return <ReferralRedirectPage />;
  if (page.path === "/onboarding") return <Navigate to="/onboarding/contact" replace />;
  if (page.path === "/signup/mobile" || page.path === "/signup/credentials") return <Navigate to="/signup" replace />;
  if (page.path === "/signup/complete" || page.path === "/auth/google/callback") return <Navigate to="/login" replace />;
  if (page.path === "/app/applications/approval") return <Navigate to="/app/applications?state=AWAITING_APPROVAL" replace />;
  if (page.path.startsWith("/app/settings/security") || page.path === "/app/settings/privacy" ||
      page.path.startsWith("/app/settings/connected-accounts") || page.path.startsWith("/app/resume/tailored")) {
    return <Navigate to="/app/settings" replace />;
  }
  if (["/signup", "/signup/verify-email", "/signup/mobile", "/signup/verify-mobile", "/signup/credentials"].includes(page.path)) {
    return <AuthOverlay page={page}><SignupFlowPage page={page} /></AuthOverlay>;
  }
  if (page.group === "auth") return <AuthOverlay page={page}><AuthPage page={page} /></AuthOverlay>;
  if (page.legal) return <LegalPage page={page} />;
  if (page.group === "public") return <PublicEntryPage page={page} />;
  if (page.path === "/app/jobs/submit") {
    return <ProductLayout page={page}><JobLinkSubmissionPage /></ProductLayout>;
  }
  if (page.path === "/app/resume") {
    return <ProductLayout page={page}><ResumePage /></ProductLayout>;
  }
  if (page.path === "/app/notifications") {
    return <ProductLayout page={page}><NotificationsPage /></ProductLayout>;
  }
  if (page.path === "/app/referrals") {
    return <ProductLayout page={page}><ReferralPage /></ProductLayout>;
  }
  if (page.path === "/app/billing") {
    return <ProductLayout page={page}><BillingPage /></ProductLayout>;
  }
  if (page.path === "/app/settings") {
    return <ProductLayout page={page}><SettingsHub /></ProductLayout>;
  }
  return (
    <ProductLayout page={page}>
      {page.group === "onboarding" ? <OnboardingPage key={page.path} page={page} /> : <ProductPage page={page} />}
    </ProductLayout>
  );
}

function ReferralRedirectPage() {
  const { code } = useParams();
  return <Navigate to={code ? `/signup?ref=${encodeURIComponent(code)}` : "/signup"} replace />;
}

function AuthOverlay({ page, children }: { page: PageDefinition; children: React.ReactNode }) {
  const navigate = useNavigate();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") navigate("/");
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);

  return (
    <>
      <div className="auth-backdrop" aria-hidden="true"><LandingPage /></div>
      <div className="auth-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) navigate("/"); }}>
        <section className="auth-dialog" role="dialog" aria-modal="true" aria-label={page.title}>
          <header className="auth-dialog-header">
            <Link className="brand" to="/" aria-label="AutoApply home"><span className="brand-symbol"><Sparkles size={16} /></span><span>autoapply</span></Link>
            <button className="auth-dialog-close" type="button" aria-label="Close dialog" onClick={() => navigate("/")}><X size={18} /></button>
          </header>
          {children}
        </section>
      </div>
    </>
  );
}

const signupSteps = [
  { path: "/signup", label: "Account details" },
  { path: "/signup/verify-email", label: "Verify email" },
  { path: "/signup/verify-mobile", label: "Verify mobile" },
];

function SignupFlowPage({ page }: { page: PageDefinition }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [maskedDestination, setMaskedDestination] = useState("");
  const location = useLocation();
  const stepIndex = signupSteps.findIndex((step) => step.path === page.path);
  const isEmailStart = page.path === "/signup";
  const isEmailVerify = page.path === "/signup/verify-email";
  const isMobileVerify = page.path === "/signup/verify-mobile";
  const routeState = isRecord(location.state) ? location.state : null;
  const targetEmail = routeState && typeof routeState.targetEmail === "string" ? routeState.targetEmail : "";
  const targetMobile = routeState && typeof routeState.targetMobile === "string" ? routeState.targetMobile : "";
  const title = isEmailStart ? "Create your account" : isEmailVerify ? "Verify your email" : "Verify your mobile";
  const description = isEmailStart ? "Create an account with your email, mobile number, and password. We’ll verify both contact methods." :
    isEmailVerify ? "Enter the six-digit code sent to your email address." :
      "Enter the six-digit code sent to your mobile number.";
  const destinationFromRoute = routeState && typeof routeState.maskedDestination === "string" ? routeState.maskedDestination : "";
  const shownDestination = maskedDestination || destinationFromRoute;
  const verificationState = routeState && typeof routeState.status === "string" ? routeState.status.toUpperCase() : "";
  const blocked = ["LOCKED", "RATE_LIMITED", "ATTEMPTS_EXCEEDED"].includes(verificationState);
  const expired = verificationState === "EXPIRED";

  useEffect(() => {
    if (destinationFromRoute) setMaskedDestination(destinationFromRoute);
    if (routeState && typeof routeState.retryAfterSeconds === "number" && Number.isFinite(routeState.retryAfterSeconds)) {
      setCooldown(Math.max(0, Math.floor(routeState.retryAfterSeconds)));
    }
  }, [destinationFromRoute, routeState]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((remaining) => Math.max(remaining - 1, 0)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown > 0]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    if (page.path === "/signup/mobile" || page.path === "/signup/credentials") {
      navigate("/signup", { replace: true });
      return;
    }
    event.preventDefault();
    setError("");
    setNotice("");
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    if ((isEmailVerify || isMobileVerify) && !/^\d{6}$/.test(String(values.code ?? ""))) {
      setError("Enter the six-digit code to continue.");
      return;
    }
    if (isEmailStart && values.password !== values.confirmPassword) {
      setError("Those passwords don’t match.");
      return;
    }
    const target = isEmailVerify ? targetEmail : targetMobile;
    if (!isEmailStart && !target) {
      setError("Your signup details are missing. Start signup again to request new verification codes.");
      navigate("/signup", { replace: true });
      return;
    }
    const requestValues = isEmailStart
      ? {
          email: values.email,
          phone_e164: values.phone_e164,
          password: values.password,
          consent_version: "v1",
          ...(searchParams.get("ref") ? { referral_code: searchParams.get("ref") } : {}),
        }
      : { target, code: values.code };
    setBusy(true);
    try {
      await apiRequest<unknown>(isEmailStart ? signupApi.signup : signupApi.verifyCode, {
        method: "POST",
        body: JSON.stringify(requestValues),
      });
      if (isEmailStart) {
        navigate("/signup/verify-email", {
          state: { targetEmail: String(values.email), targetMobile: String(values.phone_e164) },
        });
      } else if (isEmailVerify) {
        navigate("/signup/verify-mobile", {
          state: { targetEmail, targetMobile },
        });
      } else {
        navigate("/login", {
          state: {
            email: targetEmail,
            returnTo: "/onboarding/contact",
          },
        });
      }
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError("");
    setNotice("");
    setResendBusy(true);
    try {
      await apiRequest<unknown>(signupApi.sendCode, {
        method: "POST",
        body: JSON.stringify({
          target: isEmailVerify ? targetEmail : targetMobile,
          channel: isEmailVerify ? "EMAIL" : "SMS",
        }),
      });
      setCooldown(60);
      setNotice("A new code was requested. Use the most recent code sent by the service.");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setResendBusy(false);
    }
  }

  const verificationPage = isEmailVerify || isMobileVerify;

  return (
    <div className="auth-page">
      <div className="auth-top"><Link className="brand" to="/"><span className="brand-symbol"><Sparkles size={17} /></span><span>autoapply</span></Link><Link to="/" className="back-home"><ArrowLeft size={15} /> Back to home</Link></div>
      <main id="main-content" className="auth-main">
        <div className="auth-card signup-flow-card">
          <div className="auth-brand-mark"><span>{verificationPage ? <ShieldCheck size={21} /> : <UserRound size={20} />}</span></div>
          <span className="eyebrow">Account setup · Step {stepIndex + 1} of {signupSteps.length}</span>
          <h1>{title}</h1><p className="auth-description">{description}</p>
          <div className="signup-progress" aria-label={`Step ${stepIndex + 1} of ${signupSteps.length}`}>
            {signupSteps.map((step, index) => <span key={step.path} className={index <= stepIndex ? "active" : ""} />)}
          </div>
          {isEmailStart && searchParams.get("ref") && <div className="masked-destination">Referral code: <strong>{searchParams.get("ref")}</strong></div>}
          {verificationPage && shownDestination && <div className="masked-destination signup-destination">Code sent to <strong>{shownDestination}</strong></div>}
          {blocked && <div className="callout callout-amber"><LockKeyhole size={16} /><p>Verification is temporarily unavailable. Please follow the recovery options from your account service.</p></div>}
          {expired && <div className="callout callout-amber"><Clock3 size={16} /><p>This code has expired. Request a new one to continue.</p></div>}
          <form className="auth-form" onSubmit={(event) => void submit(event)}>
            {isEmailStart && <><div className="field-row"><label htmlFor="signup-email">Email address</label><input id="signup-email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></div><div className="field-row"><label htmlFor="signup-mobile">Mobile number</label><input id="signup-mobile" name="phone_e164" type="tel" autoComplete="tel" pattern="\+[1-9][0-9]{7,14}" placeholder="+919876543210" required /><small className="field-hint">Use international format including the country code.</small></div><div className="field-row"><label htmlFor="signup-password">Password</label><input id="signup-password" name="password" type="password" autoComplete="new-password" minLength={8} required /></div><div className="field-row"><label htmlFor="signup-confirm-password">Confirm password</label><input id="signup-confirm-password" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required /></div><label className="checkbox-field"><input type="checkbox" name="consent" required /><span>I agree to the applicable AutoApply terms and privacy policy.</span></label></>}
            {isEmailVerify && <><label htmlFor="signup-email-code">Email verification code</label><input id="signup-email-code" name="code" className="otp-input" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="••••••" required disabled={blocked || expired} /><small className="field-hint">Enter the six-digit code from your email. For your security, codes are never shown here.</small></>}
            {isMobileVerify && <><label htmlFor="signup-mobile-code">Mobile verification code</label><input id="signup-mobile-code" name="code" className="otp-input" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="••••••" required disabled={blocked || expired} /><small className="field-hint">Enter the six-digit code sent to your mobile number.</small></>}
            {error && <ErrorBanner message={error} />}
            {notice && <div className="inline-notice" role="status"><Check size={16} />{notice}</div>}
            <button className="button button-primary full-width" type="submit" disabled={!isApiConfigured || busy || blocked || expired}>
              {busy ? <><span className="spinner" /> Processing…</> : <>{isEmailStart ? "Create account and send codes" : isEmailVerify ? "Verify email" : "Verify mobile"} <ArrowRight size={16} /></>}
            </button>
            {!isApiConfigured && <p className="form-contract-note">Connect the authentication service to enable account setup.</p>}
          </form>
          {verificationPage && <div className="auth-recovery"><button type="button" onClick={() => void resend()} disabled={!isApiConfigured || resendBusy || cooldown > 0 || blocked}>{resendBusy ? "Sending…" : cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}</button><span>·</span><Link to="/signup">Start over</Link></div>}
          <div className="auth-switch">{isEmailStart ? <>Already have an account? <Link to="/login">Sign in</Link></> : <>Already have an account? <Link to="/login">Sign in</Link></>}</div>
        </div>
        <p className="auth-privacy"><LockKeyhole size={13} /> Verification codes are processed by the connected authentication service.</p>
      </main>
      <footer className="auth-footer"><span>© AutoApply</span><div><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/refunds">Refunds</Link></div></footer>
    </div>
  );
}

function ProductLayout({ page, children }: { page: PageDefinition; children: React.ReactNode }) {
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [sessionState, setSessionState] = useState<{
    scope: "onboarding" | "workspace";
    status: "loading" | "ready" | "onboarding-required" | "unauthorized";
  }>({ scope: "onboarding", status: "loading" });
  const isOnboarding = page.group === "onboarding";
  const accessScope = isOnboarding ? "onboarding" : "workspace";
  const checkedSessionState = sessionState.scope === accessScope ? sessionState.status : "loading";

  useEffect(() => {
    let active = true;
    setSessionState({ scope: accessScope, status: "loading" });
    apiRequest<unknown>("/users/me")
      .then(() => apiRequest<unknown>("/profile"))
      .then(({ data }) => {
        if (!active) return;
        setSessionState({
          scope: accessScope,
          status: isRecord(data) && data.confirmed_at ? "ready" : "onboarding-required",
        });
      })
      .catch(() => {
        if (active) setSessionState({ scope: accessScope, status: "unauthorized" });
      });
    return () => { active = false; };
  }, [accessScope]);

  useEffect(() => {
    setMobileNavOpen(false);
    setSearchOpen(false);
  }, [location.pathname]);

  if (checkedSessionState === "loading") {
    return <div className="auth-page"><InlineLoading label="Checking your secure session…" /></div>;
  }
  if (checkedSessionState === "unauthorized") {
    return <Navigate to="/login" replace state={{ returnTo: `${location.pathname}${location.search}` }} />;
  }
  if (checkedSessionState === "onboarding-required" && !isOnboarding) {
    return <Navigate to="/onboarding/contact" replace />;
  }
  if (checkedSessionState === "ready" && isOnboarding) {
    return <Navigate to="/app/dashboard" replace />;
  }

  return (
    <div className={`product-shell ${isOnboarding ? "onboarding-shell" : ""}`}>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <button className={`nav-scrim ${mobileNavOpen ? "is-open" : ""}`} aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />
      {!isOnboarding && (
        <aside id="main-navigation" className={`sidebar ${mobileNavOpen ? "is-open" : ""}`} aria-label="Main navigation">
          <Link className="brand" to="/app/dashboard" aria-label="AutoApply home">
            <span className="brand-symbol"><Sparkles size={17} strokeWidth={2.2} /></span>
            <span>autoapply</span>
          </Link>
          <div className="workspace-picker">
            <span className="workspace-mark">A</span>
            <span className="workspace-copy"><strong>My workspace</strong><small>Personal account</small></span>
            <ChevronDown size={15} />
          </div>
          {navigation.map((group) => (
            <nav className="nav-group" key={group.label} aria-label={group.label}>
              <p className="nav-heading">{group.label}</p>
              {group.links.map((item) => {
                const Icon = iconByName[item.icon as keyof typeof iconByName];
                const active = location.pathname === item.to || (item.to !== "/app/dashboard" && location.pathname.startsWith(`${item.to}/`));
                return (
                  <Link key={item.to} to={item.to} className={`nav-link ${active ? "active" : ""}`}>
                    <Icon size={17} strokeWidth={1.8} /><span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          ))}
          <div className="sidebar-bottom">
            <Link className={`nav-link ${location.pathname.startsWith("/app/settings") ? "active" : ""}`} to="/app/settings"><Settings2 size={17} /><span>Settings</span></Link>
            <div className="sidebar-help"><span className="help-icon"><CircleHelp size={17} /></span><span><strong>Need a hand?</strong><small>Visit help & support</small></span><ArrowUpRight size={14} /></div>
          </div>
        </aside>
      )}
      <div className="main-column">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation" aria-controls="main-navigation" aria-expanded={mobileNavOpen}><Menu size={20} /></button>
          <div className="breadcrumbs"><span>{isOnboarding ? "Getting started" : "Workspace"}</span><span className="crumb-separator">/</span><strong>{page.title}</strong></div>
          <div className="topbar-actions">
            {searchOpen && (
              <form className="top-search" onSubmit={(event) => { event.preventDefault(); if (searchText.trim()) window.location.assign(`/app/jobs?q=${encodeURIComponent(searchText.trim())}`); }}>
                <Search size={16} /><input autoFocus aria-label="Search jobs" placeholder="Search jobs..." value={searchText} onChange={(event) => setSearchText(event.target.value)} /><button className="sr-only" type="submit">Search</button>
              </form>
            )}
            <button className="icon-button top-search-button" aria-label={searchOpen ? "Close search" : "Search jobs"} onClick={() => setSearchOpen((value) => !value)}>{searchOpen ? <X size={18} /> : <Search size={18} />}</button>
            <Link to="/app/settings" className="avatar-button" aria-label="Account settings"><UserRound size={18} /></Link>
          </div>
        </header>
        <main id="main-content" className="page-content">
          {isOnboarding && <OnboardingProgress currentPath={location.pathname} />}
          <div className="page-heading">
            <div>
              <span className="eyebrow">{groupLabel(page.group)}</span>
              <h1>{page.title}</h1>
              <p>{page.description}</p>
            </div>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}

function OnboardingProgress({ currentPath }: { currentPath: string }) {
  const activeIndex = Math.max(0, onboardingSteps.findIndex((step) => currentPath.startsWith(step.to)));
  const progress = Math.round(((activeIndex + 1) / onboardingSteps.length) * 100);
  return (
    <section className="onboarding-progress" aria-label={`Setup progress: step ${activeIndex + 1} of ${onboardingSteps.length}`}>
      <div className="progress-top"><span><strong>Profile setup</strong><small>Step {activeIndex + 1} of {onboardingSteps.length}</small></span><span className="progress-percent">{progress}%</span></div>
      <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
      <div className="step-links">
        {onboardingSteps.map((step, index) => (
          <span key={step.to} className={`step-item ${index === activeIndex ? "current" : index < activeIndex ? "past" : ""}`} aria-current={index === activeIndex ? "step" : undefined}>
            <span className="step-number">{index + 1}</span>{step.label}
          </span>
        ))}
      </div>
    </section>
  );
}

function LandingPage() {
  const navigate = useNavigate();
  const [faqOpen, setFaqOpen] = useState<number | null>(0);
  const faqs = [
    ["Does AutoApply submit applications without asking me?", "No. You stay in control. Review the prepared details and approve an application before anything is submitted."],
    ["What happens when a question needs information I haven’t provided?", "AutoApply should ask you rather than guess. You can provide the answer and decide whether it may be reused where supported."],
    ["Can I review what will be sent?", "The approval step is designed to show the prepared information and any available preview before you make a decision."],
    ["Which job sites are supported?", "Availability depends on the integrations enabled for your account. We don’t claim support for a source unless it’s actually available."],
  ];
  return (
    <div className="marketing">
      <a className="skip-link" href="#marketing-main">Skip to main content</a>
      <header className="marketing-nav">
        <Link className="brand" to="/"><span className="brand-symbol"><Sparkles size={17} /></span><span>autoapply</span></Link>
        <nav aria-label="Main"><a href="#how-it-works">How it works</a><a href="#your-control">Your control</a><a href="#faq">FAQ</a></nav>
        <div className="marketing-actions"><Link to="/login" className="text-link">Log in</Link><Link to="/signup" className="button button-primary button-small">Get started <ArrowRight size={15} /></Link></div>
      </header>
      <main id="marketing-main">
        <section className="hero section-wrap">
          <div className="hero-copy">
            <span className="hero-kicker"><span className="kicker-dot" /> A calmer way to move forward</span>
            <h1>Your next role deserves a <span>better process.</span></h1>
            <p className="hero-description">Bring your job search into focus. Find roles that fit, prepare with care, and stay in control at every step.</p>
            <div className="hero-actions"><Link to="/signup" className="button button-primary button-large">Start your search <ArrowRight size={17} /></Link><a href="#how-it-works" className="button button-secondary button-large">See how it works <ArrowDownRight size={16} /></a></div>
            <div className="hero-assurance"><ShieldCheck size={16} /><span>Human approval before submission</span><span className="assurance-divider" /><span>No guessing on your behalf</span></div>
          </div>
          <div className="hero-art" aria-label="Illustrative application review preview">
            <div className="orbit orbit-one" /><div className="orbit orbit-two" />
            <div className="preview-window">
              <div className="preview-topbar"><div className="window-dots"><i /><i /><i /></div><span>APPLICATION REVIEW</span><MoreHorizontal size={16} /></div>
              <div className="preview-content">
                <div className="preview-company-row"><div className="company-monogram">C</div><div><strong>Product Designer</strong><span>Company details · Remote</span></div><span className="match-pill"><Sparkles size={12} /> Match details</span></div>
                <div className="preview-rule" />
                <div className="preview-label">YOUR APPLICATION</div>
                <div className="preview-field"><span>Role</span><strong>Product Designer</strong><Check size={14} /></div>
                <div className="preview-field"><span>Experience</span><strong>From your profile</strong><Check size={14} /></div>
                <div className="preview-field needs-review"><span>Availability</span><strong>Needs your input</strong><ArrowRight size={14} /></div>
                <div className="preview-approval"><span><ShieldCheck size={17} /> You decide before it’s sent</span><span className="approval-button">Review application</span></div>
              </div>
            </div>
            <p className="hero-preview-caption">Illustrative preview · details depend on connected service data.</p>
            <div className="floating-note note-top"><span className="note-icon"><Check size={15} /></span><span><strong>Thoughtful by design</strong><small>Every detail is reviewable</small></span></div>
            <div className="floating-note note-bottom"><span className="note-icon note-amber"><Clock3 size={15} /></span><span><strong>Waiting for you</strong><small>Nothing moves without approval</small></span></div>
          </div>
        </section>
        <section className="value-strip"><div className="value-strip-inner"><span>Built around the way a job search should feel</span><div><span><ShieldCheck size={16} /> You stay in control</span><span><Sparkles size={16} /> Clear match context</span><span><MessageSquareText size={16} /> Ask instead of assume</span></div></div></section>
        <section className="section-wrap section-block" id="how-it-works">
          <div className="section-intro"><span className="eyebrow">A little more clarity</span><h2>One considered step at a time.</h2><p>Keep the process moving without losing sight of the decisions that matter.</p></div>
          <div className="steps-grid">
            {[
              ["01", "Tell us what you’re looking for", "Add your resume and the preferences that help focus your search.", UserRound],
              ["02", "Explore roles with context", "See relevant opportunities alongside the information that informed the match.", Search],
              ["03", "Review before anything moves", "Check the prepared details, fill in what’s missing, and decide what happens next.", ShieldCheck],
            ].map(([number, title, copy, Icon]) => <article className="step-card" key={String(number)}><div className="step-card-top"><span>{String(number)}</span><Icon size={21} /></div><h3>{String(title)}</h3><p>{String(copy)}</p></article>)}
          </div>
        </section>
        <section className="control-section" id="your-control">
          <div className="section-wrap control-layout"><div className="control-copy"><span className="eyebrow">Designed for human judgment</span><h2>Helpful, not hands-off.</h2><p>Good support gives you more clarity, not less control. AutoApply keeps the important decisions in your hands.</p><ul className="check-list"><li><span><Check size={14} /></span>Review details before an application is submitted</li><li><span><Check size={14} /></span>See what needs your input and why</li><li><span><Check size={14} /></span>Skip a role that doesn’t feel right</li></ul><Link to="/signup" className="button button-primary">Get started <ArrowRight size={16} /></Link></div>
            <div className="control-visual"><div className="control-card"><div className="control-card-top"><span className="control-icon"><ShieldCheck size={20} /></span><span className="status-tag status-amber">Awaiting your review</span></div><p className="control-overline">NEXT STEP</p><h3>Product Designer</h3><p className="control-company">Company details provided with the role</p><div className="control-divider" /><div className="control-review-row"><div><strong>Application details</strong><span>Review the prepared information</span></div><ArrowRight size={16} /></div><div className="control-review-row"><div><strong>One answer needs you</strong><span>No answer has been assumed</span></div><ArrowRight size={16} /></div><div className="control-button">Review before approving</div><p className="preview-caption">Illustrative preview · actual details depend on your account and available job data.</p></div></div></div>
        </section>
        <section className="section-wrap section-block feature-block"><div className="section-intro"><span className="eyebrow">A job search that respects your judgment</span><h2>Understand the why.<br />Choose the next step.</h2></div><div className="feature-grid"><article><div className="feature-icon blue"><Sparkles size={19} /></div><h3>Explainable matching</h3><p>See which parts of your profile align with a role and where information is still missing.</p></article><article><div className="feature-icon green"><ShieldCheck size={19} /></div><h3>Approval stays with you</h3><p>Review application details before submission. Your approval is a deliberate step, not an afterthought.</p></article><article><div className="feature-icon amber"><MessageSquareText size={19} /></div><h3>Never guess on your behalf</h3><p>When an answer isn’t in your profile or saved answers, you’re the one who decides.</p></article></div></section>
        <section className="tracking-band"><div className="section-wrap tracking-layout"><div><span className="eyebrow">A clearer view of the journey</span><h2>Know where things stand.</h2><p>Keep track of the next step without confusing “in progress” with “done.”</p></div><div className="tracking-stages"><span><i className="stage-blue" />Matched</span><span><i className="stage-amber" />Needs your input</span><span><i className="stage-blue" />Awaiting approval</span><span><i className="stage-green" />Confirmed</span></div></div></section>
        <section className="section-wrap pricing-preview"><div><span className="eyebrow">Clear, before you commit</span><h2>Plan details, without the guesswork.</h2><p>When billing is available, current plan and price information will come from your account. No surprise numbers here.</p></div><button type="button" className="button button-secondary" onClick={() => navigate("/app/billing")}>See billing information <ArrowRight size={16} /></button></section>
        <section className="section-wrap faq-section" id="faq"><div className="section-intro"><span className="eyebrow">Good questions</span><h2>Good to know.</h2></div><div className="faq-list">{faqs.map(([question, answer], index) => <div className={`faq-item ${faqOpen === index ? "open" : ""}`} key={question}><button aria-expanded={faqOpen === index} onClick={() => setFaqOpen(faqOpen === index ? null : index)}><span>{question}</span><span className="faq-toggle">{faqOpen === index ? "−" : "+"}</span></button>{faqOpen === index && <p>{answer}</p>}</div>)}</div></section>
        <section className="closing-cta"><div className="closing-inner"><span className="eyebrow">Your next step, your call</span><h2>Make room for a more<br />thoughtful search.</h2><p>Start with your profile. Take it one step at a time.</p><Link to="/signup" className="button button-white">Get started <ArrowRight size={16} /></Link></div></section>
      </main>
      <footer className="marketing-footer"><Link className="brand" to="/"><span className="brand-symbol"><Sparkles size={16} /></span><span>autoapply</span></Link><span className="footer-note">Your search. Your call.</span><nav aria-label="Legal"><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/refunds">Refunds</Link><Link to="/login">Log in</Link></nav></footer>
    </div>
  );
}

function AuthPage({ page }: { page: PageDefinition }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("ready");
  const [serverData, setServerData] = useState<unknown>(null);
  const [searchParams] = useSearchParams();
  const isVerification = page.path.includes("verify-");
  const isSignup = page.path === "/signup";
  const isGoogle = page.path === "/auth/google/callback";
  const isComplete = page.path === "/signup/complete";
  const isEmailOtp = page.path.includes("verify-email");
  const authIntent = searchParams.get("intent") === "signup" || (isRecord(location.state) && location.state.authIntent === "signup") ? "signup" : "login";
  const endpoint = resourceUrl(page.resource, {});
  const verificationState = isRecord(serverData) ? String(serverData.status ?? "").toUpperCase() : "";
  const verificationBlocked = ["LOCKED", "RATE_LIMITED", "ATTEMPTS_EXCEEDED"].includes(verificationState);
  const verificationExpired = verificationState === "EXPIRED";
  useEffect(() => {
    if (isVerification && isApiConfigured) {
      apiRequest<unknown>("/auth/verification-status").then(({ data }) => setServerData(data)).catch((reason: unknown) => setError(errorMessage(reason)));
    }
    if (isComplete) {
      setStatus("loading");
      apiRequest<unknown>(page.resource).then(({ data }) => {
        setServerData(data);
        setStatus("ready");
      }).catch((reason: unknown) => {
        setError(errorMessage(reason));
        setStatus("error");
      });
    }
    if (isGoogle) {
      const code = searchParams.get("code");
      const state = searchParams.get("state");
      if (!code) {
        setError(searchParams.has("error") ? "Sign-in was cancelled or could not be completed. You can try again." : "The sign-in response is incomplete. Start again from the sign-in page.");
        return;
      }
      setStatus("loading");
      apiRequest<unknown>(`${page.resource}?${new URLSearchParams({ code, ...(state ? { state } : {}) })}`).then(async ({ data }) => {
        setServerData(data);
        setStatus("ready");
        const verification = await fetchVerificationStatus(data);
        const intent = getAuthIntent(data, searchParams.get("intent"));
        await routeForMissingVerification(verification, navigate, intent, {
          returnTo: searchParams.get("returnTo") ?? undefined,
          nextPath: isRecord(data) && typeof data.next_path === "string" ? data.next_path : undefined,
          googleAuth: intent === "signup",
        });
      }).catch((reason: unknown) => {
        setError(errorMessage(reason));
        setStatus("error");
      });
    }
  }, [isComplete, isGoogle, isVerification, location.state, navigate, page.resource, searchParams]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => setResendCooldown((remaining) => Math.max(remaining - 1, 0)), 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown > 0]);

  async function resendCode() {
    setError("");
    setNotice("");
    setResendBusy(true);
    try {
      const endpoint = isEmailOtp ? "/auth/resend-email" : "/auth/resend-mobile";
      const { data } = await apiRequest<unknown>(endpoint, { method: "POST", body: JSON.stringify({}) });
      const cooldown = isRecord(data) && typeof data.retry_after_seconds === "number" && Number.isFinite(data.retry_after_seconds) ? data.retry_after_seconds : 0;
      setResendCooldown(Math.max(0, Math.floor(cooldown)));
      setNotice("The resend request was accepted. Use the newest code sent by the service.");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setResendBusy(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    const referralCode = isSignup ? searchParams.get("ref") : null;
    if (referralCode) body.referral_code = referralCode;
    if (!isSignup && !isVerification && !isGoogle && !isComplete) {
      body.method = "PASSWORD";
    }
    if (isVerification && !/^\d{6}$/.test(String(body.code ?? ""))) {
      setError("Enter the six-digit code to continue.");
      return;
    }
    if (isSignup && body.password !== body.confirmPassword) {
      setError("Those passwords don’t match.");
      return;
    }
    setBusy(true);
    try {
      const { data } = await apiRequest<unknown>(endpoint, { method: "POST", body: JSON.stringify(body) });
      setServerData(data);
      if (!isSignup && !isVerification && !isGoogle && !isComplete) {
        const routeState = isRecord(location.state) ? location.state : null;
        const intendedPath = routeState && typeof routeState.returnTo === "string"
          ? safeNextPath(routeState.returnTo)
          : null;
        navigate(safeNextPath(searchParams.get("returnTo") ?? "") ?? intendedPath ?? "/app/dashboard");
        return;
      }
      const responseNext = isRecord(data) && typeof data.next_path === "string" ? safeNextPath(data.next_path) : null;
      const returnNext = !isSignup && !isVerification ? safeNextPath(searchParams.get("returnTo") ?? "") : null;
      const next = responseNext ?? returnNext;
      if (next) navigate(next);
      else setNotice(isVerification ? "The service received your code. Account status will update when confirmed by the service." : "The service received your request. Follow the next step provided by your account.");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  const verified = isRecord(serverData) && serverData.verified === true && serverData.mobile_verified === true;
  const authMethods = { google: false, error: "" };

  return (
    <div className="auth-page">
      <div className="auth-top"><Link className="brand" to="/"><span className="brand-symbol"><Sparkles size={17} /></span><span>autoapply</span></Link><Link to="/" className="back-home"><ArrowLeft size={15} /> Back to home</Link></div>
      <main id="main-content" className="auth-main">
        <div className="auth-card">
          <div className="auth-brand-mark"><span className={isComplete && verified ? "success-mark" : ""}>{isComplete && verified ? <Check size={22} /> : isVerification ? <ShieldCheck size={22} /> : isGoogle ? <Globe2 size={21} /> : <LockKeyhole size={21} />}</span></div>
          <span className="eyebrow">{isVerification ? "One more step" : isSignup ? "Start with the basics" : isGoogle ? "Secure sign in" : isComplete ? "Account status" : "Your workspace awaits"}</span>
          <h1>{page.title}</h1><p className="auth-description">{page.description}</p>
          {isComplete ? (
            status === "loading" ? <InlineLoading label="Checking your verification status…" /> :
              status === "error" ? <div className="auth-honest-state"><ErrorBanner message={error || "Verification status could not be confirmed."} /><button className="button button-secondary full-width" onClick={() => window.location.reload()}>Check status again <ArrowRight size={15} /></button></div> :
              verified ? <div className="auth-success"><span className="success-mark"><Check size={20} /></span><strong>Your account is verified</strong><p>Continue to set up your profile.</p><Link className="button button-primary full-width" to="/onboarding/contact">Continue to onboarding <ArrowRight size={16} /></Link></div> :
                <div className="auth-honest-state"><span className="status-tag status-amber">Verification pending</span><p>Your account isn’t confirmed as fully verified yet. Complete both email and mobile verification, then check again.</p><button className="button button-secondary full-width" onClick={() => window.location.reload()}>Check status again <ArrowRight size={15} /></button></div>
          ) : isGoogle ? (
            <div className="auth-honest-state">
              {status === "loading" && <InlineLoading label="Checking with the sign-in service…" />}
              {error && <ErrorBanner message={error} />}
              <Link to={authIntent === "signup" ? "/signup" : "/login"} className="button button-secondary full-width"><ArrowLeft size={15} /> Return to {authIntent === "signup" ? "sign up" : "sign in"}</Link>
            </div>
          ) : (
            <>
              {authMethods.google && <button className="button button-google full-width" onClick={() => void startGoogleAuth(setError, isSignup ? "signup" : "login")}><GoogleMark /> Continue with Google</button>}
              {authMethods.google && <div className="auth-divider"><span>or continue with email</span></div>}
              {authMethods.error && <ErrorBanner message={authMethods.error} />}
              <form className="auth-form" onSubmit={handleSubmit}>
                {isVerification ? (
                  <>
                    <label htmlFor="verification-code">{isEmailOtp ? "Email verification code" : "Mobile verification code"}</label>
                    {isRecord(serverData) && typeof serverData.masked_destination === "string" && <span className="masked-destination">Sent to {serverData.masked_destination}</span>}
                    {verificationBlocked && <div className="callout callout-amber"><LockKeyhole size={16} /><p>Verification is temporarily unavailable. Follow the recovery options from your account service.</p></div>}
                    {verificationExpired && <div className="callout callout-amber"><Clock3 size={16} /><p>This code has expired. Request a new code to continue.</p></div>}
                    <input id="verification-code" name="code" className="otp-input" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="••••••" aria-describedby="otp-hint" required disabled={verificationBlocked || verificationExpired} />
                    <small id="otp-hint" className="field-hint">Enter the six-digit code sent to your verified destination. For your security, codes are never shown here.</small>
                    <input type="hidden" name="purpose" value={isEmailOtp ? "email" : "mobile"} />
                  </>
                ) : (
                  <>
                    <div className="field-row"><label htmlFor="email">Email address</label><input autoComplete="email" id="email" name="email" type="email" placeholder="you@example.com" defaultValue={isRecord(location.state) && typeof location.state.email === "string" ? location.state.email : undefined} required /></div>
                    {isSignup && <div className="field-row"><label htmlFor="mobile">Mobile number</label><input autoComplete="tel" id="mobile" name="mobile" type="tel" placeholder="Include country code" required /><small className="field-hint">A verification step is required before your account is active.</small></div>}
                    <div className="field-row"><label htmlFor="password">Password</label><input autoComplete={isSignup ? "new-password" : "current-password"} id="password" name="password" type="password" minLength={8} placeholder={isSignup ? "At least 8 characters" : "Enter your password"} required /></div>
                    {isSignup && <div className="field-row"><label htmlFor="confirm-password">Confirm password</label><input autoComplete="new-password" id="confirm-password" name="confirmPassword" type="password" minLength={8} placeholder="Enter your password again" required /></div>}
                  </>
                )}
                {error && <ErrorBanner message={error} />}
                {notice && <div className="inline-notice" role="status"><Check size={16} />{notice}</div>}
                <button className="button button-primary full-width" type="submit" disabled={busy || !isApiConfigured || verificationBlocked || verificationExpired}>{busy ? <><span className="spinner" /> Working…</> : <>{isVerification ? "Verify code" : isSignup ? "Create account" : "Sign in"} <ArrowRight size={16} /></>}</button>
                {!isApiConfigured && <p className="form-contract-note">Connect the authentication service to enable account actions.</p>}
              </form>
              {isVerification && <div className="auth-recovery"><button type="button" onClick={() => void resendCode()} disabled={!isApiConfigured || resendBusy || resendCooldown > 0 || verificationBlocked}>{resendBusy ? "Sending…" : resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}</button><span>·</span><Link to="/signup">{isEmailOtp ? "Change email" : "Change number"}</Link></div>}
              <div className="auth-switch">{isSignup ? <>Already have an account? <Link to="/login">Sign in</Link></> : <>New to AutoApply? <Link to="/signup">Create an account</Link></>}</div>
            </>
          )}
        </div>
        <p className="auth-privacy"><LockKeyhole size={13} /> Your account information is handled by the connected authentication service.</p>
      </main>
      <footer className="auth-footer"><span>© AutoApply</span><div><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/refunds">Refunds</Link></div></footer>
    </div>
  );
}

function GoogleMark() {
  return <span className="google-mark" aria-hidden="true">G</span>;
}

type AuthVerificationStatus = Record<string, unknown> & {
  email_verified?: boolean;
  mobile_verified?: boolean;
};

async function fetchVerificationStatus(responseData?: unknown): Promise<AuthVerificationStatus> {
  const responseStatus = normalizeVerificationStatus(responseData);
  if (responseStatus) {
    return responseStatus;
  }
  const { data } = await apiRequest<unknown>("/auth/verification-status");
  const status = normalizeVerificationStatus(data);
  if (!status) {
    throw new Error("The authentication service could not confirm both email and mobile verification status.");
  }
  return status;
}

function normalizeVerificationStatus(value: unknown): AuthVerificationStatus | null {
  if (!isRecord(value) || typeof value.mobile_verified !== "boolean") return null;
  const emailVerified = typeof value.email_verified === "boolean" ? value.email_verified : value.verified;
  if (typeof emailVerified !== "boolean") return null;
  return { ...value, email_verified: emailVerified, mobile_verified: value.mobile_verified };
}

function getAuthIntent(data: unknown, requestedIntent: string | null): "login" | "signup" {
  if (requestedIntent === "signup" || isRecord(data) && (data.intent === "signup" || data.flow === "signup" || data.account_created === true)) return "signup";
  return "login";
}

function getPostAuthPath(intent: "login" | "signup", state?: unknown): string {
  const stateRecord = isRecord(state) ? state : null;
  const returnTo = stateRecord && typeof stateRecord.returnTo === "string" ? safeNextPath(stateRecord.returnTo) : null;
  const nextPath = stateRecord && typeof stateRecord.nextPath === "string" ? safeNextPath(stateRecord.nextPath) : null;
  const allowed = (path: string | null): path is string => Boolean(path && (path === "/app/dashboard" || path === "/onboarding/contact" || path.startsWith("/app/")));
  if (allowed(nextPath)) return nextPath;
  if (allowed(returnTo)) return returnTo;
  return intent === "signup" ? "/onboarding/contact" : "/app/dashboard";
}

async function routeForMissingVerification(
  status: AuthVerificationStatus,
  navigate: ReturnType<typeof useNavigate>,
  intent: "login" | "signup",
  state?: unknown,
) {
  const routeState = {
    authIntent: intent,
    ...(isRecord(state) && typeof state.returnTo === "string" ? { returnTo: state.returnTo } : {}),
    ...(isRecord(state) && state.googleAuth === true ? { googleAuth: true } : {}),
  };
  if (status.email_verified !== true) {
    const { data } = await apiRequest<unknown>("/auth/resend-email", { method: "POST", body: JSON.stringify({}) });
    navigate("/signup/verify-email", {
      state: {
        ...routeState,
        ...(isRecord(data) && typeof data.masked_destination === "string" ? { maskedDestination: data.masked_destination } : {}),
        ...(isRecord(data) && typeof data.retry_after_seconds === "number" ? { retryAfterSeconds: Math.max(0, Math.floor(data.retry_after_seconds)) } : {}),
      },
    });
    return;
  }
  if (status.mobile_verified !== true) {
    const mobileMissing = status.mobile_exists === false || status.mobile_provided === false || status.mobile_required === true && status.mobile_exists === false;
    if (mobileMissing) {
      navigate("/signup/mobile", { state: routeState });
      return;
    }
    const { data } = await apiRequest<unknown>("/auth/resend-mobile", { method: "POST", body: JSON.stringify({}) });
    navigate("/signup/verify-mobile", {
      state: {
        ...routeState,
        ...(isRecord(data) && typeof data.masked_destination === "string" ? { maskedDestination: data.masked_destination } : {}),
        ...(isRecord(data) && typeof data.retry_after_seconds === "number" ? { retryAfterSeconds: Math.max(0, Math.floor(data.retry_after_seconds)) } : {}),
      },
    });
    return;
  }
  navigate(getPostAuthPath(intent, state));
}

async function startGoogleAuth(setError: (value: string) => void, intent: "login" | "signup", referralCode?: string) {
  try {
    const { data } = await apiRequest<unknown>("/auth/google", {
      method: "POST",
      body: JSON.stringify({ intent, ...(referralCode ? { referral_code: referralCode } : {}) }),
    });
    if (isRecord(data) && typeof data.authorization_url === "string") {
      const url = new URL(data.authorization_url);
      if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Error("The sign-in service returned an invalid authorization URL.");
      window.location.assign(url.toString());
      return;
    }
    throw new Error("The sign-in service did not provide an authorization URL.");
  } catch (reason) {
    setError(errorMessage(reason));
  }
}

function LegalPage({ page }: { page: PageDefinition }) {
  const remote = useRemoteData(page.resource);
  const text = isRecord(remote.data) && typeof remote.data.content === "string" ? remote.data.content : "";
  return (
    <div className="legal-page">
      <header className="marketing-nav"><Link className="brand" to="/"><span className="brand-symbol"><Sparkles size={17} /></span><span>autoapply</span></Link><Link to="/" className="text-link"><ArrowLeft size={15} /> Back to home</Link></header>
      <a className="skip-link" href="#legal-main">Skip to main content</a>
      <main id="legal-main" className="legal-content"><span className="eyebrow">AutoApply · Legal</span><h1>{page.title}</h1>
        {remote.status === "loading" ? <InlineLoading label="Loading approved content…" /> : remote.status === "error" ? <ErrorBanner message={remote.error ?? "Content could not be loaded."} /> : text ? <article className="legal-copy"><p>{text}</p></article> : <div className="content-required"><ShieldCheck size={20} /><div><strong>Approved content has not been supplied</strong><p>This page will display the current policy once it is available from the approved legal source. No policy terms are invented here.</p></div></div>}
      </main><footer className="marketing-footer"><Link className="brand" to="/"><span className="brand-symbol"><Sparkles size={16} /></span><span>autoapply</span></Link><nav><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/refunds">Refunds</Link></nav></footer>
    </div>
  );
}

function PublicEntryPage({ page }: { page: PageDefinition }) {
  const { code, token } = useParams();
  const params: Record<string, string> = page.path.startsWith("/r/") ? { code: code ?? "" } : page.path.startsWith("/a/") ? { token: token ?? "" } : {};
  const endpoint = page.path.startsWith("/a/") ? `${page.resource}/validate` : page.path.startsWith("/r/") ? `${page.resource}?code=${encodeURIComponent(code ?? "")}` : resourceUrl(page.resource, params);
  const remote = usePublicEntryData(page.path.startsWith("/a/"), endpoint, token ?? "");
  const approvalState = isRecord(remote.data) ? String(remote.data.status ?? remote.data.state ?? "").toUpperCase() : "";
  const validApproval = ["VALID", "READY", "PENDING", "UNUSED"].includes(approvalState);
  const approvalActionPath = isRecord(remote.data) && typeof remote.data.next_path === "string" ? safeNextPath(remote.data.next_path) : null;
  return (
    <div className="public-entry">
      <header className="marketing-nav"><Link className="brand" to="/"><span className="brand-symbol"><Sparkles size={17} /></span><span>autoapply</span></Link><Link to="/login" className="text-link">Log in</Link></header>
      <a className="skip-link" href="#entry-main">Skip to main content</a>
      <main id="entry-main" className="entry-card">
        <div className="auth-brand-mark"><span>{page.path.startsWith("/a/") ? <ShieldCheck size={21} /> : <HeartHandshake size={21} />}</span></div>
        <span className="eyebrow">{page.path.startsWith("/a/") ? "Secure application review" : "A personal invitation"}</span><h1>{page.title}</h1><p>{page.description}</p>
        {page.path.startsWith("/a/") && <div className="callout callout-amber"><ShieldCheck size={17} /><p>This single-use link is checked with the service. Opening the link does not submit an application.</p></div>}
        <RemoteState resource={endpoint} remote={remote} />
        {page.path.startsWith("/r/") && <Link to={`/signup?ref=${encodeURIComponent(code ?? "")}`} className="button button-primary full-width">Continue to sign up <ArrowRight size={16} /></Link>}
        {page.path.startsWith("/a/") && validApproval && approvalActionPath && <Link to={approvalActionPath} className="button button-primary full-width">Continue to application review <ArrowRight size={16} /></Link>}
        {page.path.startsWith("/a/") && validApproval && !approvalActionPath && <Link to="/login" className="button button-primary full-width">Sign in to continue <ArrowRight size={16} /></Link>}
        {page.path.startsWith("/a/") && remote.status === "ready" && remote.data !== null && !validApproval && <div className="callout callout-amber"><Clock3 size={17} /><p>{approvalState === "EXPIRED" ? "This approval link has expired. Request a new link from your account." : approvalState === "ALREADY_USED" ? "This approval link has already been used." : approvalState === "REVOKED" ? "This approval link is no longer active." : approvalState === "MISMATCH" || approvalState === "STALE" ? "The prepared application has changed. Review the current application from your account." : "The service has not confirmed that this approval link is valid."}</p></div>}
        <Link to="/" className="entry-back"><ArrowLeft size={14} /> Return to AutoApply</Link>
      </main>
    </div>
  );
}

function usePublicEntryData(isApprovalLink: boolean, resource: string, token: string) {
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; data: unknown; error?: string }>({ status: isApiConfigured && isApprovalLink ? "loading" : "ready", data: null });
  const load = useCallback(() => {
    if (!isApiConfigured) {
      setState({ status: "ready", data: null });
      return;
    }
    setState({ status: "loading", data: null });
    apiRequest<unknown>(resource, isApprovalLink ? { method: "POST", body: JSON.stringify({ token }) } : {})
      .then(({ data }) => setState({ status: "ready", data }))
      .catch((reason: unknown) => setState({ status: "error", data: null, error: errorMessage(reason) }));
  }, [isApprovalLink, resource, token]);
  useEffect(() => { load(); }, [load]);
  return { ...state, retry: load };
}

type OnboardingField = {
  key: string;
  label: string;
  type: "text" | "url" | "number" | "textarea" | "select" | "radio" | "checkboxes";
  required?: boolean;
  hint?: string;
  placeholder?: string;
  options?: Array<{ label: string; value: string; description?: string }>;
};

type OnboardingValues = Record<string, string | string[]>;

const professionalStatusOptions = [
  { label: "Student / recent graduate", value: "student_recent_graduate", description: "I’m studying, recently graduated, or starting my career." },
  { label: "Experienced professional", value: "experienced_professional", description: "I have professional experience and am continuing my career." },
];

function OnboardingPage({ page }: { page: PageDefinition }) {
  const navigate = useNavigate();
  const resource = page.resource;
  const remote = useRemoteData(resource);
  const [values, setValues] = useState<OnboardingValues>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isReview = page.path === "/onboarding/review";
  const isProfessional = page.path === "/onboarding/professional";
  const preferencesRemote = useRemoteData("/preferences", 0, isReview);
  const reviewValues = {
    ...getOnboardingValues(remote.data),
    ...getOnboardingValues(preferencesRemote.data),
  };
  const reviewComplete = isReview && hasCompletedOnboarding(reviewValues);

  useEffect(() => {
    if (remote.status === "ready") setValues(getOnboardingValues(remote.data));
  }, [remote.data, remote.status, page.path]);

  const fields = useMemo(() => getOnboardingFields(page.path, values.professional_status), [page.path, values.professional_status]);
  const missingRequired = fields.some((field) => {
    if (!field.required) return false;
    const value = values[field.key];
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value !== "string" || !value.trim()) return true;
    return field.type === "number" && !Number.isFinite(Number(value));
  }) || (isProfessional && !values.professional_status);
  const isFirstStep = page.path === onboardingSteps[0].to;
  const previousPath = previousOnboardingPath(page.path);
  const nextPath = onboardingSteps[onboardingSteps.findIndex((step) => step.to === page.path) + 1]?.to ?? "/app/dashboard";

  function updateValue(key: string, value: string | string[]) {
    setValues((current) => ({ ...current, [key]: value }));
    setError("");
  }

  async function continueStep(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isReview && !reviewComplete) {
      setError("Complete all required profile, preference, and privacy details before confirming your profile.");
      return;
    }
    if (missingRequired) {
      setError("Complete the required fields before continuing.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (isReview) {
        await apiRequest<unknown>("/profile/confirm", {
          method: "POST",
          body: JSON.stringify({ acknowledged: true }),
        });
      } else if (page.path === "/onboarding/preferences") {
        const split = (value: string | string[] | undefined) =>
          (Array.isArray(value) ? value : String(value ?? "").split(","))
            .map((item) => item.trim())
            .filter(Boolean);
        const roles = split(values.preferred_roles);
        const locations = split(values.preferred_locations);
        const skills = split(values.skills);
        await apiRequest<unknown>("/preferences", {
          method: "PUT",
          body: JSON.stringify({
            roles,
            ...(locations.length ? { locations } : {}),
            ...(skills.length ? { skills } : {}),
            ...(typeof values.work_mode === "string" && values.work_mode
              ? { remote_preference: values.work_mode }
              : {}),
          }),
        });
      } else {
        const profileData = isRecord(remote.data) && isRecord(remote.data.data)
          ? remote.data.data
          : {};
        const body = JSON.stringify({ ...profileData, ...values });
        const profileExists = isRecord(remote.data) && typeof remote.data.version === "number" && remote.data.version > 0;
        try {
          await apiRequest<unknown>("/profile", { method: profileExists ? "PUT" : "POST", body });
        } catch (reason) {
          if (!profileExists && reason instanceof ApiError && reason.status === 409) {
            await apiRequest<unknown>("/profile", { method: "PUT", body });
          } else {
            throw reason;
          }
        }
      }
      navigate(isReview ? "/app/dashboard" : nextPath);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  if (isReview) {
    return (
      <section className="onboarding-content">
        <div className="review-guidance"><span className="guidance-icon"><ShieldCheck size={18} /></span><div><strong>Review before confirming</strong><p>Check your profile details and privacy selection. Your profile is confirmed only after the service records your review.</p></div></div>
        <RemoteState resource={resource} remote={remote} compact={false} onRetry={remote.retry} />
        <RemoteState resource="/preferences" remote={preferencesRemote} compact={false} onRetry={preferencesRemote.retry} />
        {remote.status === "ready" && preferencesRemote.status === "ready" && <OnboardingReviewSummary values={reviewValues} />}
        {error && <ErrorBanner message={error} />}
        <form className="onboarding-nav onboarding-review-nav" onSubmit={(event) => void continueStep(event)}>
          <Link to={previousPath} className="button button-secondary"><ArrowLeft size={15} />Back</Link>
          <span>Your progress is saved to your account</span>
          <button type="submit" className="button button-primary" disabled={!isApiConfigured || remote.status !== "ready" || preferencesRemote.status !== "ready" || !reviewComplete || busy}>{busy ? "Confirming…" : "Confirm profile"} <ArrowRight size={15} /></button>
        </form>
      </section>
    );
  }

  return (
    <section className="onboarding-content">
      {page.path === "/onboarding/contact" && <div className="review-guidance"><span className="guidance-icon"><ShieldCheck size={18} /></span><div><strong>Contact verification is already complete</strong><p>The email address and mobile number you verified during sign-up stay with your account. Add the profile details you want to use professionally below.</p></div></div>}
      {page.path === "/onboarding/preferences" && <div className="review-guidance"><span className="guidance-icon"><SlidersHorizontal size={18} /></span><div><strong>Set the direction for your search</strong><p>Your target roles, locations, work arrangements, and skills help guide job discovery.</p></div></div>}
      {page.path === "/onboarding/privacy" && <div className="review-guidance"><span className="guidance-icon"><LockKeyhole size={18} /></span><div><strong>You choose how your profile is used</strong><p>Your selection is saved with your account. Any external visibility is subject to the privacy controls supported by the service.</p></div></div>}
      <RemoteState resource={resource} remote={remote} compact={false} onRetry={remote.retry} />
      {isProfessional && <div className="professional-choice">
        <span className="onboarding-field-label">Which best describes you? <span className="required-mark">*</span></span>
        <div className="professional-choice-options">
          {professionalStatusOptions.map((option, index) => (
            <label className={`professional-choice-card ${values.professional_status === option.value ? "selected" : ""}`} key={option.value}>
              <input type="radio" name="professional_status" value={option.value} required={index === 0} checked={values.professional_status === option.value} onChange={() => {
                setValues((current) => {
                  const next: OnboardingValues = { ...current, professional_status: option.value };
                  ["education_level", "institution", "field_of_study", "graduation_year", "current_title", "years_experience", "current_company", "experience_summary"].forEach((key) => delete next[key]);
                  return next;
                });
                setError("");
              }} />
              <span><strong>{option.label}</strong><small>{option.description}</small></span>
              {values.professional_status === option.value && <Check size={18} />}
            </label>
          ))}
        </div>
      </div>}
      {fields.length > 0 && <form className="onboarding-profile-form" onSubmit={(event) => void continueStep(event)}>
        <div className="onboarding-form-grid">
          {fields.map((field) => <OnboardingFieldControl field={field} key={field.key} value={values[field.key] ?? (field.type === "checkboxes" ? [] : "")} onChange={(value) => updateValue(field.key, value)} />)}
        </div>
        {error && <ErrorBanner message={error} />}
        <div className="onboarding-nav">
          <Link to={isFirstStep ? "/app/dashboard" : previousPath} className="button button-secondary">{isFirstStep ? <X size={15} /> : <ArrowLeft size={15} />}{isFirstStep ? "Exit setup" : "Back"}</Link>
          <span>Your progress is saved to your account</span>
          <button type="submit" className="button button-primary" disabled={!isApiConfigured || remote.status !== "ready" || busy || missingRequired}>{busy ? "Saving…" : "Save and continue"} <ArrowRight size={15} /></button>
        </div>
      </form>}
    </section>
  );
}

function getOnboardingFields(path: string, professionalStatus: string | string[] | undefined): OnboardingField[] {
  if (path === "/onboarding/contact") return [
    { key: "full_name", label: "Full name", type: "text", required: true, placeholder: "Your name" },
    { key: "location", label: "City or region", type: "text", required: true, placeholder: "City, region, or country", hint: "A general location is enough; avoid adding a street address." },
    { key: "linkedin_url", label: "LinkedIn profile", type: "url", required: true, placeholder: "https://www.linkedin.com/in/your-profile" },
  ];
  if (path === "/onboarding/professional") {
    if (professionalStatus === "student_recent_graduate") return [
      { key: "education_level", label: "Current or highest education level", type: "select", required: true, options: ["High school", "Diploma", "Bachelor’s", "Master’s", "Doctorate", "Other"].map((value) => ({ label: value, value })) },
      { key: "institution", label: "School or institution", type: "text", required: true, placeholder: "Institution name" },
      { key: "field_of_study", label: "Field of study", type: "text", required: true, placeholder: "e.g. Computer science" },
      { key: "graduation_year", label: "Graduation year", type: "number", required: true, placeholder: "Year" },
    ];
    if (professionalStatus === "experienced_professional") return [
      { key: "current_title", label: "Current or most recent job title", type: "text", required: true, placeholder: "Your role" },
      { key: "years_experience", label: "Years of professional experience", type: "select", required: true, options: ["Less than 1 year", "1–2 years", "3–5 years", "6–10 years", "More than 10 years"].map((value) => ({ label: value, value })) },
      { key: "current_company", label: "Current or most recent company", type: "text", required: true, placeholder: "Company name" },
    ];
    return [];
  }
  if (path === "/onboarding/preferences") return [
    { key: "preferred_roles", label: "Roles you’re interested in", type: "textarea", required: true, placeholder: "Add job titles or role types, separated by commas." },
    { key: "preferred_locations", label: "Preferred locations", type: "textarea", required: true, placeholder: "Add cities, regions, or countries." },
    { key: "work_mode", label: "Preferred work arrangement", type: "select", required: true, options: [{ label: "Remote", value: "REMOTE" }, { label: "Hybrid", value: "HYBRID" }, { label: "On-site", value: "ONSITE" }] },
    { key: "skills", label: "Skills", type: "textarea", required: true, placeholder: "Add skills relevant to the roles you want, separated by commas." },
  ];
  if (path === "/onboarding/privacy") return [
    { key: "profile_visibility", label: "Profile visibility", type: "radio", required: true, options: [
      { label: "Private", value: "private", description: "Use your profile to support your job search. Don’t make it discoverable to recruiters." },
      { label: "Recruiter-visible", value: "recruiter_visible", description: "Allow recruiter discovery where this service supports it." },
    ] },
  ];
  return [];
}

function getOnboardingValues(data: unknown): OnboardingValues {
  if (!isRecord(data)) return {};
  if (isRecord(data.data)) {
    return Object.fromEntries(
      Object.entries(data.data).filter((entry): entry is [string, string | string[]] =>
        typeof entry[1] === "string" || Array.isArray(entry[1]) && entry[1].every((item) => typeof item === "string"),
      ),
    );
  }
  if (Array.isArray(data.roles) || Array.isArray(data.locations)) {
    return {
      preferred_roles: Array.isArray(data.roles) ? data.roles.join(", ") : "",
      preferred_locations: Array.isArray(data.locations) ? data.locations.join(", ") : "",
      skills: Array.isArray(data.skills) ? data.skills.join(", ") : "",
      work_mode: typeof data.remote_preference === "string" ? data.remote_preference : "",
    };
  }
  if (!Array.isArray(data.fields)) return {};
  return data.fields.reduce<OnboardingValues>((result, field) => {
    if (isRecord(field) && typeof field.key === "string" && (typeof field.value === "string" || Array.isArray(field.value) && field.value.every((item) => typeof item === "string"))) {
      result[field.key] = field.value as string | string[];
    }
    return result;
  }, {});
}

function hasCompletedOnboarding(values: OnboardingValues): boolean {
  const hasValue = (key: string) => {
    const value = values[key];
    return Array.isArray(value) ? value.some((item) => item.trim().length > 0) : Boolean(value?.trim());
  };
  const contactComplete = ["full_name", "location", "linkedin_url"].every(hasValue);
  const status = values.professional_status;
  const professionalComplete = status === "student_recent_graduate"
    ? ["education_level", "institution", "field_of_study", "graduation_year"].every(hasValue) &&
      Number.isFinite(Number(values.graduation_year))
    : status === "experienced_professional"
      ? ["current_title", "years_experience", "current_company"].every(hasValue)
      : false;
  const preferencesComplete = ["preferred_roles", "preferred_locations", "work_mode", "skills"].every(hasValue);
  const privacyComplete = hasValue("profile_visibility");
  return contactComplete && professionalComplete && preferencesComplete && privacyComplete;
}

function OnboardingReviewSummary({ values }: { values: OnboardingValues }) {
  const labels: Record<string, string> = {
    full_name: "Full name",
    location: "City or region",
    linkedin_url: "LinkedIn profile",
    professional_status: "Professional status",
    education_level: "Education level",
    institution: "School or institution",
    field_of_study: "Field of study",
    graduation_year: "Graduation year",
    current_title: "Current or most recent job title",
    years_experience: "Years of experience",
    current_company: "Current or most recent company",
    preferred_roles: "Roles of interest",
    preferred_locations: "Preferred locations",
    work_mode: "Work arrangement",
    skills: "Skills",
    profile_visibility: "Profile visibility",
  };
  const entries = Object.entries(labels)
    .map(([key, label]) => {
      const value = values[key];
      const display = Array.isArray(value) ? value.join(", ") : value?.trim();
      return display ? { label, value: display } : null;
    })
    .filter((entry): entry is { label: string; value: string } => entry !== null);

  return (
    <section className="onboarding-review-summary" aria-label="Profile details to review">
      <div className="onboarding-review-heading"><span className="eyebrow">Your completed details</span><h2>Review your profile</h2></div>
      {entries.length > 0 ? (
        <dl>{entries.map((entry) => <div className="onboarding-review-item" key={entry.label}><dt>{entry.label}</dt><dd>{entry.value}</dd></div>)}</dl>
      ) : (
        <p>No profile details have been saved yet. Go back and complete each setup step.</p>
      )}
    </section>
  );
}

function OnboardingFieldControl({ field, value, onChange }: { field: OnboardingField; value: string | string[]; onChange: (value: string | string[]) => void }) {
  const id = `onboarding-${field.key}`;
  const requiredMark = field.required ? <span className="required-mark"> *</span> : null;
  if (field.type === "radio") return (
    <fieldset className="onboarding-field onboarding-radio-field">
      <legend className="onboarding-field-label">{field.label}{requiredMark}</legend>
      <div className="onboarding-radio-options">{field.options?.map((option, index) => (
        <label className={`onboarding-radio-card ${value === option.value ? "selected" : ""}`} key={option.value}>
          <input type="radio" name={field.key} value={option.value} required={field.required && index === 0} checked={value === option.value} onChange={() => onChange(option.value)} />
          <span><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</span>
          {value === option.value && <Check size={17} />}
        </label>
      ))}</div>
      {field.hint && <small className="onboarding-field-hint">{field.hint}</small>}
    </fieldset>
  );
  if (field.type === "checkboxes") {
    const selected = Array.isArray(value) ? value : [];
    return <fieldset className="onboarding-field onboarding-checkbox-field"><legend className="onboarding-field-label">{field.label}{requiredMark}</legend><div className="onboarding-checkbox-options">{field.options?.map((option) => <label key={option.value}><input type="checkbox" checked={selected.includes(option.value)} onChange={(event) => onChange(event.target.checked ? [...selected, option.value] : selected.filter((item) => item !== option.value))} /><span>{option.label}</span></label>)}</div>{field.hint && <small className="onboarding-field-hint">{field.hint}</small>}</fieldset>;
  }
  return <div className={`onboarding-field ${field.type === "textarea" ? "onboarding-field-wide" : ""}`}><label className="onboarding-field-label" htmlFor={id}>{field.label}{requiredMark}</label>{field.type === "textarea" ? <textarea id={id} rows={4} required={field.required} value={Array.isArray(value) ? "" : value} placeholder={field.placeholder} onChange={(event) => onChange(event.target.value)} /> : field.type === "select" ? <select id={id} required={field.required} value={Array.isArray(value) ? "" : value} onChange={(event) => onChange(event.target.value)}><option value="">Choose an option</option>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <input id={id} type={field.type} required={field.required} min={field.type === "number" ? "1950" : undefined} max={field.key === "graduation_year" ? String(new Date().getFullYear() + 10) : undefined} value={Array.isArray(value) ? "" : value} placeholder={field.placeholder} onChange={(event) => onChange(event.target.value)} />}{field.hint && <small className="onboarding-field-hint">{field.hint}</small>}</div>;
}

function ReferralPage() {
  const remote = useRemoteData("/referrals");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const data = isRecord(remote.data) ? remote.data : null;
  const code = data && typeof data.referral_code === "string" ? data.referral_code : "";
  const referralUrl = data && typeof data.referral_url === "string" && isSafeHttpUrl(data.referral_url)
    ? data.referral_url
    : code ? new URL(`/r/${encodeURIComponent(code)}`, window.location.origin).toString() : "";
  const referrals = getRecords(data?.referrals ?? data?.items ?? data?.ledger) ?? [];
  const rewards = data?.rewards && isRecord(data.rewards) ? data.rewards : null;

  async function copyReferralLink() {
    if (!referralUrl) return;
    setCopied(false);
    setCopyError("");
    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);
    } catch {
      setCopyError("Could not copy automatically. Select and copy the referral link above.");
    }
  }

  async function shareReferralLink() {
    if (!referralUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: "AutoApply invitation", url: referralUrl });
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setCopyError("Sharing is unavailable right now. You can copy the referral link instead.");
      }
      return;
    }
    await copyReferralLink();
  }

  return (
    <div className="account-feature-page">
      <RemoteState resource="/referrals" remote={remote} compact={false} onRetry={remote.retry} />
      {data && <>
        <section className="referral-hero">
          <div className="referral-hero-copy">
            <span className="referral-icon"><Gift size={22} /></span>
            <span className="eyebrow">Invite someone to join you</span>
            <h2>Share AutoApply with your network.</h2>
            <p>{typeof data.reward_description === "string" ? data.reward_description : "Share your personal invitation link. Referral status and any eligible rewards are confirmed by the service."}</p>
          </div>
          <div className="referral-link-box">
            <label htmlFor="referral-link">Your referral link</label>
            {referralUrl ? <div className="referral-link-control"><input id="referral-link" readOnly value={referralUrl} onFocus={(event) => event.currentTarget.select()} /><button className="button button-secondary button-small" onClick={() => void copyReferralLink()}><Copy size={15} /> {copied ? "Copied" : "Copy link"}</button></div> : <p className="referral-no-link">Your referral link isn’t available yet.</p>}
            {code && <span className="referral-code">Referral code <strong>{code}</strong></span>}
            {referralUrl && <button className="button button-primary referral-share-button" onClick={() => void shareReferralLink()}>Share invitation <ExternalLink size={15} /></button>}
            {copyError && <p className="referral-copy-error" role="alert">{copyError}</p>}
          </div>
        </section>
        <section className="referral-metrics">
          <article><span>Invitations</span><strong>{formatServiceValue(data.invitation_count ?? data.total_referrals)}</strong></article>
          <article><span>Pending qualification</span><strong>{formatServiceValue(data.pending_count ?? data.pending_referrals)}</strong></article>
          <article><span>Qualified</span><strong>{formatServiceValue(data.qualified_count ?? data.qualified_referrals)}</strong></article>
          <article><span>Available referral rewards</span><strong>{formatServiceValue(rewards?.available ?? data.credits_balance ?? data.reward_balance)}</strong><small>{rewards && typeof rewards.unit === "string" ? rewards.unit : ""}</small></article>
        </section>
        <section className="referral-qualification-note"><span className="guidance-icon"><ShieldCheck size={18} /></span><div><strong>Rewards depend on qualification</strong><p>Signing up through your link does not itself qualify a referral or grant a reward. The service determines eligibility and records any reward.</p></div></section>
        <section className="account-data-card">
          <div className="card-heading"><div><span className="eyebrow">Referral activity</span><h3>Invitations and rewards</h3></div><button className="button button-secondary button-small" onClick={remote.retry}>Refresh</button></div>
          {referrals.length > 0 ? <div className="records-table-wrap"><table className="records-table"><thead><tr><th>Referral</th><th>Status</th><th>Reward</th><th>Updated</th></tr></thead><tbody>{referrals.map((entry, index) => <tr key={String(entry.id ?? entry.code ?? index)}><td>{displayReferralIdentity(entry, index)}</td><td><span className="referral-status">{formatServiceValue(entry.status ?? entry.qualification_status)}</span></td><td>{formatServiceValue(entry.reward ?? entry.credits ?? entry.free_days)}</td><td>{formatServiceDate(entry.updated_at ?? entry.qualified_at ?? entry.created_at)}</td></tr>)}</tbody></table></div> : <div className="referral-empty"><Gift size={19} /><span>No referral activity has been reported yet.</span></div>}
        </section>
      </>}
    </div>
  );
}

type BillingPlan = Record<string, unknown> & { id: string; name: string };

function BillingPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [actionBusy, setActionBusy] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [searchParams] = useSearchParams();
  const remote = useRemoteData("/billing", refreshKey);
  const data = isRecord(remote.data) ? remote.data : null;
  const subscription = data && isRecord(data.subscription) ? data.subscription : null;
  const currentPlan = subscription && isRecord(subscription.plan) ? subscription.plan : data && isRecord(data.current_plan) ? data.current_plan : null;
  const plans: BillingPlan[] = data && Array.isArray(data.plans)
    ? data.plans.reduce<BillingPlan[]>((result, plan) => {
      if (isRecord(plan) && (typeof plan.id === "string" || typeof plan.id === "number") && typeof plan.name === "string") {
        result.push({ ...plan, id: String(plan.id), name: plan.name });
      }
      return result;
    }, [])
    : [];
  const invoices = getRecords(data?.invoices) ?? [];
  const entitlements = getRecords(data?.entitlements) ?? [];
  const checkoutStatus = searchParams.get("checkout");
  const checkoutReturned = checkoutStatus !== null;

  useEffect(() => {
    if (checkoutReturned) setRefreshKey((key) => key + 1);
  }, [checkoutReturned]);

  async function startCheckout(planId: string) {
    setActionBusy(planId);
    setCheckoutError("");
    setActionMessage("");
    try {
      const { data: result } = await apiRequest<unknown>("/billing/subscribe", { method: "POST", body: JSON.stringify({ planId }) });
      const checkoutUrl = isRecord(result) && typeof result.checkout_url === "string" ? result.checkout_url : "";
      if (!isSafeHttpUrl(checkoutUrl)) throw new Error("The billing service did not return a valid checkout link.");
      window.location.assign(checkoutUrl);
    } catch (reason) {
      setCheckoutError(errorMessage(reason));
      setActionBusy("");
    }
  }

  async function runBillingAction(action: ServiceAction) {
    if (action.confirmation_required && !window.confirm(`Continue with “${action.label}”? This action is handled by the billing service.`)) return;
    let reason = "";
    if (action.reason_required) {
      const response = window.prompt(`Enter a reason for “${action.label}”.`);
      if (!response?.trim()) return;
      reason = response.trim();
    }
    setActionBusy(action.name);
    setCheckoutError("");
    setActionMessage("");
    try {
      await apiRequest<unknown>(`/billing/actions/${encodeURIComponent(action.name)}`, { method: "POST", body: JSON.stringify({ ...(action.payload ?? {}), ...(reason ? { reason } : {}) }) });
      setActionMessage("The request was received. Subscription and entitlement status will refresh from the billing service.");
      setRefreshKey((key) => key + 1);
    } catch (reason) {
      setCheckoutError(errorMessage(reason));
    } finally {
      setActionBusy("");
    }
  }

  const billingActions = getServiceActions(data);
  const returnMessage = checkoutReturned
    ? checkoutStatus === "complete"
      ? "Checkout returned to AutoApply. We’re checking your current subscription with the billing service; a redirect alone does not activate a plan."
      : "Checkout was not completed. Your subscription state remains as reported by the billing service."
    : "";

  return (
    <div className="account-feature-page billing-page">
      <RemoteState resource="/billing" remote={remote} compact={false} onRetry={remote.retry} />
      {returnMessage && <div className="billing-return-notice"><CreditCard size={17} /><span>{returnMessage}</span><button className="button button-secondary button-small" onClick={() => setRefreshKey((key) => key + 1)}>Check status</button></div>}
      {data && <>
        <section className="subscription-current-card">
          <div className="subscription-current-heading"><span className="billing-card-icon"><CreditCard size={19} /></span><div><span className="eyebrow">Your subscription</span><h2>{currentPlan && typeof currentPlan.name === "string" ? currentPlan.name : "Current plan"}</h2></div><span className="subscription-status">{formatServiceValue(subscription?.status ?? data.subscription_status)}</span></div>
          <div className="subscription-facts">
            <div><span>Renewal</span><strong>{formatServiceDate(subscription?.current_period_end ?? subscription?.renewal_date ?? data.renewal_date)}</strong></div>
            <div><span>Payment method</span><strong>{formatPaymentMethod(subscription?.payment_method ?? data.payment_method)}</strong></div>
            <div><span>Billing cycle</span><strong>{formatServiceValue(subscription?.interval ?? currentPlan?.interval ?? data.billing_interval)}</strong></div>
            <div><span>Entitlement status</span><strong>{formatServiceValue(data.entitlement_status ?? subscription?.entitlement_status)}</strong></div>
          </div>
          {typeof subscription?.grace_period_ends_at === "string" && <div className="billing-attention"><CalendarDays size={17} /><span>Payment attention is required. Current grace period ends {formatServiceDate(subscription.grace_period_ends_at)}.</span></div>}
        </section>
        {entitlements.length > 0 && <section className="account-data-card"><div className="card-heading"><div><span className="eyebrow">What’s included</span><h3>Plan entitlements and usage</h3></div></div><div className="entitlement-grid">{entitlements.map((item, index) => <article key={String(item.key ?? item.name ?? index)}><strong>{formatServiceValue(item.label ?? item.name ?? item.key)}</strong><span>{formatEntitlementUsage(item)}</span>{typeof item.description === "string" && <small>{item.description}</small>}</article>)}</div></section>}
        {plans.length > 0 && <section className="subscription-plans"><div className="card-heading"><div><span className="eyebrow">Available options</span><h3>Plans from your billing service</h3></div></div><div className="subscription-plan-grid">{plans.map((plan) => <article className={`subscription-plan-card ${plan.current === true ? "current" : ""}`} key={plan.id}><span className="subscription-plan-name">{plan.name}</span><strong className="subscription-plan-price">{formatPlanPrice(plan)}</strong><span className="subscription-plan-interval">{formatServiceValue(plan.interval)}</span>{Array.isArray(plan.features) && <ul>{plan.features.filter((feature): feature is string => typeof feature === "string").map((feature) => <li key={feature}><Check size={15} />{feature}</li>)}</ul>}<button className={plan.current === true ? "button button-secondary full-width" : "button button-primary full-width"} disabled={!isApiConfigured || plan.current === true || plan.available === false || actionBusy !== ""} onClick={() => void startCheckout(plan.id)}>{actionBusy === plan.id ? "Connecting to checkout…" : plan.current === true ? "Current plan" : typeof plan.cta_label === "string" ? plan.cta_label : "Choose plan"} {plan.current !== true && <ArrowRight size={15} />}</button></article>)}</div></section>}
        <section className="account-data-card"><div className="card-heading"><div><span className="eyebrow">Billing history</span><h3>Invoices and receipts</h3></div></div>{invoices.length > 0 ? <div className="records-table-wrap"><table className="records-table"><thead><tr><th>Invoice</th><th>Date</th><th>Amount</th><th>Status</th><th>Document</th></tr></thead><tbody>{invoices.map((invoice, index) => <tr key={String(invoice.id ?? index)}><td>{formatServiceValue(invoice.number ?? invoice.id)}</td><td>{formatServiceDate(invoice.created_at ?? invoice.date)}</td><td>{formatMoney(invoice.amount, invoice.currency)}</td><td>{formatServiceValue(invoice.status)}</td><td>{typeof invoice.download_url === "string" && isSafeHttpUrl(invoice.download_url) ? <a className="small-link" href={invoice.download_url} target="_blank" rel="noreferrer">Download <ExternalLink size={13} /></a> : "—"}</td></tr>)}</tbody></table></div> : <div className="referral-empty"><Receipt size={19} /><span>No invoices have been provided by the billing service.</span></div>}</section>
        {billingActions.length > 0 && <section className="service-actions"><div className="card-heading"><div><span className="eyebrow">Subscription controls</span><h3>Manage your plan</h3></div></div><div className="service-action-list">{billingActions.map((action) => <div className="service-action-row" key={action.name}><span><strong>{action.label}</strong>{action.description && <small>{action.description}</small>}</span><button className={action.confirmation_required ? "button button-danger-outline button-small" : "button button-secondary button-small"} disabled={!isApiConfigured || !action.enabled || actionBusy !== ""} onClick={() => void runBillingAction(action)}>{actionBusy === action.name ? "Working…" : action.label}</button></div>)}</div></section>}
      </>}
      {checkoutError && <ErrorBanner message={checkoutError} />}
      {actionMessage && <div className="inline-notice" role="status"><Check size={15} />{actionMessage}</div>}
      <p className="billing-authority-note"><ShieldCheck size={15} /> Plans, prices, payments, renewals, invoices, and active entitlements are determined by the billing service.</p>
    </div>
  );
}

function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function formatServiceValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return new Intl.NumberFormat().format(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return typeof value === "string" ? value.replace(/[_-]+/g, " ") : "Available";
}

function formatServiceDate(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function formatMoney(amount: unknown, currency: unknown): string {
  if (typeof amount !== "number" || typeof currency !== "string") return "—";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

function formatPlanPrice(plan: BillingPlan): string {
  return typeof plan.amount === "number" && typeof plan.currency === "string" ? formatMoney(plan.amount, plan.currency) : "Price supplied at checkout";
}

function formatPaymentMethod(value: unknown): string {
  if (isRecord(value)) {
    const brand = typeof value.brand === "string" ? value.brand : "";
    const last4 = typeof value.last4 === "string" ? value.last4 : "";
    return [brand, last4 ? `ending in ${last4}` : ""].filter(Boolean).join(" ") || formatServiceValue(value.type);
  }
  return formatServiceValue(value);
}

function formatEntitlementUsage(item: Record<string, unknown>): string {
  const used = item.used ?? item.current;
  const limit = item.limit ?? item.included;
  if (used !== undefined && limit !== undefined) return `${formatServiceValue(used)} of ${formatServiceValue(limit)} used`;
  if (item.enabled === true) return "Included";
  if (item.enabled === false) return "Not included";
  return formatServiceValue(item.value ?? item.status);
}

function displayReferralIdentity(entry: Record<string, unknown>, index: number): string {
  const identity = entry.display_name ?? entry.email_masked ?? entry.invited_person;
  return identity === undefined || identity === null || identity === "" ? `Referral ${index + 1}` : formatServiceValue(identity);
}

function previousOnboardingPath(path: string) {
  const index = onboardingSteps.findIndex((step) => path.startsWith(step.to));
  return onboardingSteps[Math.max(index - 1, 0)].to;
}

function JobLinkSubmissionPage() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submittedCount, setSubmittedCount] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const intakes = useRemoteData<unknown>("/jobs/intakes", refreshKey);
  const entries = useMemo(() => {
    const lines = text.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
    const seen = new Set<string>();
    return lines.map((value, index) => {
      try {
        const url = new URL(value);
        if (!["http:", "https:"].includes(url.protocol) || !url.hostname) {
          return { value, line: index + 1, hostname: "", error: "Use a complete http:// or https:// link." };
        }
        if (seen.has(url.href)) {
          return { value, line: index + 1, hostname: url.hostname, error: "This link is duplicated." };
        }
        seen.add(url.href);
        return { value, line: index + 1, hostname: url.hostname, error: "" };
      } catch {
        return { value, line: index + 1, hostname: "", error: "This does not look like a valid web link." };
      }
    });
  }, [text]);
  const validCount = entries.filter((entry) => !entry.error).length;
  const validationError = entries.find((entry) => entry.error)?.error ?? "";

  async function submitLinks(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (entries.length === 0) {
      setError("Add at least one job link before sending.");
      return;
    }
    if (validationError) {
      setError("Review the links marked below and correct them before sending.");
      return;
    }

    setBusy(true);
    try {
      await apiRequest<unknown>("/jobs/links", {
        method: "POST",
        body: JSON.stringify({ links: entries.map((entry) => entry.value) }),
      });
      setSubmittedCount(entries.length);
      setText("");
      setRefreshKey((key) => key + 1);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="job-link-page">
      <section className="job-link-panel">
        <div className="job-link-panel-heading">
          <span className="job-link-symbol"><Link2 size={22} /></span>
          <div>
            <span className="eyebrow">Your roles, your choice</span>
            <h2>Where would you like to apply?</h2>
            <p>Paste links to job postings you’re interested in. We’ll send them to the service for processing.</p>
          </div>
        </div>

        {submittedCount > 0 && (
          <div className="job-link-success" role="status">
            <span className="job-link-symbol success"><Check size={20} /></span>
            <div><strong>{submittedCount} {submittedCount === 1 ? "link was" : "links were"} sent for processing.</strong><p>Check <Link to="/app/applications">Applications</Link> for updates. Nothing is submitted to an employer unless you review and approve it.</p></div>
          </div>
        )}

        <form className="job-link-form" onSubmit={(event) => void submitLinks(event)} noValidate>
          <label className="job-link-label" htmlFor="job-links">Job posting links</label>
          <textarea
            id="job-links"
            name="links"
            rows={8}
            autoComplete="off"
            spellCheck={false}
            placeholder={"https://company.com/careers/job-title\nhttps://jobs.example.com/role/123"}
            value={text}
            onChange={(event) => { setText(event.target.value); setError(""); setSubmittedCount(0); }}
            aria-describedby="job-links-hint"
            aria-invalid={Boolean(validationError)}
          />
          <div className="job-link-field-meta">
            <span id="job-links-hint">Enter one complete http:// or https:// URL per line. You can paste several at once.</span>
            <span>{entries.length} {entries.length === 1 ? "link" : "links"}</span>
          </div>

          {entries.length > 0 && (
            <div className="job-link-preview" aria-live="polite">
              <div className="job-link-preview-heading"><strong>Link check</strong><span>{validCount} of {entries.length} ready</span></div>
              <ul>
                {entries.map((entry, index) => (
                  <li className={entry.error ? "invalid" : ""} key={`${entry.value}-${index}`}>
                    <span className="job-link-check-icon">{entry.error ? <X size={15} /> : <Check size={15} />}</span>
                    <span className="job-link-host">{entry.hostname || entry.value}</span>
                    {entry.error && <span className="job-link-entry-error">{entry.error}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {error && <ErrorBanner message={error} />}
          <div className="job-link-submit-row">
            <span><ShieldCheck size={16} /> Sending links starts processing, not applying.</span>
            <button className="button button-primary" type="submit" disabled={busy || entries.length === 0 || Boolean(validationError)}>
              {busy ? <><span className="spinner" /> Sending links…</> : <>Send links for processing <ArrowRight size={16} /></>}
            </button>
          </div>
          {!isApiConfigured && <p className="job-link-connection-note">Sending requires a backend connection. Set <code>VITE_API_BASE_URL</code> to your API base URL; connection errors will be shown if it is unavailable.</p>}
        </form>
      </section>

      <aside className="job-link-guidance">
        <div><span className="guidance-icon"><ShieldCheck size={18} /></span><div><strong>You stay in control</strong><p>The service can prepare applications from these roles. You’ll review details and approve before anything is submitted.</p></div></div>
        <div><span className="guidance-icon"><Globe2 size={18} /></span><div><strong>Use the direct job posting</strong><p>Paste the job’s page URL from the employer or job board. Sign-in-only or expired links may not be accessible to the service.</p></div></div>
      </aside>
      <section className="data-summary">
        <div className="data-summary-head"><span className="eyebrow">Your submitted job links</span><button className="button button-secondary button-small" type="button" onClick={() => setRefreshKey((key) => key + 1)}>Refresh status</button></div>
        <RemoteState resource="/jobs/intakes" remote={intakes} compact={false} />
        {intakes.status === "ready" && Array.isArray(intakes.data) && intakes.data.length > 0 && (
          <div className="data-record-list">{intakes.data.map((value, index) => {
            const intake = isRecord(value) ? value : {};
            const status = typeof intake.status === "string" ? intake.status : "UNKNOWN";
            return <div className="data-record" key={typeof intake.id === "string" ? intake.id : index}>
              <strong>{typeof intake.url === "string" ? intake.url : "Job link"}</strong>
              <span className={`status-tag ${status === "COMPLETED" ? "status-green" : status === "FAILED" ? "status-amber" : "status-blue"}`}>{status.toLowerCase().replace(/_/g, " ")}</span>
              {typeof intake.error === "string" && intake.error && <small>{intake.error}</small>}
              {typeof intake.jobId === "string" && <Link to={`/app/jobs/${encodeURIComponent(intake.jobId)}`}>Review job <ArrowRight size={14} /></Link>}
            </div>;
          })}</div>
        )}
      </section>
    </div>
  );
}

function ResumePage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState("");
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const resumes = useRemoteData<unknown>("/resumes", refreshKey);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const selected = form.elements.namedItem("resume");
    const file = selected instanceof HTMLInputElement ? selected.files?.[0] : undefined;
    setError("");
    setSuccess("");
    if (!file) {
      setError("Choose a PDF resume to upload.");
      return;
    }
    const body = new FormData();
    body.append("file", file);
    setBusy(true);
    try {
      await apiRequest<unknown>("/resumes", { method: "POST", body });
      setSuccess("Resume uploaded securely. Text extraction is processing in the background.");
      form.reset();
      setRefreshKey((key) => key + 1);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function togglePreview(id: string) {
    if (Object.prototype.hasOwnProperty.call(previews, id)) {
      setPreviews((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      return;
    }
    setError("");
    setPreviewBusy(id);
    try {
      const { data } = await apiRequest<{ text: string }>(`/resumes/${encodeURIComponent(id)}/preview`);
      setPreviews((current) => ({ ...current, [id]: data.text }));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setPreviewBusy("");
    }
  }

  async function deleteResume(id: string, fileName: string) {
    if (!window.confirm(`Permanently delete ${fileName} and its encrypted stored file?`)) return;
    setError("");
    try {
      await apiRequest<unknown>(`/resumes/${encodeURIComponent(id)}`, { method: "DELETE" });
      setPreviews((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      setRefreshKey((key) => key + 1);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  return (
    <div className="job-link-page">
      <section className="job-link-panel">
        <div className="job-link-panel-heading"><span className="job-link-symbol"><FileText size={22} /></span><div><span className="eyebrow">Private and encrypted</span><h2>Upload your resume</h2><p>Upload a PDF up to 10 MB. We encrypt the file before storage and extract selectable text to prepare applications.</p></div></div>
        <form className="auth-form" onSubmit={(event) => void upload(event)}>
          <label htmlFor="resume-upload">PDF resume</label>
          <input id="resume-upload" name="resume" type="file" accept="application/pdf,.pdf" required />
          {error && <ErrorBanner message={error} />}
          {success && <div className="inline-notice" role="status"><Check size={16} />{success}</div>}
          <button className="button button-primary" type="submit" disabled={busy || !isApiConfigured}>{busy ? <><span className="spinner" /> Uploading…</> : <>Upload resume <ArrowRight size={16} /></>}</button>
        </form>
      </section>
      <section className="data-summary">
        <div className="data-summary-head"><span className="eyebrow">Processing status</span><button className="button button-secondary button-small" type="button" onClick={() => setRefreshKey((key) => key + 1)}>Refresh</button></div>
        <RemoteState resource="/resumes" remote={resumes} compact={false} />
        {resumes.status === "ready" && Array.isArray(resumes.data) && resumes.data.length > 0 && (
          <div className="data-record-list">{resumes.data.map((value, index) => {
            const resume = isRecord(value) ? value : {};
            const status = typeof resume.status === "string" ? resume.status : "UNKNOWN";
            const id = typeof resume.id === "string" ? resume.id : "";
            return <div className="data-record" key={id || index}>
              <strong>{typeof resume.fileName === "string" ? resume.fileName : "Resume"}</strong>
              <span className={`status-tag ${status === "READY" ? "status-green" : status === "FAILED" ? "status-amber" : "status-blue"}`}>{status.toLowerCase()}</span>
              {typeof resume.pageCount === "number" && <small>{resume.pageCount} pages · text extracted</small>}
              {typeof resume.error === "string" && resume.error && <small>{resume.error}</small>}
              {id && <div className="notification-actions">
                {status === "READY" && <button className="button button-secondary button-small" type="button" onClick={() => void togglePreview(id)} disabled={previewBusy === id}>{previewBusy === id ? "Loading…" : Object.prototype.hasOwnProperty.call(previews, id) ? "Hide extracted text" : "Preview extracted text"}</button>}
                <button className="button button-secondary button-small" type="button" onClick={() => void deleteResume(id, typeof resume.fileName === "string" ? resume.fileName : "this resume")}>Delete</button>
              </div>}
              {id && Object.prototype.hasOwnProperty.call(previews, id) && <pre className="resume-preview">{previews[id]}</pre>}
            </div>;
          })}</div>
        )}
      </section>
    </div>
  );
}

function NotificationsPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState("");
  const notifications = useRemoteData<unknown>("/notifications", refreshKey);

  async function markRead(id?: string) {
    setError("");
    try {
      await apiRequest<unknown>(id ? `/notifications/${encodeURIComponent(id)}/read` : "/notifications/read-all", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setRefreshKey((key) => key + 1);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  const payload = isRecord(notifications.data) ? notifications.data : {};
  const items = Array.isArray(payload.notifications) ? payload.notifications : [];
  return (
    <section className="data-summary">
      <div className="data-summary-head"><span className="eyebrow">{typeof payload.unreadCount === "number" ? `${payload.unreadCount} unread` : "Updates for your account"}</span><button className="button button-secondary button-small" type="button" onClick={() => void markRead()}>Mark all as read</button></div>
      {error && <ErrorBanner message={error} />}
      <RemoteState resource="/notifications" remote={notifications} compact={false} />
      {notifications.status === "ready" && items.length === 0 && <div className="resource-empty"><span className="empty-icon"><MessageSquareText size={18} /></span><span><strong>You’re all caught up</strong><small>Job link and resume processing updates will appear here.</small></span></div>}
      {notifications.status === "ready" && items.length > 0 && (
        <div className="data-record-list">{items.map((value, index) => {
          const item = isRecord(value) ? value : {};
          const id = typeof item.id === "string" ? item.id : "";
          const path = typeof item.resourcePath === "string" && item.resourcePath.startsWith("/app/") ? item.resourcePath : "";
          const read = item.readAt !== null && item.readAt !== undefined;
          return <article className={`data-record ${read ? "notification-read" : "notification-unread"}`} key={id || index}>
            <strong>{typeof item.title === "string" ? item.title : "Account update"}</strong>
            <small>{typeof item.message === "string" ? item.message : ""}</small>
            <div className="notification-actions">
              {path && <Link to={path}>View details <ArrowRight size={14} /></Link>}
              {!read && id && <button className="button button-secondary button-small" type="button" onClick={() => void markRead(id)}>Mark as read</button>}
            </div>
          </article>;
        })}</div>
      )}
    </section>
  );
}

function ProductPage({ page }: { page: PageDefinition }) {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [filter, setFilter] = useState(searchParams.get("status") ?? "");
  const [cursor, setCursor] = useState(searchParams.get("cursor") ?? "");
  const [actionState, setActionState] = useState<{ busy: boolean; error: string; success: string }>({ busy: false, error: "", success: "" });
  const [refreshKey, setRefreshKey] = useState(0);
  const resource = useMemo(() => {
    const routeParams: Record<string, string> = Object.fromEntries(Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
    let endpoint = resourceUrl(page.resource, routeParams);
    if (["/jobs", "/applications"].includes(page.resource)) {
      const values = new URLSearchParams();
      if (query) values.set(page.resource === "/jobs" ? "query" : "q", query);
      if (filter) values.set(page.resource === "/jobs" ? "source" : "state", filter);
      if (cursor) values.set("cursor", cursor);
      if (page.resource === "/applications") values.set("limit", "100");
      if (values.size) endpoint += `?${values.toString()}`;
    }
    return endpoint;
  }, [page.resource, params, query, filter, cursor]);
  const remote = useRemoteData(resource, refreshKey);
  const isApproval = page.path.includes("/approval") && page.path !== "/app/applications/approval";
  const isBatch = page.path === "/app/applications/approval";
  const isPhase2 = page.group === "phase2";
  const phaseEnabled = isRecord(remote.data) && (remote.data.enabled === true || remote.data.available === true || remote.data.feature_enabled === true);
  const isList = ["/app/jobs", "/app/applications"].includes(page.resource);
  const editablePaths = ["/app/profile", "/app/preferences", "/app/answer-bank", "/app/settings/security", "/app/settings", "/app/resume"];
  const editableFields = editablePaths.includes(page.path) ? getFormFields(remote.data) : null;
  const needsInput = page.path.includes("/answer");
  const confirmReady = isRecord(remote.data) && String(remote.data.state ?? "").toUpperCase() === "AWAITING_APPROVAL" && remote.data.approval_eligible !== false && remote.data.stale !== true && remote.data.expired !== true;
  const answerReady = isRecord(remote.data) && String(remote.data.state ?? "").toUpperCase() === "NEEDS_INPUT";
  const pagination = getPagination(remote.data);

  async function performAction(action: string, extra?: Record<string, unknown>) {
    setActionState({ busy: true, error: "", success: "" });
    try {
      const basePath = resource.split("?")[0].replace(/\/(approval|answer|manual-assist)$/, "");
      const path = action === "consent" ? `${basePath}/consent` :
        action === "answer" ? `${basePath}/input` :
          `${basePath}/${action === "skip" ? "decline" : action}`;
      const body = action === "answer" ? { responses: extra?.responses } : extra ?? {};
      const { data } = await apiRequest<unknown>(path, { method: "POST", body: JSON.stringify(body) });
      if (action === "approve" && isRecord(data) && ["SUBMITTED", "CONFIRMED"].includes(String(data.state ?? ""))) {
        setActionState({ busy: false, error: "Unexpected submission state returned for an approval request. Refresh to verify the authoritative application state.", success: "" });
      } else {
        setActionState({ busy: false, error: "", success: "The service received your request. The current state will refresh from the service." });
        setRefreshKey((key) => key + 1);
      }
    } catch (reason) {
      setActionState({ busy: false, error: errorMessage(reason), success: "" });
    }
  }

  const headingAction = page.path === "/app/jobs" ? <div className="jobs-heading-actions"><Link to="/app/preferences" className="button button-secondary button-small">Edit preferences <SlidersHorizontal size={15} /></Link></div> :
    page.path === "/app/applications" ? <Link to="/app/applications/approval" className="button button-primary button-small">Review approvals <ArrowRight size={15} /></Link> :
      page.path === "/app/resume" ? <Link to="/app/resume/tailored" className="button button-secondary button-small">Tailor for a role <Sparkles size={15} /></Link> : null;

  return (
    <>
      {headingAction && <div className="page-action-row">{headingAction}</div>}
      {page.path === "/app/jobs/:id" && typeof params.id === "string" && <StartApplicationAction jobId={params.id} available={isRecord(remote.data) && String(remote.data.status ?? "").toUpperCase() === "OPEN"} />}
      {page.path === "/app/dashboard" && <DashboardSummary data={remote.data} />}
      {page.path === "/app/settings" && <SettingsHub />}
      {isList && <SearchToolbar query={query} setQuery={(value) => { setCursor(""); setQuery(value); }} filter={filter} setFilter={(value) => { setCursor(""); setFilter(value); }} page={page} />}
      {isApproval && <ApprovalNotice />}
      {isBatch && <ApprovalNotice batch />}
      {needsInput && <div className="callout callout-amber"><MessageSquareText size={18} /><p>Answer only what you know. If you’re unsure, leave it for review—no answer is assumed.</p></div>}
      {page.path.includes("manual-assist") && <div className="callout callout-amber"><Clock3 size={18} /><p>Automation has paused. Follow only the secure next step supplied by the service. AutoApply does not claim the application is complete.</p></div>}
      {page.path === "/app/settings/connected-accounts/:id/consent" && <ConsentNotice enabled={isApiConfigured && remote.status === "ready" && isRecord(remote.data) && remote.data.consent_required === true && typeof remote.data.consent_version === "string"} busy={actionState.busy} onConsent={() => void performAction("consent", { acknowledged: true, consent_version: isRecord(remote.data) ? remote.data.consent_version : undefined })} />}
      {page.path === "/app/settings/connected-accounts/dummy-mode" && <DummyModeNotice enabled={phaseEnabled} />}
      {page.path === "/app/resume/tailored" && <div className="review-guidance"><span className="guidance-icon"><Sparkles size={17} /></span><div><strong>Use verified profile facts only</strong><p>Generation is available only when enabled by the resume service. Generated details should remain traceable to their source.</p></div></div>}
      <RemoteState resource={resource} remote={remote} onRetry={() => setRefreshKey((key) => key + 1)} />
      {remote.status === "ready" && remote.data != null && isList && <ServiceRecords data={remote.data} page={page} />}
      {editableFields && <ServiceEditor resource={resource.split("?")[0]} fields={editableFields} enabled={isApiConfigured && remote.status === "ready"} onSaved={() => setRefreshKey((key) => key + 1)} />}
      {remote.status === "ready" && remote.data != null && !isList && !editableFields && !isBatch && <DataSummary data={remote.data} />}
      {remote.status === "ready" && remote.data != null && <ServiceActions resource={resource.split("?")[0]} data={remote.data} enabled={page.group !== "phase2" || (phaseEnabled && (page.path !== "/app/settings/connected-accounts/dummy-mode" || (isRecord(remote.data) && remote.data.consent_recorded === true)))} onComplete={() => setRefreshKey((key) => key + 1)} />}
      {isList && pagination && remote.status === "ready" && <PaginationControls pagination={pagination} onPage={setCursor} />}
      {isPhase2 && remote.status === "ready" && remote.data != null && !phaseEnabled && <div className="content-required"><LockKeyhole size={20} /><div><strong>This capability is not enabled</strong><p>Phase 2 functionality is shown only when the service confirms it is available for your account.</p></div></div>}
      {isApproval && <div className="approval-actions">
        <div><strong>Ready to make a decision?</strong><span>Your approval request goes to the service. Submission is a separate, backend-authoritative state.</span></div>
        <div className="button-row"><button className="button button-secondary" onClick={() => void performAction("skip")} disabled={!isApiConfigured || remote.status !== "ready" || actionState.busy}>Skip</button><button className="button button-secondary" onClick={() => void performAction("edit")} disabled={!isApiConfigured || remote.status !== "ready" || actionState.busy}>Edit details</button><button className="button button-primary" onClick={() => void performAction("approve")} disabled={!isApiConfigured || remote.status !== "ready" || !confirmReady || actionState.busy}>{actionState.busy ? <><span className="spinner" /> Sending…</> : <>Approve &amp; apply <ArrowRight size={16} /></>}</button></div>
        {!confirmReady && <small className="field-hint">Approval is disabled until the service confirms this application is awaiting approval, eligible, current, and not expired.</small>}
      </div>}
      {isBatch && <BatchApproval data={remote.data} enabled={isApiConfigured && remote.status === "ready" && isRecord(remote.data) && remote.data.bulk_approval_supported === true} />}
      {needsInput && <AnswerForm fields={isRecord(remote.data) && Array.isArray(remote.data.unknown_fields) ? remote.data.unknown_fields.filter(isRecord) : []} enabled={isApiConfigured && remote.status === "ready" && answerReady} onSubmit={(responses) => void performAction("answer", { responses })} busy={actionState.busy} />}
      {page.path === "/app/settings/privacy" && <PrivacyActions onAction={performAction} enabled={isApiConfigured && remote.status === "ready"} busy={actionState.busy} />}
      {actionState.error && <ErrorBanner message={actionState.error} />}
      {actionState.success && <div className="inline-notice" role="status"><Check size={16} />{actionState.success}</div>}
      <div className="page-bottom-links"><Link to="/app/dashboard"><Home size={14} /> Dashboard</Link><Link to="/app/settings"><Settings2 size={14} /> Settings</Link></div>
    </>
  );
}

function useRemoteData<T = unknown>(resource: string, refreshKey = 0, enabled = true) {
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; data: T | null; error?: string }>({
    status: isApiConfigured && enabled ? "loading" : "ready",
    data: null,
  });

  const load = useCallback(() => {
    if (!isApiConfigured || !resource || !enabled) {
      setState({ status: "ready", data: null });
      return;
    }
    setState({ status: "loading", data: null });
    apiRequest<T>(resource).then(({ data }) => setState({ status: "ready", data })).catch((reason: unknown) => setState({ status: "error", data: null, error: errorMessage(reason) }));
  }, [enabled, resource]);

  useEffect(() => { load(); }, [load, refreshKey]);
  return { ...state, retry: load };
}

function RemoteState({ resource, remote, onRetry, compact = true }: { resource: string; remote: ReturnType<typeof useRemoteData>; onRetry?: () => void; compact?: boolean }) {
  if (remote.status === "loading") return <InlineLoading label="Loading the latest information…" />;
  if (remote.status === "error") return <div className="resource-state"><ErrorBanner message={remote.error ?? "The service could not load this information."} /><button className="button button-secondary button-small" onClick={onRetry ?? remote.retry}>Try again <ArrowRight size={14} /></button></div>;
  if (!isApiConfigured) return (
    <div className={`integration-card ${compact ? "" : "integration-card-wide"}`}>
      <div className="integration-icon"><Globe2 size={18} /></div><div className="integration-copy"><span className="eyebrow">Waiting for service connection</span><h3>This view is ready for your backend</h3><p>Configure <code>VITE_API_BASE_URL</code> to load real account data. No sample records or local-only success states are used.</p><code className="endpoint-chip">GET {resource || "backend status"}</code></div>
    </div>
  );
  if (remote.status === "ready" && remote.data == null) return <div className="resource-empty"><span className="empty-icon"><FolderKanban size={18} /></span><span><strong>No service data returned</strong><small>The service can provide records for this view when available.</small></span></div>;
  return null;
}

function DataSummary({ data }: { data: unknown }) {
  const entries = getDisplayableData(data);
  if (entries.length === 0) return null;
  return (
    <section className="data-summary" aria-label="Information from your service">
      <div className="data-summary-head"><span className="eyebrow">From your connected service</span><span className="live-indicator"><i /> Current response</span></div>
      <div className="data-grid">{entries.map((entry) => <div className="data-item" key={`${entry.label}-${entry.value}`}><span>{entry.label}</span><strong>{entry.value}</strong></div>)}</div>
    </section>
  );
}

type EditorField = {
  key: string;
  label: string;
  type: string;
  value?: string | number | boolean;
  required?: boolean;
  description?: string;
  options?: unknown[];
  minimum?: number;
  maximum?: number;
};

function editorValues(fields: EditorField[]): Record<string, string | number | boolean> {
  return fields.reduce<Record<string, string | number | boolean>>((values, field) => {
    if (field.value !== undefined) values[field.key] = field.value;
    return values;
  }, {});
}

type ServiceAction = {
  name: string;
  label: string;
  description?: string;
  confirmation_required: boolean;
  reason_required: boolean;
  enabled: boolean;
  payload?: Record<string, unknown>;
};

function getServiceActions(data: unknown): ServiceAction[] {
  if (!isRecord(data) || !Array.isArray(data.actions)) return [];
  return data.actions.filter((action): action is Record<string, unknown> => isRecord(action) && typeof action.name === "string" && typeof action.label === "string")
    .filter((action) => /^[a-z0-9-]+$/i.test(String(action.name)))
    .map((action) => ({
      name: String(action.name),
      label: String(action.label),
      ...(typeof action.description === "string" ? { description: action.description } : {}),
      confirmation_required: action.confirmation_required === true,
      reason_required: action.reason_required === true,
      enabled: action.enabled === true,
      ...(isRecord(action.payload) ? { payload: action.payload } : {}),
    }));
}

function ServiceActions({ resource, data, enabled = true, onComplete }: { resource: string; data: unknown; enabled?: boolean; onComplete: () => void }) {
  const actions = getServiceActions(data);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  if (actions.length === 0) return null;

  async function run(action: ServiceAction) {
    if (action.confirmation_required && !window.confirm(`Continue with “${action.label}”? This action is handled by the service.`)) return;
    let reason = "";
    if (action.reason_required) {
      const response = window.prompt(`Enter a reason for “${action.label}”.`);
      if (!response?.trim()) return;
      reason = response.trim();
    }
    setBusy(action.name);
    setError("");
    setMessage("");
    try {
      await apiRequest<unknown>(`${resource}/actions/${encodeURIComponent(action.name)}`, {
        method: "POST",
        body: JSON.stringify({ ...(action.payload ?? {}), ...(reason ? { reason } : {}) }),
      });
      setMessage("The service received the action. Refreshing the authoritative state.");
      onComplete();
    } catch (reasonValue) {
      setError(errorMessage(reasonValue));
    } finally {
      setBusy("");
    }
  }

  return <section className="service-actions"><div className="card-heading"><div><span className="eyebrow">Available actions</span><h3>Actions provided by your service</h3></div></div><div className="service-action-list">{actions.map((action) => <div className="service-action-row" key={action.name}><span><strong>{action.label}</strong>{action.description && <small>{action.description}</small>}</span><button className={action.confirmation_required ? "button button-danger-outline button-small" : "button button-secondary button-small"} disabled={!isApiConfigured || !enabled || !action.enabled || busy !== ""} onClick={() => void run(action)}>{busy === action.name ? "Working…" : action.label}</button></div>)}</div>{!enabled && <small className="field-hint">Actions remain disabled until the feature service confirms this capability is enabled.</small>}{error && <ErrorBanner message={error} />}{message && <div className="inline-notice" role="status"><Check size={15} />{message}</div>}</section>;
}

function getFormFields(data: unknown): EditorField[] | null {
  if (!isRecord(data) || !Array.isArray(data.fields)) return null;
  const fields = data.fields.filter((field): field is Record<string, unknown> => isRecord(field) && typeof field.key === "string" && typeof field.label === "string")
    .filter((field) => !/password|token|secret|cookie|session/i.test(String(field.key)));
  return fields.map((field) => ({
    key: field.key as string,
    label: field.label as string,
    type: typeof field.type === "string" ? field.type : "text",
    ...(typeof field.value === "string" || typeof field.value === "number" || typeof field.value === "boolean" ? { value: field.value } : {}),
    ...(typeof field.required === "boolean" ? { required: field.required } : {}),
    ...(typeof field.description === "string" ? { description: field.description } : {}),
    ...(Array.isArray(field.options) ? { options: field.options } : {}),
    ...(typeof field.minimum === "number" ? { minimum: field.minimum } : {}),
    ...(typeof field.maximum === "number" ? { maximum: field.maximum } : {}),
  }));
}

function ServiceEditor({ resource, fields, enabled, onSaved }: { resource: string; fields: EditorField[]; enabled: boolean; onSaved?: () => void }) {
  const [values, setValues] = useState<Record<string, string | number | boolean>>(() => editorValues(fields));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const fieldFingerprint = JSON.stringify(fields);

  useEffect(() => {
    setValues(editorValues(fields));
  }, [fieldFingerprint]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      await apiRequest<unknown>(resource, { method: "PUT", body: JSON.stringify({ fields: values }) });
      setMessage("The service accepted your changes. The refreshed record remains authoritative.");
      onSaved?.();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  if (fields.length === 0) return null;
  return (
    <form className="service-editor" onSubmit={(event) => void save(event)}>
      <div className="card-heading"><div><span className="eyebrow">Editable account data</span><h3>Review the fields provided by the service</h3></div></div>
      <div className="editor-fields">{fields.map((field) => {
        const value = values[field.key];
        const fieldType = ["text", "email", "tel", "url", "number", "date"].includes(field.type) ? field.type : "text";
        return <div className="editor-field" key={field.key}>
          <label htmlFor={`field-${field.key}`}>{field.label}{field.required && <span className="required-mark"> *</span>}</label>
          {field.type === "textarea" ? <textarea id={`field-${field.key}`} required={field.required} value={typeof value === "string" ? value : ""} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} rows={3} /> :
            field.type === "select" ? <select id={`field-${field.key}`} required={field.required} value={typeof value === "string" ? value : ""} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}><option value="">Choose an option</option>{(field.options ?? []).map((option, index) => {
              const optionValue = isRecord(option) && typeof option.value === "string" ? option.value : typeof option === "string" ? option : "";
              const optionLabel = isRecord(option) && typeof option.label === "string" ? option.label : optionValue;
              return optionValue ? <option key={`${optionValue}-${index}`} value={optionValue}>{optionLabel}</option> : null;
            })}</select> :
              field.type === "checkbox" ? <label className="editor-checkbox"><input id={`field-${field.key}`} type="checkbox" checked={value === true} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.checked }))} /> Enabled</label> :
                <input id={`field-${field.key}`} type={fieldType} min={field.minimum} max={field.maximum} required={field.required} value={typeof value === "string" || typeof value === "number" ? value : ""} onChange={(event) => setValues((current) => ({ ...current, [field.key]: fieldType === "number" && event.target.value !== "" ? Number(event.target.value) : event.target.value }))} />}
          {field.description && <small className="field-hint">{field.description}</small>}
        </div>;
      })}</div>
      {error && <ErrorBanner message={error} />}{message && <div className="inline-notice" role="status"><Check size={15} />{message}</div>}
      <div className="editor-footer"><span>Changes are saved through the connected service.</span><button className="button button-primary" type="submit" disabled={!enabled || busy}>{busy ? "Saving…" : "Save changes"} <ArrowRight size={15} /></button></div>
    </form>
  );
}

type Pagination = { next: string | null; previous: string | null };

function getPagination(data: unknown): Pagination | null {
  if (!isRecord(data)) return null;
  if (typeof data.hasMore === "boolean" && data.hasMore && typeof data.cursor === "string") {
    return { next: data.cursor, previous: null };
  }
  const pagination = isRecord(data.pagination) ? data.pagination : data;
  const next = typeof pagination.next_cursor === "string" ? pagination.next_cursor : typeof pagination.nextCursor === "string" ? pagination.nextCursor : null;
  const previous = typeof pagination.previous_cursor === "string" ? pagination.previous_cursor : typeof pagination.previousCursor === "string" ? pagination.previousCursor : null;
  return next || previous ? { next, previous } : null;
}

function getRecords(data: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(data)) return data.filter(isRecord);
  if (!isRecord(data)) return null;
  const collection = [data.items, data.results, data.records, data.applications, data.jobs, data.data].find(Array.isArray);
  return Array.isArray(collection) ? collection.filter(isRecord) : null;
}

function ServiceRecords({ data, page }: { data: unknown; page: PageDefinition }) {
  const records = getRecords(data);
  if (!records?.length) return <DataSummary data={data} />;
  const keys = Object.keys(records[0]).filter((key) => !/payload|password|token|session|cookie|embedding|secret|credential/i.test(key)).slice(0, 6);
  return (
    <div className="records-table-wrap"><table className="records-table"><thead><tr>{keys.map((key) => <th key={key}>{key.replace(/[_-]+/g, " ")}</th>)}<th><span className="sr-only">Open record</span></th></tr></thead>
      <tbody>{records.map((record, index) => {
        const id = typeof record.id === "string" || typeof record.id === "number" ? String(record.id) : "";
        const detailPath = id ? page.resource === "/jobs" ? `/app/jobs/${encodeURIComponent(id)}` : page.resource === "/applications" ? `/app/applications/${encodeURIComponent(id)}` : "" : "";
        return <tr key={id || index}>{keys.map((key) => {
          const value = record[key];
          const text = value == null || typeof value === "object" ? "—" : String(value);
          return <td key={key}>{/^(status|state)$/i.test(key) ? <StatusBadge value={text} /> : text}</td>;
        })}<td>{detailPath && <Link className="record-open" to={detailPath} aria-label={`Open record ${index + 1}`}><ArrowUpRight size={15} /></Link>}</td></tr>;
      })}</tbody></table></div>
  );
}

function StatusBadge({ value }: { value: string }) {
  const normalized = value.toUpperCase();
  const tone = ["CONFIRMED", "SUBMITTED", "ACTIVE", "READY", "VERIFIED", "ENABLED"].includes(normalized) ? "status-green" :
    ["AWAITING_APPROVAL", "NEEDS_INPUT", "PREPARING", "SUBMITTING", "PENDING", "MANUAL_ASSIST", "BLOCKED"].includes(normalized) ? "status-amber" :
      ["FAILED", "REJECTED", "EXPIRED", "SUSPENDED", "DISABLED"].includes(normalized) ? "status-red" : "status-neutral";
  return <span className={`status-tag ${tone}`}>{value.replace(/[_-]+/g, " ")}</span>;
}

function PaginationControls({ pagination, onPage }: { pagination: Pagination; onPage: (cursor: string) => void }) {
  return <div className="pagination-controls"><button className="button button-secondary button-small" disabled={!pagination.previous} onClick={() => pagination.previous && onPage(pagination.previous)}><ArrowLeft size={13} /> Previous</button><span>More records are available from the service</span><button className="button button-secondary button-small" disabled={!pagination.next} onClick={() => pagination.next && onPage(pagination.next)}>Next <ArrowRight size={13} /></button></div>;
}

function DashboardSummary({ data }: { data: unknown }) {
  const record = isRecord(data) ? data : null;
  const stats = [
    ["Needs your review", record?.awaiting_approval ?? record?.awaitingApproval, "/app/applications/approval", Clock3, "amber"],
    ["Needs your input", record?.needs_input ?? record?.needsInput, "/app/applications", MessageSquareText, "blue"],
    ["Submitted", record?.submitted, "/app/applications", BriefcaseBusiness, "green"],
    ["Confirmed", record?.confirmed, "/app/applications", Check, "green"],
  ] as const;
  return (
    <>
      <div className="dashboard-welcome"><div><span className="eyebrow">Your job search, at a glance</span><h2>Make the next move with confidence.</h2><p>See what needs attention and choose what happens next.</p></div><div className="dashboard-welcome-actions"><Link to="/app/jobs" className="button button-primary">Explore jobs <ArrowRight size={16} /></Link></div></div>
      <div className="stat-grid">{stats.map(([label, value, to, Icon, tone]) => <Link className="stat-card" to={to} key={label}><div className={`stat-icon ${tone}`}><Icon size={17} /></div><span>{label}</span><strong>{typeof value === "number" || typeof value === "string" ? value : "—"}</strong><small>{value == null ? "Awaiting account data" : "View details"} <ArrowUpRight size={12} /></small></Link>)}</div>
      <ApplicationPipeline />
    </>
  );
}

function ApplicationPipeline() {
  const stages = ["Discovered", "Matched", "Preparing", "Needs input", "Awaiting approval", "Approved", "Submitting", "Submitted", "Confirmed"];
  return <section className="pipeline-card"><div className="card-heading"><div><span className="eyebrow">Application journey</span><h3>Every step, clearly marked</h3></div><Link to="/app/applications" className="small-link">View applications <ArrowRight size={14} /></Link></div><div className="pipeline-list">{stages.map((stage, index) => <div className="pipeline-stage" key={stage}><span className="pipeline-node">{index + 1}</span><span>{stage}</span>{index < stages.length - 1 && <i />}</div>)}</div><p className="pipeline-note">Stages are shown as a reference, not as a claim about your applications. Failed, blocked, and expired states remain visible when reported.</p></section>;
}

function SearchToolbar({ query, setQuery, filter, setFilter, page }: { query: string; setQuery: (value: string) => void; filter: string; setFilter: (value: string) => void; page: PageDefinition }) {
  const filters = page.resource === "/jobs" ? ["All sources", "GREENHOUSE", "LEVER", "ASHBY"] : page.resource.includes("applications") ? ["All states", "NEEDS_INPUT", "AWAITING_APPROVAL", "SUBMITTED", "CONFIRMED", "FAILED", "REJECTED"] : ["All actions"];
  return <form className="list-toolbar" onSubmit={(event) => event.preventDefault()}><label className="list-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${page.title.toLowerCase()}…`} aria-label={`Search ${page.title}`} /></label><label className="filter-select"><SlidersHorizontal size={15} /><select aria-label="Filter results" value={filter} onChange={(event) => setFilter(event.target.value)}>{filters.map((item, index) => <option key={item} value={index === 0 ? "" : item}>{item}</option>)}</select><ChevronDown size={14} /></label></form>;
}

function SettingsHub() {
  const sections = [
    { label: "Your profile", links: [["Profile", "/app/profile", UserRound], ["Job preferences", "/app/preferences", SlidersHorizontal], ["Answer bank", "/app/answer-bank", MessageSquareText]] },
    { label: "Account", links: [["Billing", "/app/billing", BriefcaseBusiness], ["Referrals", "/app/referrals", HeartHandshake]] },
  ];
  return <div className="settings-hub">{sections.map((section) => <section className="settings-section" key={section.label}><span className="eyebrow">{section.label}</span><div className="settings-links">{section.links.map(([label, to, Icon]) => <Link to={String(to)} className="settings-link-card" key={String(to)}><span className="settings-link-icon"><Icon size={17} /></span><span><strong>{String(label)}</strong><small>Manage {String(label).toLowerCase()} settings</small></span><ArrowRight size={15} /></Link>)}</div></section>)}</div>;
}

function BatchApproval({ data, enabled }: { data: unknown; enabled: boolean }) {
  const records = getRecords(data) ?? [];
  const eligible = records.filter((record) => String(record.state ?? "").toUpperCase() === "AWAITING_APPROVAL" && (record.approval_eligible === true || record.approvalEligible === true || record.eligible === true) && record.stale !== true && record.expired !== true);
  const [selected, setSelected] = useState<string[]>([]);
  const [state, setState] = useState<{ busy: boolean; message: string; error: string; results: unknown }>({ busy: false, message: "", error: "", results: null });
  const selectable = eligible.map((record) => record.id).filter((id): id is string | number => typeof id === "string" || typeof id === "number").map(String);
  const allSelected = selectable.length > 0 && selectable.every((id) => selected.includes(id));

  async function submit() {
    setState({ busy: true, message: "", error: "", results: null });
    try {
      const { data: result } = await apiRequest<unknown>("/applications/approval/approve", { method: "POST", body: JSON.stringify({ application_ids: selected }) });
      setState({ busy: false, message: "The service received the batch request. Review the returned state before taking another action.", error: "", results: result });
      setSelected([]);
    } catch (reason) {
      setState({ busy: false, message: "", error: errorMessage(reason), results: null });
    }
  }

  return (
    <section className="batch-review">
      <div className="batch-review-head"><div><span className="eyebrow">Batch review</span><h3>Choose only the applications you’re ready to approve</h3></div><label className="select-all"><input type="checkbox" checked={allSelected} disabled={!enabled || selectable.length === 0} onChange={(event) => setSelected(event.target.checked ? selectable : [])} /> Select all eligible</label></div>
      {records.length > 0 ? <div className="batch-records">{records.map((record, index) => {
        const id = typeof record.id === "string" || typeof record.id === "number" ? String(record.id) : "";
        const canApprove = String(record.state ?? "").toUpperCase() === "AWAITING_APPROVAL" && (record.approval_eligible === true || record.approvalEligible === true || record.eligible === true) && record.stale !== true && record.expired !== true;
        const title = [record.company, record.role ?? record.title].filter((item) => typeof item === "string").join(" · ") || `Application ${index + 1}`;
        return <label className="batch-record" key={id || index}><input type="checkbox" checked={Boolean(id && selected.includes(id))} disabled={!enabled || !canApprove || !id} onChange={(event) => setSelected((current) => event.target.checked ? [...current, id] : current.filter((item) => item !== id))} /><span><strong>{title}</strong><small>{canApprove ? "Eligible for explicit review" : "Not eligible according to the service"}</small></span><span className={`status-tag ${canApprove ? "status-amber" : "status-neutral"}`}>{canApprove ? "Eligible" : "Not eligible"}</span></label>;
      })}</div> : <p className="field-hint">Application records appear here when provided by the application service.</p>}
      <div className="batch-footer"><span>{selected.length} selected · approval support is confirmed by the service</span><button className="button button-primary" disabled={!enabled || selected.length === 0 || state.busy} onClick={() => void submit()}>{state.busy ? "Sending…" : "Approve selected"} <ArrowRight size={15} /></button></div>
      {!enabled && <small className="field-hint">Bulk approval stays disabled unless the service confirms support and eligibility.</small>}
      {state.error && <ErrorBanner message={state.error} />}{state.message && <div className="inline-notice" role="status"><Check size={15} />{state.message}</div>}{state.results !== null && <DataSummary data={state.results} />}
    </section>
  );
}

function ApprovalNotice({ batch = false }: { batch?: boolean }) {
  return <div className="approval-notice"><span className="approval-notice-icon"><ShieldCheck size={19} /></span><div><strong>{batch ? "Make each approval intentional" : "Nothing is submitted until you approve it"}</strong><p>{batch ? "The service determines which applications are eligible. Review the exact details before approving." : "Review the company, role, and prepared details returned by the service. If anything is missing or looks wrong, pause and edit."}</p></div></div>;
}

function AnswerForm({
  fields,
  enabled,
  onSubmit,
  busy,
}: {
  fields: Record<string, unknown>[];
  enabled: boolean;
  onSubmit: (responses: Record<string, string>) => void;
  busy: boolean;
}) {
  const [responses, setResponses] = useState<Record<string, string>>({});
  const answerFields = fields.filter((field) => typeof field.name === "string");
  return <form className="answer-form" onSubmit={(event) => {
    event.preventDefault();
    if (answerFields.length && answerFields.every((field) => Boolean(responses[String(field.name)]?.trim()))) onSubmit(responses);
  }}>
    {answerFields.map((field) => {
      const name = String(field.name);
      const label = typeof field.label === "string" ? field.label : name;
      return <div className="field-row" key={name}><label htmlFor={`answer-${name}`}>{label}</label><textarea id={`answer-${name}`} value={responses[name] ?? ""} onChange={(event) => setResponses((current) => ({ ...current, [name]: event.target.value }))} placeholder="Write an answer you’re comfortable sharing." rows={3} required /></div>;
    })}
    {!answerFields.length && <p className="field-hint">The service has not provided answer fields for this application.</p>}
    <button className="button button-primary" type="submit" disabled={!enabled || !answerFields.length || answerFields.some((field) => !responses[String(field.name)]?.trim()) || busy}>{busy ? "Sending…" : "Save answers and continue"} <ArrowRight size={15} /></button>
    <small className="field-hint">Your answers are sent to the application service. Reuse is opt-in and only available if supported.</small>
  </form>;
}

function StartApplicationAction({ jobId, available }: { jobId: string; available: boolean }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    setBusy(true);
    setError("");
    try {
      const { data } = await apiRequest<unknown>(`/applications/${encodeURIComponent(jobId)}/start`, {
        method: "POST",
        body: "{}",
      });
      if (!isRecord(data) || typeof data.application_id !== "string") {
        throw new Error("The application service did not return an application ID.");
      }
      navigate(`/app/applications/${encodeURIComponent(data.application_id)}/preparing`);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return <section className="account-feature-page">
    <button className="button button-primary" type="button" disabled={!available || busy} onClick={() => void start()}>
      {busy ? "Starting preparation…" : "Start application preparation"} <ArrowRight size={15} />
    </button>
    {!available && <small className="field-hint">This job is not currently open for applications.</small>}
    {error && <ErrorBanner message={error} />}
  </section>;
}

function PrivacyActions({ onAction, enabled, busy }: { onAction: (action: string) => Promise<void>; enabled: boolean; busy: boolean }) {
  return <section className="privacy-actions"><div><div className="feature-icon blue"><FileText size={17} /></div><h3>Request a copy of your data</h3><p>Available data export options are determined by your account service.</p><button className="button button-secondary" disabled={!enabled || busy} onClick={() => void onAction("export")}>Request export <ArrowRight size={14} /></button></div><div><div className="feature-icon amber"><LockKeyhole size={17} /></div><h3>Request account deletion</h3><p>Deletion requests may be irreversible. The service handles eligibility and confirmation.</p><button className="button button-danger-outline" disabled={!enabled || busy} onClick={() => void onAction("deletion-request")}>Request deletion</button></div></section>;
}

function ConsentNotice({ enabled, busy, onConsent }: { enabled: boolean; busy: boolean; onConsent: () => void }) {
  const [acknowledged, setAcknowledged] = useState(false);
  return <div className="consent-panel"><span className="consent-icon"><ShieldCheck size={22} /></span><span className="eyebrow">Read before continuing</span><h3>Understand the access being requested</h3><p>Review the provider terms, requested data, account restriction risks, pause controls, retention, and deletion policy provided by the service. Do not share passwords or session cookies here.</p><label className="consent-check"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /> I have reviewed the provider-specific risks and understand this consent is recorded by the service.</label><button className="button button-primary" disabled={!enabled || !acknowledged || busy} onClick={onConsent}>{busy ? "Recording consent…" : "Record consent with the service"} <ArrowRight size={15} /></button>{!enabled && <p className="field-hint">Consent remains unavailable until the service provides the consent requirement and version.</p>}</div>;
}

function DummyModeNotice({ enabled }: { enabled: boolean }) {
  return <div className="callout callout-amber"><LockKeyhole size={18} /><p>{enabled ? "The service reports this experimental capability is available, not that it is active. Review provider terms, restriction risks, session-data handling, pacing, CAPTCHA/login-wall auto-pause, kill switch, retention, deletion, and legal-review status. Enabling it requires backend-recorded informed consent." : "This experimental capability is unavailable unless the service explicitly enables it. No client-side control can turn it on."}</p></div>;
}

function InlineLoading({ label }: { label: string }) {
  return <div className="loading-state" role="status"><span className="spinner spinner-blue" /><span>{label}</span></div>;
}

function ErrorBanner({ message }: { message: string }) {
  return <div className="error-banner" role="alert"><X size={16} /><span>{message}</span></div>;
}

function NotFound() {
  return <div className="not-found"><div className="auth-brand-mark"><span><Search size={21} /></span></div><span className="eyebrow">Not found</span><h1>This page isn’t here.</h1><p>The link may be out of date, or the page may have moved.</p><Link to="/" className="button button-primary">Return home <ArrowRight size={15} /></Link></div>;
}

function groupLabel(group: PageGroup) {
  return ({ public: "AutoApply", auth: "Your account", onboarding: "Getting started", app: "Workspace", settings: "Your workspace", phase2: "Optional capabilities" })[group];
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : "Something went wrong. Please try again.";
}

function safeNextPath(path: string): string | null {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return null;
  return path;
}
