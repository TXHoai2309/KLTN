import type { Metadata } from "next";
import AuthModeSwitcher from "./auth-mode-switcher";
import { resolveAuthReturnTo } from "@/lib/auth-return-to";

export const metadata: Metadata = {
  title: "Đăng nhập | Hà Giang Travel Assistant",
};

type LoginPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { returnTo, mode } = await searchParams;

  return (
    <AuthModeSwitcher
      initialMode={mode === "signup" ? "signup" : "signin"}
      returnTo={resolveAuthReturnTo(returnTo)}
    />
  );
}
