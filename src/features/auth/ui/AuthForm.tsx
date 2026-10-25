import { motion, useReducedMotion, type Variants } from "motion/react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { getAuthErrorMessage } from "@/shared/api/errors";
import { Icon } from "@/shared/ui/Icon";
import { useResolvedAppearance } from "@/shared/ui/theme/appearance";
import { useDelayedFlag } from "@/shared/ui/utils/useDelayedFlag";
import { enterApp } from "../enterApp";
import { googleSignInAvailable, renderGoogleButton } from "../google";
import { useAuthStore } from "../store";
import { AuthLayout } from "../AuthLayout";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const FIELD = "h-12 rounded-lg bg-card px-4 text-base md:text-base dark:bg-card";

const COPY = {
  login: {
    title: "Log in",
    lead: "Welcome back. Sign in to continue.",
    submit: "Log in",
    pending: "Logging in",
    autoComplete: "current-password",
    passwordError: "Enter at least 8 characters.",
    hint: undefined,
    switchText: "No account?",
    switchLabel: "Create account",
    switchTo: "/signup",
  },
  signup: {
    title: "Create account",
    lead: "Minimal setup now. You pick a currency next.",
    submit: "Create account",
    pending: "Creating account",
    autoComplete: "new-password",
    passwordError: "Use 8 to 128 characters.",
    hint: "At least 8 characters.",
    switchText: "Already have an account?",
    switchLabel: "Log in",
    switchTo: "/login",
  },
} as const;

export const stagger: Variants = { show: { transition: { staggerChildren: 0.05 } } };
export const rise: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 360, damping: 32 } },
};

/** Email + password form shared by Log in and Create account (same rules as mobile). */
export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const copy = COPY[mode];
  const reduce = useReducedMotion();
  const id = useId();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [apiError, setApiError] = useState("");
  const slow = useDelayedFlag(pending, 12_000);

  const emailValid = EMAIL.test(email.trim());
  const passwordValid = password.length >= 8 && password.length <= 128;
  const emailError = submitted && !emailValid ? "Enter a valid email." : undefined;
  const passwordError = submitted && !passwordValid ? copy.passwordError : undefined;

  const run = async (task: () => Promise<unknown>) => {
    setApiError("");
    setPending(true);
    try {
      await task();
    } catch (err) {
      setApiError(getAuthErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setSubmitted(true);
    if (!emailValid) return emailRef.current?.focus();
    if (!passwordValid) return passwordRef.current?.focus();
    const auth = useAuthStore.getState();
    // Route guards navigate once the session flips to authenticated.
    void run(
      mode === "login"
        ? async () => {
            await auth.login(email, password);
            void enterApp().catch(() => {});
          }
        : () => auth.signup(email, password),
    );
  };

  const onGoogleToken = (idToken: string) =>
    void run(() => useAuthStore.getState().loginWithGoogle(idToken).then(enterApp));

  const passwordNote = passwordError ?? copy.hint;

  return (
    <AuthLayout>
      <div className="mx-auto grid w-full max-w-[420px] flex-1 content-center px-4 pb-12 pt-4 sm:px-0">
        <motion.div variants={stagger} initial={reduce ? false : "hidden"} animate="show">
          <motion.div variants={rise}>
            <Button asChild variant="ghost" size="icon" className="-ml-2 size-11 rounded-full">
              <Link to="/welcome" aria-label="Back">
                <Icon name="chevron-back" size={20} />
              </Link>
            </Button>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight md:text-3xl">{copy.title}</h1>
            <p className="mt-2 text-muted-foreground">{copy.lead}</p>
          </motion.div>

          <motion.form variants={rise} onSubmit={onSubmit} noValidate className="mt-8 grid gap-5">
            <div className="grid gap-2">
              <Label htmlFor={`${id}-email`}>Email</Label>
              <Input
                ref={emailRef}
                id={`${id}-email`}
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={320}
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={!!emailError}
                aria-describedby={emailError ? `${id}-email-error` : undefined}
                className={FIELD}
              />
              {emailError && (
                <p id={`${id}-email-error`} className="text-sm text-expense">
                  {emailError}
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor={`${id}-password`}>Password</Label>
              <div className="relative">
                <Input
                  ref={passwordRef}
                  id={`${id}-password`}
                  type={showPassword ? "text" : "password"}
                  autoComplete={copy.autoComplete}
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={128}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={!!passwordError}
                  aria-describedby={passwordNote ? `${id}-password-note` : undefined}
                  className={cn(FIELD, "pr-20")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-controls={`${id}-password`}
                  className="absolute inset-y-0 right-0 min-w-16 rounded-r-lg px-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              {passwordNote && (
                <p id={`${id}-password-note`} className={cn("text-sm", passwordError ? "text-expense" : "text-subtle")}>
                  {passwordNote}
                </p>
              )}
            </div>

            {apiError && (
              <p role="alert" className="rounded-lg bg-expense-soft px-4 py-3 text-sm text-expense">
                {apiError}
              </p>
            )}

            <Button
              type="submit"
              disabled={pending}
              className="glow mt-1 h-12 rounded-full text-base font-semibold active:scale-[0.98]"
            >
              {pending ? copy.pending : copy.submit}
            </Button>

            {slow && (
              <p aria-live="polite" className="-mt-1 text-center text-sm text-muted-foreground">
                Waking up the server, this can take up to a minute.
              </p>
            )}
          </motion.form>

          {googleSignInAvailable && (
            <motion.div variants={rise} className="mt-6 grid gap-6">
              <div className="flex items-center gap-3 text-xs text-subtle" aria-hidden>
                <span className="h-px flex-1 bg-border" />
                or
                <span className="h-px flex-1 bg-border" />
              </div>
              <GoogleButton onToken={onGoogleToken} disabled={pending} />
            </motion.div>
          )}

          <motion.p variants={rise} className="mt-8 text-center text-sm text-muted-foreground">
            {copy.switchText}{" "}
            <Link
              to={copy.switchTo}
              replace
              className="inline-flex min-h-11 items-center rounded-full px-1 font-semibold text-foreground underline-offset-4 hover:underline"
            >
              {copy.switchLabel}
            </Link>
          </motion.p>
        </motion.div>
      </div>
    </AuthLayout>
  );
}

/** Google's own rendered button (its branding rules); re-rendered when the theme flips. */
function GoogleButton({ onToken, disabled }: { onToken: (idToken: string) => void; disabled: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef(onToken);
  const dark = useResolvedAppearance() === "dark";
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    latest.current = onToken;
  });

  useEffect(() => {
    if (!ref.current) return;
    renderGoogleButton(ref.current, (t) => latest.current(t), dark).then(
      () => setLoadError(""),
      (e: unknown) => setLoadError(e instanceof Error ? e.message : "Google sign-in is unavailable right now."),
    );
  }, [dark]);

  return (
    <div className="grid gap-2">
      <div
        ref={ref}
        aria-disabled={disabled || undefined}
        className={cn("flex min-h-11 w-full justify-center", disabled && "pointer-events-none opacity-50")}
      />
      {loadError && (
        <p role="alert" className="text-center text-sm text-expense">
          {loadError}
        </p>
      )}
    </div>
  );
}
