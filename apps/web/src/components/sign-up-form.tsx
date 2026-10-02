"use client";

import { Button } from "@KLTN/ui/components/button";
import { Input } from "@KLTN/ui/components/input";
import { Label } from "@KLTN/ui/components/label";
import { useForm } from "@tanstack/react-form";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, UserRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";

import AuthCard from "@/components/auth-card";
import { authClient } from "@/lib/auth-client";
import { resolveAuthReturnTo } from "@/lib/auth-return-to";

function getSignUpErrorMessage(code?: string) {
  switch (code) {
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "Email này đã được đăng ký. Hãy đăng nhập hoặc dùng email khác.";
    case "INVALID_NAME":
      return "Họ và tên cần có ít nhất 2 ký tự.";
    case "INVALID_EMAIL":
      return "Vui lòng nhập địa chỉ email hợp lệ.";
    case "PASSWORD_TOO_SHORT":
      return "Mật khẩu cần có ít nhất 8 ký tự.";
    default:
      return "Chưa thể tạo tài khoản. Vui lòng thử lại.";
  }
}

function getPasswordStrength(password: string): {
  level: 0 | 1 | 2 | 3 | 4;
  label: string;
} {
  if (!password) return { level: 0, label: "" };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  const level = Math.min(4, Math.max(1, Math.ceil(score / 1.25))) as 1 | 2 | 3 | 4;
  const labels: Record<1 | 2 | 3 | 4, string> = {
    1: "Yếu",
    2: "Trung bình",
    3: "Khá mạnh",
    4: "Mạnh",
  };
  return { level, label: labels[level] };
}

export default function SignUpForm({
  onSwitchToSignIn,
  returnTo,
}: {
  onSwitchToSignIn: () => void;
  returnTo: string;
}) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
      name: "",
    },
    onSubmit: async ({ value }) => {
      await authClient.signUp.email(
        {
          email: value.email,
          password: value.password,
          name: value.name,
        },
        {
          onSuccess: () => {
            router.push(resolveAuthReturnTo(returnTo) as Route);
            toast.success("Tạo tài khoản thành công");
          },
          onError: (error) => {
            toast.error(getSignUpErrorMessage(error.error.code));
          },
        },
      );
    },
    validators: {
      onSubmit: z.object({
        name: z.string().min(2, "Họ và tên cần có ít nhất 2 ký tự"),
        email: z.email("Địa chỉ email không hợp lệ"),
        password: z.string().min(8, "Mật khẩu cần có ít nhất 8 ký tự"),
      }),
    },
  });

  return (
    <AuthCard
      title="Tạo tài khoản"
      subtitle="Bắt đầu hành trình khám phá Hà Giang của bạn."
      footer={
        <div className="auth-card-footer">
          <div className="auth-divider"><span>hoặc</span></div>
          <p>
            Đã có tài khoản?{" "}
            <button type="button" className="auth-text-button" onClick={onSwitchToSignIn}>
              Đăng nhập
            </button>
          </p>
        </div>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          form.handleSubmit();
        }}
        className="auth-form"
        noValidate
      >
        <form.Field name="name">
          {(field) => {
            const hasErrors = field.state.meta.errors.length > 0;
            const errorId = `${field.name}-error`;
            return (
              <div className="auth-field">
                <Label className="auth-label" htmlFor={field.name}>Họ và tên</Label>
                <div className="auth-input-wrap">
                  <UserRound className="auth-input-icon" size={20} aria-hidden="true" />
                  <Input
                    className="auth-input"
                    id={field.name}
                    name={field.name}
                    type="text"
                    autoComplete="name"
                    placeholder="Nhập họ và tên của bạn"
                    aria-required="true"
                    aria-invalid={hasErrors}
                    aria-describedby={hasErrors ? errorId : undefined}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                </div>
                {hasErrors && <p id={errorId} role="alert" className="auth-field-error">{field.state.meta.errors.map((error) => error?.message).join(" ")}</p>}
              </div>
            );
          }}
        </form.Field>

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
                    onChange={(event) => field.handleChange(event.target.value)}
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
            const strength = getPasswordStrength(field.state.value);
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
                    autoComplete="new-password"
                    placeholder="Nhập mật khẩu của bạn"
                    aria-required="true"
                    aria-invalid={hasErrors}
                    aria-describedby={hasErrors ? errorId : "password-help"}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
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
                {hasErrors ? (
                  <p id={errorId} role="alert" className="auth-field-error">{field.state.meta.errors.map((error) => error?.message).join(" ")}</p>
                ) : (
                  <div id="password-help" className="auth-password-strength" aria-live="polite">
                    <div className="auth-strength-bars" aria-hidden="true">
                      {([1, 2, 3, 4] as const).map((bar) => (
                        <span
                          key={bar}
                          className="auth-strength-bar"
                          data-active={strength.level >= bar ? "true" : "false"}
                          data-level={strength.level}
                        />
                      ))}
                    </div>
                    <span
                      className="auth-strength-label"
                      data-level={strength.level || undefined}
                    >
                      {strength.label || "Mật khẩu phải có ít nhất 8 ký tự."}
                    </span>
                  </div>
                )}
              </div>
            );
          }}
        </form.Field>

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
              <span>{isSubmitting ? "Đang tạo tài khoản…" : "Tạo tài khoản"}</span>
              {!isSubmitting && <ArrowRight size={20} aria-hidden="true" />}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </AuthCard>
  );
}
