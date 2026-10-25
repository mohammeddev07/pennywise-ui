import { parseOpeningBalance as parse } from "../openingBalance";
it.each([
  ["", "USD", 0],
  ["-0.10", "USD", -10],
  ["0.29", "USD", 29],
  ["100", "JPY", 100],
  ["-1.234", "KWD", -1234],
  ["90071992547409.91", "USD", Number.MAX_SAFE_INTEGER],
  ["-9007199254740.991", "KWD", -Number.MAX_SAFE_INTEGER],
  ["9007199254740991", "JPY", Number.MAX_SAFE_INTEGER],
  ["000000000000000000001.00", "USD", 100],
])("parses %s exactly in %s", (raw, currency, expected) =>
  expect(parse(raw as string, currency as string)).toBe(expected),
);
it.each([
  ["1.01", "JPY"],
  ["1.2345", "KWD"],
  ["1.001", "USD"],
  ["90071992547409.92", "USD"],
  ["-9007199254740.992", "KWD"],
  ["1e3", "USD"],
  ["NaN", "USD"],
  ["1,000", "USD"],
  ["--1", "USD"],
  ["-", "USD"],
])("rejects invalid or unsafe %s in %s", (raw, currency) =>
  expect(parse(raw, currency)).toBeNull(),
);
