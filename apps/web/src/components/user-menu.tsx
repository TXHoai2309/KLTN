"use client";
import { hasRolePermission } from "@/lib/authorization-capabilities";
import { mvpFeatures } from "@/lib/mvp-features";

import { Suspense, useRef, useState } from "react";
import { Button } from "@KLTN/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@KLTN/ui/components/dropdown-menu";
import { Skeleton } from "@KLTN/ui/components/skeleton";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { BookOpen, ChevronDown, FileText, Heart, LogOut, MapPin, User, Users } from "lucide-react";

import { authClient } from "@/lib/auth-client";
import { claimSubmission, releaseSubmission } from "@/lib/auth-submission-guard";
import { isSignOutConfirmed } from "@/lib/sign-out-confirmation";
import { fetchAuthWithTimeout } from "@/lib/auth-fetch";
import { buildCurrentPageLoginHref } from "@/lib/auth-return-to";

const SIGN_OUT_ERROR = "Không thể xác nhận đăng xuất. Phiên của bạn có thể vẫn còn hoạt động. Vui lòng thử lại.";

function GuestSignInLink() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  return (
    <Link href={buildCurrentPageLoginHref(pathname, search ? `?${search}` : "")}>
      <Button variant="outline" className="h-9 rounded-full border-border/80 px-4 text-xs font-semibold hover:border-emerald-700/40 hover:bg-emerald-50 dark:hover:bg-emerald-950/40">
        Sign In
      </Button>
    </Link>
  );
}

export default function UserMenu() {
  const { data: session, isPending, error, refetch } = authClient.useSession();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const signOutInProgress = useRef(false);

  async function handleSignOut() {
    if (!claimSubmission(signOutInProgress)) return;

    setIsSigningOut(true);
    setSignOutError(null);

    try {
      const confirmed = await isSignOutConfirmed(() =>
        fetchAuthWithTimeout("/api/session/logout", { method: "POST", credentials: "same-origin" }),
      );
      if (!confirmed) {
        setSignOutError(SIGN_OUT_ERROR);
        return;
      }

      window.location.replace("/");
    } catch {
      setSignOutError(SIGN_OUT_ERROR);
    } finally {
      releaseSubmission(signOutInProgress);
      setIsSigningOut(false);
    }
  }

  if (isPending) {
    return <Skeleton className="h-9 w-24 rounded-full" />;
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-sm" role="alert">
        <span>Không thể kiểm tra phiên.</span>
        <Button variant="outline" className="rounded-full" onClick={() => void refetch()}>Thử lại</Button>
      </div>
    );
  }

  if (!session) {
    return (
      <Suspense fallback={<Link href="/login"><Button variant="outline" className="rounded-full">Sign In</Button></Link>}>
        <GuestSignInLink />
      </Suspense>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            className="user-menu-trigger h-9 gap-2 rounded-full border-border/80 bg-card px-2.5 py-1 text-xs font-semibold shadow-xs transition-all hover:border-emerald-700/40 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30"
          />
        }
      >
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-[11px] font-bold text-white shadow-xs">
          {session.user.name.charAt(0).toUpperCase()}
        </span>
        <span className="max-w-[120px] truncate sm:max-w-[160px] text-foreground font-semibold">
          {session.user.name}
        </span>
        <ChevronDown className="size-3.5 opacity-60 transition-transform duration-200" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-64 rounded-xl border border-border/70 bg-card p-1.5 shadow-xl">
        <DropdownMenuGroup>
          <div className="flex items-center gap-2.5 rounded-lg bg-muted/40 p-2.5 mb-1 border border-border/40">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-sm font-bold text-white shadow-xs">
              {session.user.name.charAt(0).toUpperCase()}
            </span>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-xs text-foreground truncate">{session.user.name}</span>
                {session.user.role === "ADMIN" && (
                  <span className="rounded bg-emerald-100 px-1 py-0.2 text-[9px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    Admin
                  </span>
                )}
              </div>
              <span className="text-[11px] text-muted-foreground truncate">{session.user.email}</span>
            </div>
          </div>
          <DropdownMenuSeparator className="my-1 border-border/40" />
          <DropdownMenuItem className="cursor-pointer rounded-lg px-2.5 py-2 text-xs font-medium" render={<Link href="/account" />}>
            <User className="size-3.5 text-muted-foreground mr-2" />
            <span>Thông tin tài khoản</span>
          </DropdownMenuItem>
          {hasRolePermission(session.user.role, "traveler") && (
            <DropdownMenuItem className="cursor-pointer rounded-lg px-2.5 py-2 text-xs font-medium" render={<Link href="/favorites" />}>
              <Heart className="size-3.5 text-muted-foreground mr-2" />
              <span>Yêu thích</span>
            </DropdownMenuItem>
          )}
          {session.user.role === "ADMIN" && (
            <>
              <div className="px-2.5 pt-2 pb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                Quản trị hệ thống
              </div>
              <DropdownMenuItem className="cursor-pointer rounded-lg px-2.5 py-2 text-xs font-medium" render={<Link href="/admin/destinations" />}>
                <MapPin className="size-3.5 text-muted-foreground mr-2" />
                <span>Quản lý điểm đến</span>
              </DropdownMenuItem>
              {mvpFeatures.culture && (
              <DropdownMenuItem className="cursor-pointer rounded-lg px-2.5 py-2 text-xs font-medium" render={<Link href="/admin/culture" />}>
                <BookOpen className="size-3.5 text-muted-foreground mr-2" />
                <span>Quản lý nội dung văn hóa</span>
              </DropdownMenuItem>
              )}
              <DropdownMenuItem className="cursor-pointer rounded-lg px-2.5 py-2 text-xs font-medium" render={<Link href={"/admin/rag" as import("next").Route} />}>
                <FileText className="size-3.5 text-muted-foreground mr-2" />
                <span>Quản lý tài liệu RAG</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer rounded-lg px-2.5 py-2 text-xs font-medium" render={<Link href={"/admin/users" as import("next").Route} />}>
                <Users className="size-3.5 text-muted-foreground mr-2" />
                <span>Quản lý người dùng</span>
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator className="my-1 border-border/40" />
          {signOutError ? (
            <p className="px-2.5 py-1.5 text-xs text-destructive" role="alert">
              {signOutError}
            </p>
          ) : null}
          <DropdownMenuItem
            variant="destructive"
            className="cursor-pointer rounded-lg px-2.5 py-2 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 focus:bg-destructive/10"
            disabled={isSigningOut}
            aria-busy={isSigningOut}
            closeOnClick={false}
            onClick={() => void handleSignOut()}
          >
            <LogOut className="size-3.5 mr-2" />
            <span>{isSigningOut ? "Đang đăng xuất…" : "Đăng xuất"}</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
