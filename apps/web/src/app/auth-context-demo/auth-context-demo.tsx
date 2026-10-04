"use client";

import { useRef, useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";

import { confirmAuthContextDemoAction } from "./actions";
import { authClient } from "@/lib/auth-client";
import { buildAuthContextDemoLoginHref } from "@/lib/auth-context-demo";

export default function AuthContextDemo() {
  const router = useRouter();
  const { data: session, isPending, error, refetch } = authClient.useSession();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("Thao tác minh họa chưa được xác nhận.");
  const submissionInProgress = useRef(false);

  async function handleFavoriteAttempt() {
    if (isPending || error || submissionInProgress.current) return;

    setFeedback("");

    if (!session?.user) {
      router.push(buildAuthContextDemoLoginHref(window.location) as Route);
      return;
    }

    submissionInProgress.current = true;
    setIsSubmitting(true);

    try {
      const result = await confirmAuthContextDemoAction();
      if (result.status === "UNAUTHENTICATED") {
        router.push(buildAuthContextDemoLoginHref(window.location) as Route);
        return;
      }

      setFeedback(result.message);
    } catch {
      setFeedback("Chưa thể xác nhận thao tác minh họa. Vui lòng thử lại.");
    } finally {
      submissionInProgress.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col justify-center gap-5 px-6 py-12">
      <p className="text-sm font-medium text-muted-foreground">Harness kiểm thử US-04 · chỉ khả dụng ở development</p>
      <h1 className="text-3xl font-semibold">Khôi phục ngữ cảnh xác thực</h1>
      <p>
        Màn hình này mô phỏng một thao tác chỉ dành cho Du khách. Nếu cần đăng nhập,
        hệ thống chỉ giữ đường dẫn hiện tại; thao tác không được tự chạy lại sau khi quay về.
      </p>
      <button
        type="button"
        className="w-fit rounded-md bg-primary px-5 py-3 font-medium text-primary-foreground disabled:opacity-60"
        onClick={() => void handleFavoriteAttempt()}
        disabled={isPending || Boolean(error) || isSubmitting}
        aria-busy={isSubmitting}
      >
        {isPending ? "Đang kiểm tra phiên…" : isSubmitting ? "Đang xác nhận…" : "Thử lưu yêu thích"}
      </button>
      {error && (
        <div role="alert">
          Không thể kiểm tra phiên. Vui lòng thử lại.
          <button type="button" className="ml-2 underline" onClick={() => void refetch()}>
            Kiểm tra lại phiên
          </button>
        </div>
      )}
      <p role="status" aria-live="polite">{feedback}</p>
    </main>
  );
}
