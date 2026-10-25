import { isTokenExpired } from "../token";

const jwt = (payload: object) => `x.${btoa(JSON.stringify(payload)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")}.sig`;
const now = 1_800_000_000_000;

it("valid token", () => expect(isTokenExpired(jwt({ exp: now / 1000 + 3600 }), 30, now)).toBe(false));
it("expired token", () => expect(isTokenExpired(jwt({ exp: now / 1000 - 1 }), 30, now)).toBe(true));
it("inside skew counts as expired", () => expect(isTokenExpired(jwt({ exp: now / 1000 + 10 }), 30, now)).toBe(true));
it("malformed", () => {
  expect(isTokenExpired("mock-access-token")).toBe(true);
  expect(isTokenExpired("a.%%%.c")).toBe(true);
});
it("no exp", () => expect(isTokenExpired(jwt({ sub: "u" }), 30, now)).toBe(true));
