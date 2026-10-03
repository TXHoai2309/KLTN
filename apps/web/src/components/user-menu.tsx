"use client";

import { useRef, useState } from "react";
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

import { authClient } from "@/lib/auth-client";
import { claimSubmission, releaseSubmission } from "@/lib/auth-submission-guard";
import { isSignOutConfirmed } from "@/lib/sign-out-confirmation";

const SIGN_OUT_ERROR = "Không thể xác nhận đăng xuất. Phiên của bạn có thể vẫn còn hoạt động. Vui lòng thử lại.";

export default function UserMenu() {
  const { data: session, isPending } = authClient.useSession();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const signOutInProgress = useRef(false);

  async function handleSignOut() {
    if (!claimSubmission(signOutInProgress)) return;

    setIsSigningOut(true);
    setSignOutError(null);

    try {
      const confirmed = await isSignOutConfirmed(() =>
        fetch("/api/session/logout", { method: "POST", credentials: "same-origin" }),
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

  if (!session) {
    return (
      <Link href="/login">
        <Button variant="outline">Sign In</Button>
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        {session.user.name}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="bg-card">
        <DropdownMenuGroup>
          <DropdownMenuLabel>My Account</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>{session.user.email}</DropdownMenuItem>
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
