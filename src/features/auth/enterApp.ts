import { useAuthStore } from "./store";
import { useBooksStore } from "@/features/books/store";

/** After any sign-in: an account with books skips onboarding. Route guards then pick the destination. */
export async function enterApp() {
  const books = await useBooksStore.getState().loadBooks();
  if (books.length > 0) useAuthStore.getState().completeOnboarding();
}
