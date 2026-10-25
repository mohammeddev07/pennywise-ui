import { motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { useLocation } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar } from "@/app/AppShell";
import { useOverlay } from "@/app/overlays";
import { getGoogleSignInErrorMessage, googleSignInAvailable, renderGoogleButton } from "@/features/auth/google";
import { useAuthStore } from "@/features/auth/store";
import { captureBookScope } from "@/features/books/coordinator";
import { useBooksStore } from "@/features/books/store";
import { linkGoogle } from "@/shared/api/auth";
import { Icon } from "@/shared/ui/Icon";
import { useExportToastStore } from "@/shared/ui/state/useExportToastStore";
import { useUndoToastStore } from "@/shared/ui/state/useUndoToastStore";
import { Segmented } from "@/shared/ui/Segmented";
import { useResolvedAppearance } from "@/shared/ui/theme/appearance";
import { confirmDialog } from "@/shared/ui/utils/confirm";
import { exportTransactionsToDevice, MockModeUnsupportedError } from "@/shared/utils/exportFile";
import { BooksSection } from "./BooksSection";
import { SettingsGroup, SettingsRow } from "./SettingsRow";
import { DISPLAY_NAME_MAX, useSettingsStore } from "./store";

const SUPPORT_EMAIL = (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined)?.trim();
const APPEARANCE = [
  { value: "system" as const, label: "System" },
  { value: "light" as const, label: "Light" },
  { value: "dark" as const, label: "Dark" },
];

function AccountCard() {
  const reduce = useReducedMotion();
  const email = useAuthStore((s) => s.user?.email ?? "");
  const displayName = useSettingsStore((s) => s.displayName);
  const [spins, setSpins] = useState(0);
  return (
    <section aria-label="Account" className="surface flex items-center gap-4 rounded-2xl p-5">
      <motion.button
        type="button"
        onClick={() => {
          useSettingsStore.getState().shuffleAvatar();
          setSpins((n) => n + 1);
        }}
        animate={reduce ? undefined : { rotate: spins * 360 }}
        whileTap={reduce ? undefined : { scale: 0.9 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
        aria-label="Shuffle avatar colors"
        className="rounded-full"
      >
        <Avatar size={56} />
      </motion.button>
      <div className="min-w-0">
        <p className="truncate text-lg font-semibold">{displayName || email.split("@")[0] || "Your account"}</p>
        <p className="truncate text-sm text-muted-foreground">{email || "Email unavailable"}</p>
      </div>
    </section>
  );
}

function DisplayNameField() {
  const id = useId();
  const saved = useSettingsStore((s) => s.displayName);
  const [value, setValue] = useState(saved);
  useEffect(() => setValue(saved), [saved]);
  const commit = () => useSettingsStore.getState().setDisplayName(value);
  return (
    <div className="space-y-2 px-4 py-3.5">
      <div className="flex items-baseline justify-between">
        <Label htmlFor={id}>Display name</Label>
        <span className="text-xs text-muted-foreground">
          {value.length}/{DISPLAY_NAME_MAX}
        </span>
      </div>
      <Input
        id={id}
        value={value}
        maxLength={DISPLAY_NAME_MAX}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget.blur(), commit())}
        placeholder="What should we call you?"
        autoComplete="nickname"
        aria-describedby={`${id}-hint`}
        className="h-11 rounded-lg px-3"
      />
      <p id={`${id}-hint`} className="text-sm text-muted-foreground">
        Used for your greeting. Stays on this device.
      </p>
    </div>
  );
}

function AppearanceField() {
  const appearance = useSettingsStore((s) => s.appearance);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
      <span className="text-sm font-medium">Appearance</span>
      <Segmented label="Appearance" value={appearance} onChange={(v) => useSettingsStore.getState().setAppearance(v)} options={APPEARANCE} />
    </div>
  );
}

/** Lets an email account also log in with Google; the backend never merges by email on its own. */
function ConnectGoogleRow() {
  const dark = useResolvedAppearance() === "dark";
  const slot = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"idle" | "busy" | "done">("idle");

  useEffect(() => {
    if (!slot.current || status === "done") return;
    void renderGoogleButton(
      slot.current,
      async (idToken) => {
        setStatus("busy");
        try {
          useAuthStore.getState().setUser(await linkGoogle(idToken));
          setStatus("done");
        } catch (error) {
          setStatus("idle");
          useUndoToastStore.getState().showError(error, getGoogleSignInErrorMessage(error));
        }
      },
      dark,
    ).catch((error) => useUndoToastStore.getState().showError(error, error instanceof Error ? error.message : undefined));
  }, [dark, status]);

  return (
    <div className="space-y-3 px-4 py-3.5">
      <SettingsRowText
        label="Connect Google"
        value={status === "busy" ? "Connecting" : status === "done" ? "Connected. You can log in with Google too." : "Also log in with Google"}
      />
      {status !== "done" && <div ref={slot} className={status === "busy" ? "pointer-events-none opacity-60" : undefined} />}
    </div>
  );
}

function SettingsRowText({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
      <p className="text-sm text-muted-foreground">{value}</p>
    </div>
  );
}

function ExportRow() {
  const book = useBooksStore((s) => s.books.find((b) => b.id === s.selectedBookId));
  const [exporting, setExporting] = useState(false);
  const run = async () => {
    if (exporting || !book) return;
    const isCurrent = captureBookScope();
    setExporting(true);
    try {
      const { fileName } = await exportTransactionsToDevice(book.id);
      if (isCurrent()) useExportToastStore.getState().showSuccess(`Saved ${fileName}`);
    } catch (error) {
      if (isCurrent())
        useUndoToastStore
          .getState()
          .showError(error, error instanceof MockModeUnsupportedError ? error.message : "Couldn't export transactions.");
    } finally {
      setExporting(false);
    }
  };
  return (
    <SettingsRow
      icon="cloud-upload-outline"
      label="Export transactions"
      value={exporting ? "Exporting" : `Save ${book?.name ?? "this book"} as .xlsx`}
      onClick={() => void run()}
      disabled={exporting || !book}
    />
  );
}

export function SettingsPage() {
  const { hash } = useLocation();
  const reduce = useReducedMotion();
  const [signingOut, setSigningOut] = useState(false);

  // "Manage books" from the switcher lands here with #books.
  useEffect(() => {
    if (hash === "#books") document.getElementById("books")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, [hash, reduce]);

  const signOut = async () => {
    const ok = await confirmDialog({
      title: "Sign out?",
      message: "You'll need to sign in again to access your books.",
      confirmLabel: "Sign out",
      destructive: true,
    });
    if (!ok) return;
    setSigningOut(true);
    try {
      await useAuthStore.getState().logout();
    } catch (error) {
      useUndoToastStore.getState().showError(error, "Couldn't clear all local account data. Try again.");
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Settings</h1>
      <div className="grid gap-8 lg:grid-cols-2 lg:items-start lg:gap-10">
        <div className="space-y-8">
          <AccountCard />
          <BooksSection />
        </div>
        <div className="space-y-8">
          <SettingsGroup title="Preferences">
            <DisplayNameField />
            <AppearanceField />
            {googleSignInAvailable && <ConnectGoogleRow />}
            <SettingsRow icon="grid-outline" label="Categories & budgets" value="Names, icons, colors and budgets" to="/budgets" />
            <SettingsRow
              icon="download-outline"
              label="Import transactions"
              value="Add rows from an .xlsx file"
              onClick={() => useOverlay.getState().show({ kind: "import" })}
            />
            <ExportRow />
          </SettingsGroup>
          {SUPPORT_EMAIL && (
            <SettingsGroup title="Support">
              <SettingsRow icon="mail-outline" label="Contact support" value={SUPPORT_EMAIL} href={`mailto:${SUPPORT_EMAIL}?subject=PennyWise%20support`} />
            </SettingsGroup>
          )}
          <Button
            variant="destructive"
            disabled={signingOut}
            onClick={() => void signOut()}
            className="h-11 w-full rounded-full font-semibold active:scale-[0.98]"
          >
            <Icon name="log-out-outline" size={16} /> {signingOut ? "Signing out" : "Sign out"}
          </Button>
        </div>
      </div>
    </div>
  );
}
