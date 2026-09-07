import type {
  AcceptedResponseDto,
  AuthSessionResponseDto,
  LoginBodyDto,
  MfaCodeBodyDto,
  MfaEnrollmentResponseDto,
  PasswordResetConfirmBodyDto,
  PasswordResetRequestBodyDto,
  RegisterBodyDto,
  VerificationConfirmBodyDto,
  VerificationRequestBodyDto,
} from "@repo/contracts";
import type { ContractRequestClient } from "./contract-client.js";

export function createAuthApi(client: ContractRequestClient) {
  return {
    register(body: RegisterBodyDto): Promise<AuthSessionResponseDto> {
      return client.request("/api/v1/auth/register", { method: "POST", body });
    },

    login(body: LoginBodyDto): Promise<AuthSessionResponseDto> {
      return client.request("/api/v1/auth/login", { method: "POST", body });
    },

    refresh(): Promise<AuthSessionResponseDto> {
      return client.request("/api/v1/auth/refresh", { method: "POST" });
    },

    getSession(): Promise<AuthSessionResponseDto> {
      return client.request("/api/v1/auth/session");
    },

    logout(): Promise<AcceptedResponseDto> {
      return client.request("/api/v1/auth/logout", { method: "POST" });
    },

    logoutAll(): Promise<AcceptedResponseDto> {
      return client.request("/api/v1/auth/logout-all", { method: "POST" });
    },

    requestPasswordReset(body: PasswordResetRequestBodyDto): Promise<AcceptedResponseDto> {
      return client.request("/api/v1/auth/password-reset/request", { method: "POST", body });
    },

    confirmPasswordReset(body: PasswordResetConfirmBodyDto): Promise<AcceptedResponseDto> {
      return client.request("/api/v1/auth/password-reset/confirm", { method: "POST", body });
    },

    requestVerification(body: VerificationRequestBodyDto): Promise<AcceptedResponseDto> {
      return client.request("/api/v1/auth/verification/request", { method: "POST", body });
    },

    confirmVerification(body: VerificationConfirmBodyDto): Promise<AcceptedResponseDto> {
      return client.request("/api/v1/auth/verification/confirm", { method: "POST", body });
    },

    beginTotpEnrollment(): Promise<MfaEnrollmentResponseDto> {
      return client.request("/api/v1/auth/mfa/totp/enroll", { method: "POST" });
    },

    confirmTotpEnrollment(body: MfaCodeBodyDto): Promise<AcceptedResponseDto> {
      return client.request("/api/v1/auth/mfa/totp/confirm", { method: "POST", body });
    },

    challengeTotp(body: MfaCodeBodyDto): Promise<AuthSessionResponseDto> {
      return client.request("/api/v1/auth/mfa/challenge", { method: "POST", body });
    },
  };
}

export type AuthApi = ReturnType<typeof createAuthApi>;
