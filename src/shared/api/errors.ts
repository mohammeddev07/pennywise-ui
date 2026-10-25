import axios from "axios";

import type { ApiErrorResponse } from "@/shared/types/api";

export function getApiErrorCode(error: unknown) {
  if (!axios.isAxiosError<ApiErrorResponse>(error)) return undefined;
  const body = error.response?.data;
  return typeof body?.error === "string" ? body.error : body?.error?.code;
}

export function getApiErrorMessage(error: unknown, fallback = "Something went wrong. Please try again.") {
  if (axios.isAxiosError<ApiErrorResponse>(error)) {
    if (!error.response) {
      if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
        return "Server is taking longer than usual to respond. Please try again in a moment.";
      }
      return "Can't connect to server. Check your internet connection.";
    }
    const body = error.response.data;
    return (typeof body?.error === "object" ? body.error?.message : undefined) || body?.message || fallback;
  }
  return fallback;
}

export function getAuthErrorMessage(error: unknown) {
  const code = getApiErrorCode(error);
  if (code === "INVALID_CREDENTIALS") return "Incorrect email or password";
  if (code === "EMAIL_ALREADY_REGISTERED") return "An account with this email already exists";
  if (code === "GOOGLE_ACCOUNT_LINK_REQUIRED")
    return "This email already has an account. Log in with your password, then connect Google in Profile.";
  if (code === "GOOGLE_SIGN_IN_NOT_CONFIGURED") return "Google sign-in isn't set up on the server yet.";
  return getApiErrorMessage(error);
}
