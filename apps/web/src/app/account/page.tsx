import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { buildAuthLoginHref } from "@/lib/auth-return-to";
import { accountDependencies } from "@/modules/account/account-server";
import { readAccount } from "@/modules/account/account-service";
import AccountProfile from "./account-profile";
import "./account.css";

export default async function AccountPage() {
  const session = await accountDependencies.resolveSession(await headers());
  if (!session?.user) redirect(buildAuthLoginHref("/account") as Route);
  const account = await readAccount(session.user.id, accountDependencies.database);
  return <AccountProfile initialAccount={account} />;
}
