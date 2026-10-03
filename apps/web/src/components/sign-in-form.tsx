"use client";

import { Button } from "@KLTN/ui/components/button";
import { Input } from "@KLTN/ui/components/input";
import { Label } from "@KLTN/ui/components/label";
import { useForm } from "@tanstack/react-form";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import z from "zod";

import AuthCard from "@/components/auth-card";
import { authClient } from "@/lib/auth-client";
import { resolveAuthReturnTo } from "@/lib/auth-return-to";
import { recoverSignInAfterTransportFailure } from "@/lib/sign-in-recovery";

const GENERIC_SIGN_IN_ERROR = "Không thể đăng nhập lúc này. Vui lòng thử lại.";
const UNKNOWN_SIGN_IN_ERROR =
  "Chưa thể xác định trạng thái đăng nhập. Hãy mở /dashboard để kiểm tra phiên trước khi thử lại.";

function getSignInErrorMessage(code?: string) {
  if (code === "INVALID_EMAIL_OR_PASSWORD") {
    return "Email hoặc mật khẩu không chính xác.";
  }

  return GENERIC_SIGN_IN_ERROR;
}

export default function SignInForm({
  onSwitchToSignUp,
  returnTo,
}: {
  onSwitchToSignUp: () => void;
  returnTo: string;
}) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const submissionInProgress = useRef(false);

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      setAuthError(null);

      try {
        await authClient.signIn.email(
          {
            email: value.email,
            password: value.password,
          },
          {
            onSuccess: () => {
              router.push(resolveAuthReturnTo(returnTo) as Route);
              toast.success("Đăng nhập thành công");
            },
            onError: (error) => {
              setAuthError(getSignInErrorMessage(error.error.code));
            },
          },
        );
      } catch {
        const recovery = await recoverSignInAfterTransportFailure(() => authClient.getSession());

        if (recovery === "authenticated") {
          router.push(resolveAuthReturnTo(returnTo) as Route);
          return;
        }

        if (recovery === "unknown") {
          setAuthError(UNKNOWN_SIGN_IN_ERROR);
          return;
        }

        setAuthError(GENERIC_SIGN_IN_ERROR);
      }
    },
    validators: {
      onSubmit: z.object({
        email: z
          .string()
          .min(1, "Vui lòng nhập email.")
          .pipe(z.email("Email không hợp lệ.")),
        password: z
          .string()
          .min(1, "Vui lòng nhập mật khẩu.")
          .pipe(z.string().min(8, "Mật khẩu phải có ít nhất 8 ký tự.")),
      }),
    },
  });

  return (
    <AuthCard
      title="Chào mừng trở lại"
      subtitle="Đăng nhập để tiếp tục hành trình của bạn."
      footer={
        <div className="auth-card-footer">
          <div className="auth-divider"><span>hoặc</span></div>
          <p>
            Chưa có tài khoản?{" "}
            <button type="button" className="auth-text-button" onClick={onSwitchToSignUp}>
              Đăng ký
            </button>
          </p>
        </div>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (submissionInProgress.current) return;

          submissionInProgress.current = true;
          void form.handleSubmit().then(
            () => {
              submissionInProgress.current = false;
            },
            () => {
              submissionInProgress.current = false;
              setAuthError(GENERIC_SIGN_IN_ERROR);
            },
          );
        }}
        className="auth-form"
        noValidate
      >
        <form.Field name="email">
          {(field) => {
            const hasErrors = field.state.meta.errors.length > 0;
            const errorId = `${field.name}-error`;
            return (
              <div className="auth-field">
                <Label className="auth-label" htmlFor={field.name}>Email</Label>
                <div className="auth-input-wrap">
                  <Mail className="auth-input-icon" size={20} aria-hidden="true" />
                  <Input
                    className="auth-input"
                    id={field.name}
                    name={field.name}
                    type="email"
                    autoComplete="email"
                    placeholder="Nhập địa chỉ email của bạn"
                    aria-required="true"
                    aria-invalid={hasErrors}
                    aria-describedby={hasErrors ? errorId : undefined}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => {
                      setAuthError(null);
                      field.handleChange(event.target.value);
                    }}
                  />
                </div>
                {hasErrors && <p id={errorId} role="alert" className="auth-field-error">{field.state.meta.errors.map((error) => error?.message).join(" ")}</p>}
              </div>
            );
          }}
        </form.Field>

        <form.Field name="password">
          {(field) => {
            const hasErrors = field.state.meta.errors.length > 0;
            const errorId = `${field.name}-error`;
            return (
              <div className="auth-field">
                <Label className="auth-label" htmlFor={field.name}>Mật khẩu</Label>
                <div className="auth-input-wrap">
                  <LockKeyhole className="auth-input-icon" size={20} aria-hidden="true" />
                  <Input
                    className="auth-input auth-input-password"
                    id={field.name}
                    name={field.name}
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Nhập mật khẩu của bạn"
                    aria-required="true"
                    aria-invalid={hasErrors}
                    aria-describedby={hasErrors ? errorId : undefined}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => {
                      setAuthError(null);
                      field.handleChange(event.target.value);
                    }}
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                  </button>
                </div>
                {hasErrors && <p id={errorId} role="alert" className="auth-field-error">{field.state.meta.errors.map((error) => error?.message).join(" ")}</p>}
              </div>
            );
          }}
        </form.Field>

        <div className="auth-form-feedback">
          {authError && (
            <p id="sign-in-error" role="alert" className="auth-form-error">
              {authError}
            </p>
          )}
        </div>

        <form.Subscribe
          selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}
        >
          {({ canSubmit, isSubmitting }) => (
            <Button
              type="submit"
              className="auth-submit w-full"
              disabled={!canSubmit || isSubmitting}
              aria-busy={isSubmitting}
            >
              <span>{isSubmitting ? "Đang đăng nhập…" : "Đăng nhập"}</span>
              {!isSubmitting && <ArrowRight size={20} aria-hidden="true" />}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </AuthCard>
  );
}
