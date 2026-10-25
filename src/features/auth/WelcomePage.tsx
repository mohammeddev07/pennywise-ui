import { motion, useReducedMotion } from "motion/react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/shared/ui/Icon";
import { AuthLayout } from "./AuthLayout";
import { rise, stagger } from "./ui/AuthForm";
import { WelcomePreview } from "./ui/WelcomePreview";

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "book-outline",
    title: "A book for each part of your life",
    body: "Keep personal, business and travel money apart. Up to 10 books, each in its own currency.",
  },
  {
    icon: "wallet-outline",
    title: "Monthly budgets",
    body: "Set a limit per category and see what is left before you spend it.",
  },
  {
    icon: "bar-chart-outline",
    title: "Insights and spreadsheets",
    body: "Compare months and years. Import or export .xlsx anytime.",
  },
];

export function WelcomePage() {
  const reduce = useReducedMotion();
  return (
    <AuthLayout>
      <div className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-4 pb-12 pt-6 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16 lg:px-10 lg:pb-10 lg:pt-2">
        <motion.div variants={stagger} initial={reduce ? false : "hidden"} animate="show" className="max-w-xl">
          <motion.h1
            variants={rise}
            className="text-[2.5rem] font-semibold leading-[1.05] tracking-tight text-balance sm:text-5xl"
          >
            Your money, clear at a glance.
          </motion.h1>
          <motion.p variants={rise} className="mt-5 max-w-[40ch] text-lg text-muted-foreground">
            Log income and expenses in seconds, set monthly budgets, and see where your money goes.
          </motion.p>
          <motion.div variants={rise} className="mt-8 grid gap-3 sm:flex">
            <Button asChild className="glow h-12 rounded-full px-7 text-base font-semibold active:scale-[0.98]">
              <Link to="/signup">Create account</Link>
            </Button>
            <Button asChild variant="outline" className="h-12 rounded-full px-7 text-base font-semibold active:scale-[0.98]">
              <Link to="/login">Log in</Link>
            </Button>
          </motion.div>
        </motion.div>

        <WelcomePreview />
      </div>

      <section aria-label="What PennyWise does" className="mx-auto w-full max-w-6xl px-4 pb-12 sm:px-6 lg:px-10">
        <ul className="grid gap-8 border-t border-border pt-8 md:grid-cols-[1.35fr_1fr_1fr] md:gap-10">
          {FEATURES.map((f, i) => (
            <motion.li
              key={f.title}
              initial={reduce ? false : { opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ type: "spring", stiffness: 320, damping: 30, delay: i * 0.04 }}
              className="flex gap-4"
            >
              <span
                className={cn(
                  "grid size-10 shrink-0 place-items-center rounded-lg",
                  i === 0 ? "bg-primary text-primary-foreground" : "bg-primary-soft text-primary",
                )}
              >
                <Icon name={f.icon} size={20} weight="duotone" />
              </span>
              <div>
                <h2 className={cn("font-semibold", i === 0 && "text-lg leading-snug")}>{f.title}</h2>
                <p className="mt-1 max-w-[38ch] text-sm text-muted-foreground">{f.body}</p>
              </div>
            </motion.li>
          ))}
        </ul>
      </section>
    </AuthLayout>
  );
}
