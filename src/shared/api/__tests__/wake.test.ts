import { AxiosError, AxiosHeaders } from "axios";
import { isWakeError } from "../client";
import { backoffDelay } from "../wake";

const response = (status: number, data: unknown) =>
  new AxiosError("x", "ERR_BAD_RESPONSE", undefined, undefined, {
    status,
    data,
    statusText: "",
    headers: {},
    config: { headers: new AxiosHeaders() },
  });

it("backs off 1, 2, 4, 8 then caps at 10 seconds, within +-20% jitter", () => {
  expect([0, 1, 2, 3, 4, 9].map((n) => backoffDelay(n, () => 0.5))).toEqual([1000, 2000, 4000, 8000, 10000, 10000]);
  expect(backoffDelay(0, () => 0)).toBe(800);
  expect(backoffDelay(9, () => 1)).toBe(12000);
});

it("treats hosting-layer failures as a sleeping backend, but not real API errors", () => {
  expect(isWakeError(new AxiosError("Network Error", "ERR_NETWORK"))).toBe(true);
  expect(isWakeError(new AxiosError("timeout", "ECONNABORTED"))).toBe(true);
  expect(isWakeError(response(502, "<html>Bad gateway</html>"))).toBe(true);
  expect(isWakeError(response(503, { error: { code: "OVERLOADED", message: "busy" } }))).toBe(false);
  expect(isWakeError(response(404, { error: { code: "NOT_FOUND", message: "x" } }))).toBe(false);
  expect(isWakeError(new AxiosError("canceled", "ERR_CANCELED"))).toBe(false);
  expect(isWakeError(new Error("plain"))).toBe(false);
});
