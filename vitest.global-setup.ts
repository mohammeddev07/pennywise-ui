export function setup() {
  // Same as pennywise-mobile: a non-UTC zone makes any toISOString().slice(0, 10) date bug fail.
  process.env.TZ = "Asia/Tokyo";
}
