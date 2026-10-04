"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { DetailState } from "./destination-detail";

export default function ErrorPage({ reset }: { reset: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <DetailState state="error"><button type="button" disabled={pending} onClick={() => startTransition(() => { router.refresh(); reset(); })}>{pending ? "Đang thử lại…" : "Thử lại"}</button></DetailState>;
}
