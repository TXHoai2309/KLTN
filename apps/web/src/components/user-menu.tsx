"use client";

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
  return <Link href={buildCurrentPageLoginHref(pathname, search ? `?${search}` : "")}><Button variant="outline">Sign In</Button></Link>;
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
    return <Skeleton className="h-9 w-24" />;
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-sm" role="alert">
        <span>Không thể kiểm tra phiên.</span>
        <Button variant="outline" onClick={() => void refetch()}>Thử lại</Button>
      </div>
    );
  }

  if (!session) {
    return (
      <Suspense fallback={<Link href="/login"><Button variant="outline">Sign In</Button></Link>}>
        <GuestSignInLink />
      </Suspense>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" className="max-w-[30vw] truncate sm:max-w-56" />}>
        {session.user.name}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="bg-card">
        <DropdownMenuGroup>
          <DropdownMenuLabel>My Account</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>{session.user.email}</DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/account" />}>Thông tin tài khoản</DropdownMenuItem>
          {session.user.role === "ADMIN" && <DropdownMenuItem render={<Link href="/admin/destinations" />}>Quản lý điểm đến</DropdownMenuItem>}
          {session.user.role === "ADMIN" && <DropdownMenuItem render={<Link href="/admin/culture" />}>Quản lý nội dung văn hóa</DropdownMenuItem>}
          {signOutError ? (
            <p className="px-2 py-2 text-xs text-destructive" role="alert">
              {signOutError}
            </p>
          ) : null}
          <DropdownMenuItem
            variant="destructive"
            disabled={isSigningOut}
            aria-busy={isSigningOut}
            closeOnClick={false}
            onClick={() => void handleSignOut()}
          >
            {isSigningOut ? "Đang đăng xuất…" : "Đăng xuất"}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
