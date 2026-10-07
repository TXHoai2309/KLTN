"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@KLTN/ui/components/button";
import { Input } from "@KLTN/ui/components/input";
import type { Route } from "next";
import { useRouter } from "next/navigation";

export default function CultureFilterBar({
  initialQ,
  initialDestination,
}: {
  initialQ: string;
  initialDestination: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState(initialQ);
  const [destination, setDestination] = useState(initialDestination);
  const [isPending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (destination.trim()) params.set("destination", destination.trim());

    const href = params.toString() ? `/culture?${params.toString()}` : "/culture";
    startTransition(() => router.push(href as Route));
  }

  function clear() {
    setQ("");
    setDestination("");
    startTransition(() => router.push("/culture"));
  }

  const hasFilters = Boolean(q.trim() || destination.trim());

  return (
    <form className="culture-filter" onSubmit={submit} aria-busy={isPending}>
      <div className="culture-filter-field">
        <label htmlFor="culture-search">Tìm kiếm</label>
        <Input
          id="culture-search"
          name="q"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Tìm theo tiêu đề hoặc nội dung"
          maxLength={200}
          enterKeyHint="search"
        />
      </div>
      <div className="culture-filter-field">
        <label htmlFor="culture-destination">Điểm đến liên quan</label>
        <Input
          id="culture-destination"
          name="destination"
          value={destination}
          onChange={(event) => setDestination(event.target.value)}
          placeholder="Nhập mã điểm đến"
          maxLength={128}
        />
      </div>
      <div className="culture-filter-actions">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Đang lọc…" : "Tìm kiếm"}
        </Button>
        {hasFilters && (
          <Button type="button" variant="outline" onClick={clear} disabled={isPending}>
            Xóa bộ lọc
          </Button>
        )}
      </div>
    </form>
  );
}
