import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { buildAuthLoginHref } from "@/lib/auth-return-to";
import { accountDependencies } from "@/modules/account/account-server";
import { getAccount } from "@/modules/account/account-service";
import { AppError } from "@/server/http/app-error";
import AccessDenied from "@/components/access-denied";
import AccountProfile from "./account-profile";
import "./account.css";

export default async function AccountPage() {
  const account = await getAccount(await headers(), accountDependencies).catch((error: unknown) => {
    if (error instanceof AppError && error.status === 401) redirect(buildAuthLoginHref("/account") as Route);
    if (error instanceof AppError && error.status === 403) return null;
    throw error;
  });
  if (!account) return <AccessDenied />;
  return <AccountProfile initialAccount={account} />;
}
