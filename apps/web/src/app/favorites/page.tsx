import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { requireActor } from "@/server/authorization/guard";
import { authorizationDependencies } from "@/server/authorization/server";
import { AppError } from "@/server/http/app-error";
import { buildAuthLoginHref } from "@/lib/auth-return-to";
import AccessDenied from "@/components/access-denied";
import FavoritesView from "./favorites-view";
export default async function FavoritesPage() {
  const allowed=await requireActor(await headers(),authorizationDependencies,"traveler").then(()=>true).catch((error:unknown)=>{
    if(error instanceof AppError && error.status===401) redirect(buildAuthLoginHref("/favorites") as Route);
    if(error instanceof AppError && error.status===403) return false;
    throw error;
  });
  return allowed ? <FavoritesView/> : <AccessDenied/>;
}
