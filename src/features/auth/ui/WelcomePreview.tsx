import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { BookGlyph } from "@/features/books/ui/BookSwitcher";
import { CategoryIcon } from "@/shared/ui/Icon";
import { AnimatedMoney, Money } from "@/shared/ui/Money";
import { Segmented } from "@/shared/ui/Segmented";
import { formatCurrency } from "@/shared/utils/formatCurrency";

/** Sample data only. Two books in two currencies so the switcher shows what "multi-book" means. */
const BOOKS = [
  {
    id: "personal",
    name: "Personal",
    icon: "book",
    color: "green",
    currency: "USD",
    balance: 482_317,
    income: 324_000,
    spent: 118_642,
    rows: [
      { title: "Paycheck", category: "Salary", icon: "cash-outline", color: "#9BD881", amount: 285_000, income: true },
      { title: "Corner Grocer", category: "Groceries", icon: "basket-outline", color: "#FFB35C", amount: 6_418 },
      { title: "Flat white", category: "Cafe", icon: "cafe-outline", color: "#B49CFF", amount: 540 },
    ],
    budget: { name: "Dining out", icon: "fast-food-outline", color: "#FF9ECF", spent: 14_230, limit: 20_000 },
  },
  {
    id: "freelance",
    name: "Freelance",
    icon: "briefcase",
    color: "blue",
    currency: "EUR",
    balance: 1_276_050,
    income: 640_000,
    spent: 92_480,
    rows: [
      { title: "Client invoice", category: "Design work", icon: "wallet-outline", color: "#6FE5C9", amount: 320_000, income: true },
      { title: "Font license", category: "Software", icon: "card-outline", color: "#7EA6FF", amount: 4_900 },
      { title: "Train to a workshop", category: "Travel", icon: "airplane-outline", color: "#7FD4E8", amount: 3_870 },
    ],
    budget: { name: "Software", icon: "card-outline", color: "#7EA6FF", spent: 6_198, limit: 10_000 },
  },
] as const;

type BookId = (typeof BOOKS)[number]["id"];
const spring = { type: "spring", stiffness: 320, damping: 30 } as const;

/** A working miniature of Home built from the real components, fed with clearly labeled sample data. */
export function WelcomePreview() {
  const reduce = useReducedMotion();
  const [bookId, setBookId] = useState<BookId>("personal");
  const book = BOOKS.find((b) => b.id === bookId)!;
  const left = book.budget.limit - book.budget.spent;
  const enter = (delay: number) =>
    reduce ? {} : { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { ...spring, delay } };

  return (
    <section aria-label="Preview with sample data" className="relative w-full">
      <motion.div {...enter(0.18)} className="surface rounded-2xl p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented
            label="Sample book"
            value={bookId}
            onChange={setBookId}
            options={BOOKS.map((b) => ({ value: b.id, label: b.name }))}
          />
          <span className="text-xs text-subtle">Sample data</span>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <BookGlyph book={book} size={28} />
          <p className="text-sm text-muted-foreground">Balance in {book.name}</p>
        </div>
        <AnimatedMoney
          key={book.id}
          amountMinor={book.balance}
          currency={book.currency}
          className="mt-2 block text-4xl font-semibold sm:text-5xl"
        />

        <dl className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-surface-2 px-4 py-3">
            <dt className="text-xs text-muted-foreground">Income this month</dt>
            <dd className="mt-1 text-lg font-semibold">
              <Money amountMinor={book.income} currency={book.currency} kind="income" />
            </dd>
          </div>
          <div className="rounded-lg bg-surface-2 px-4 py-3">
            <dt className="text-xs text-muted-foreground">Spent this month</dt>
            <dd className="mt-1 text-lg font-semibold">
              <Money amountMinor={book.spent} currency={book.currency} kind="expense" />
            </dd>
          </div>
        </dl>
      </motion.div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[1.4fr_1fr] lg:ml-10 lg:-mr-4">
        <motion.div {...enter(0.28)} className="surface rounded-xl p-2">
          <p className="px-3 pb-1 pt-2 text-sm font-semibold">Recent</p>
          <ul key={book.id}>
            {book.rows.map((r, i) => (
              <motion.li
                key={r.title}
                initial={reduce ? false : { opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...spring, delay: i * 0.035 }}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5"
              >
                <CategoryIcon icon={r.icon} color={r.color} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{r.category}</p>
                </div>
                <Money
                  amountMinor={r.amount}
                  currency={book.currency}
                  kind={"income" in r ? "income" : "expense"}
                  className="text-sm font-semibold"
                />
              </motion.li>
            ))}
          </ul>
        </motion.div>

        <motion.div {...enter(0.36)} className="surface flex flex-col rounded-xl p-4">
          <div className="flex items-center gap-3">
            <CategoryIcon icon={book.budget.icon} color={book.budget.color} size={36} />
            <p className="text-sm font-semibold">{book.budget.name}</p>
          </div>
          <p className="mt-auto pt-6 text-2xl font-semibold">
            <Money amountMinor={left} currency={book.currency} />
          </p>
          <p className="text-xs text-muted-foreground">
            left of {formatCurrency(book.budget.limit, book.currency)} this month
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
            <motion.div
              key={book.id}
              className="h-full origin-left rounded-full bg-primary"
              initial={reduce ? false : { scaleX: 0 }}
              animate={{ scaleX: book.budget.spent / book.budget.limit }}
              transition={{ ...spring, delay: reduce ? 0 : 0.45 }}
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
