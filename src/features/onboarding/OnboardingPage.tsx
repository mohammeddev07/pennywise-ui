import { motion, useReducedMotion } from "motion/react";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { AuthLayout } from "@/features/auth/AuthLayout";
import { useAuthStore } from "@/features/auth/store";
import { FIELD, rise, stagger } from "@/features/auth/ui/AuthForm";
import { parseOpeningBalance } from "@/features/books/openingBalance";
import { useBooksStore } from "@/features/books/store";
import { useSettingsStore } from "@/features/settings/store";
import * as authApi from "@/shared/api/auth";
import { getApiErrorMessage } from "@/shared/api/errors";
import { getAccountEpoch, isCurrentAccountEpoch } from "@/shared/session/accountEpoch";
import type { CurrencyCode } from "@/shared/types/models";
import { Icon } from "@/shared/ui/Icon";
import { Money } from "@/shared/ui/Money";
import { useDelayedFlag } from "@/shared/ui/utils/useDelayedFlag";
import { currencyMinorUnitDigits, currencySymbol } from "@/shared/utils/formatCurrency";

const CURRENCIES: { code: CurrencyCode; name: string }[] = [
  { code: "USD", name: "US Dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "Pound" },
  { code: "JPY", name: "Yen" },
  { code: "INR", name: "Indian Rupee" },
];

export function OnboardingPage() {
  const reduce = useReducedMotion();
  const id = useId();
  // Same source as mobile: the settings currency, already synced from the account's default on sign-in.
  const currency = useSettingsStore((s) => s.primaryCurrency);
  const setCurrency = useSettingsStore((s) => s.setPrimaryCurrency);
  const [balance, setBalance] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [apiError, setApiError] = useState("");
  const slow = useDelayedFlag(pending, 12_000);

  const digits = currencyMinorUnitDigits(currency);
  const openingBalanceMinor = parseOpeningBalance(balance.replace(/,/g, ""), currency);
  const balanceError =
    submitted && openingBalanceMinor === null
      ? digits === 0
        ? "Enter a whole number, like 1200."
        : `Enter an amount with up to ${digits} decimal places.`
      : undefined;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setSubmitted(true);
    setApiError("");
    if (openingBalanceMinor === null) return;
    const epoch = getAccountEpoch();
    setPending(true);
    try {
      // Mobile's sequence: create (or reuse) the book, save the account default, then finish onboarding.
      const bookId = await useBooksStore.getState().ensureBook({ name: "Personal", currencyCode: currency, openingBalanceMinor });
      const book = useBooksStore.getState().books.find((b) => b.id === bookId);
      const bookCurrency = (book?.currencyCode ?? currency) as CurrencyCode;
      const profile = await authApi.updateMe({ defaultCurrencyCode: bookCurrency });
      if (!isCurrentAccountEpoch(epoch)) return;
      useAuthStore.getState().setUser(profile);
      setCurrency((profile.defaultCurrencyCode ?? bookCurrency) as CurrencyCode);
      useAuthStore.getState().completeOnboarding();
    } catch (err) {
      setApiError(getApiErrorMessage(err, "Couldn't finish setup. Please try again."));
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthLayout homeLink={false}>
      <motion.form
        onSubmit={onSubmit}
        noValidate
        variants={stagger}
        initial={reduce ? false : "hidden"}
        animate="show"
        className="mx-auto w-full max-w-2xl px-4 pb-12 pt-6 sm:px-6 lg:pt-12"
      >
        <motion.div variants={rise}>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Pick your currency</h1>
          <p className="mt-2 text-muted-foreground">We will set up Personal, your first cash book.</p>
        </motion.div>

        <motion.fieldset variants={rise} disabled={pending} className="mt-8">
          <legend className="sr-only">Currency</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {CURRENCIES.map((c, i) => {
              const active = c.code === currency;
              return (
                <label
                  key={c.code}
                  className={cn(
                    "surface relative flex min-h-28 cursor-pointer flex-col rounded-xl p-4 transition-colors active:scale-[0.98]",
                    "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary",
                    active ? "border-primary" : "hover:border-border-strong",
                    i === CURRENCIES.length - 1 && "col-span-2 sm:col-span-1",
                  )}
                >
                  <input
                    type="radio"
                    name="currency"
                    value={c.code}
                    checked={active}
                    onChange={() => setCurrency(c.code)}
                    className="sr-only"
                  />
                  <span aria-hidden className={cn("money text-2xl font-semibold", active && "text-primary")}>
                    {currencySymbol(c.code)}
                  </span>
                  <span className="mt-auto pt-4 font-semibold">{c.code}</span>
                  <span className="text-xs text-muted-foreground">{c.name}</span>
                  {active && (
                    <motion.span
                      layoutId={`${id}-check`}
                      transition={{ type: "spring", stiffness: 420, damping: 32 }}
                      className="absolute right-3 top-3 grid size-6 place-items-center rounded-full bg-primary text-primary-foreground"
                    >
                      <Icon name="checkmark" size={14} weight="bold" />
                    </motion.span>
                  )}
                </label>
              );
            })}
          </div>
        </motion.fieldset>

        <motion.p variants={rise} className="mt-4 flex items-start gap-3 rounded-lg bg-surface-2 px-4 py-3 text-sm text-muted-foreground">
          <Icon name="lock-closed-outline" size={16} className="mt-0.5 shrink-0" />
          A book&apos;s currency is permanent. Amounts are stored as entered, with no exchange rates.
        </motion.p>

        <motion.div variants={rise} className="mt-8 grid max-w-sm gap-2">
          <Label htmlFor={`${id}-balance`}>Starting balance (optional)</Label>
          <div className="relative">
            <span aria-hidden className="money pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
              {currencySymbol(currency)}
            </span>
            <Input
              id={`${id}-balance`}
              inputMode="decimal"
              autoComplete="off"
              placeholder={digits === 0 ? "0" : "0.00"}
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              disabled={pending}
              aria-invalid={!!balanceError}
              aria-describedby={`${id}-balance-note`}
              className={cn(FIELD, "money pl-9")}
            />
          </div>
          <p id={`${id}-balance-note`} className={cn("text-sm", balanceError ? "text-expense" : "text-subtle")}>
            {balanceError ??
              (openingBalanceMinor ? (
                <>
                  Personal opens at <Money amountMinor={openingBalanceMinor} currency={currency} kind="balance" />
                </>
              ) : (
                "Becomes the opening balance of your Personal book."
              ))}
          </p>
        </motion.div>

        <motion.div variants={rise} className="mt-10 grid gap-3">
          {apiError && (
            <p role="alert" className="rounded-lg bg-expense-soft px-4 py-3 text-sm text-expense">
              {apiError}
            </p>
          )}
          <Button
            type="submit"
            disabled={pending}
            className="glow h-12 rounded-full px-10 text-base font-semibold active:scale-[0.98] sm:justify-self-start"
          >
            {pending ? "Setting up your book" : apiError ? "Try again" : "Continue"}
          </Button>
          {slow && (
            <p aria-live="polite" className="text-sm text-muted-foreground">
              Waking up the server, this can take up to a minute.
            </p>
          )}
        </motion.div>
      </motion.form>
    </AuthLayout>
  );
}
