import Link from "next/link";
import type { Route } from "next";
import { BookOpen, SearchX, ArrowRight } from "lucide-react";

import { Card, CardContent } from "@KLTN/ui/components/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@KLTN/ui/components/empty";
import { db } from "@/services";
import {
  listPublicCulture,
} from "@/modules/culture/culture.service";
import { parsePublicCultureQuery } from "@/modules/culture/culture.schema";
import type { PublicCultureQuery } from "@/modules/culture/culture.types";

import CultureCover from "./culture-cover";
import CultureFilterBar from "./culture-filter-bar";
import "./culture.css";

export const dynamic = "force-dynamic";

type CultureSearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

type CultureQueryState = {
  query: PublicCultureQuery;
  q: string;
  destination: string;
};

function firstSearchValue(
  value: string | string[] | undefined,
): { value: string; repeated: boolean } {
  if (Array.isArray(value)) {
    return { value: value[0] ?? "", repeated: value.length > 1 };
  }
  return { value: value ?? "", repeated: false };
}

function parseCultureSearchParams(
  rawSearchParams: Record<string, string | string[] | undefined>,
): CultureQueryState | null {
  const allowedKeys = new Set(["q", "destination", "page"]);
  if (
    Object.keys(rawSearchParams).some((key) => !allowedKeys.has(key))
  ) {
    return null;
  }

  const q = firstSearchValue(rawSearchParams.q);
  const destination = firstSearchValue(rawSearchParams.destination);
  const page = firstSearchValue(rawSearchParams.page);
  if (q.repeated || destination.repeated || page.repeated) return null;

  const queryParams = new URLSearchParams();
  if (q.value.trim()) queryParams.set("q", q.value);
  if (destination.value.trim()) {
    queryParams.set("destinationId", destination.value);
  }
  if (page.value) queryParams.set("page", page.value);

  try {
    return {
      query: parsePublicCultureQuery(queryParams),
      q: q.value,
      destination: destination.value,
    };
  } catch {
    return null;
  }
}

function cultureDetailHref(slug: string): Route {
  return `/culture/${encodeURIComponent(slug)}` as Route;
}

function culturePageHref(
  state: CultureQueryState,
  page: number,
): `/culture?${string}` {
  const params = new URLSearchParams();
  if (state.q.trim()) params.set("q", state.q.trim());
  if (state.destination.trim()) {
    params.set("destination", state.destination.trim());
  }
  params.set("page", String(page));
  return `/culture?${params.toString()}`;
}

export default async function CulturePage({
  searchParams,
}: {
  searchParams: CultureSearchParams;
}) {
  const rawSearchParams = await searchParams;
  const state = parseCultureSearchParams(rawSearchParams);

  return (
    <main className="culture-page" lang="vi">
      <header className="culture-page-header">
        <span className="culture-eyebrow">Hà Giang · Văn hóa</span>
        <h1>Văn hóa Hà Giang</h1>
        <p>
          Đọc những câu chuyện văn hóa và lịch sử địa phương qua các nội dung
          đã được công khai.
        </p>
      </header>

      <CultureFilterBar
        key={`${state?.q ?? ""}|${state?.destination ?? ""}`}
        initialQ={state?.q ?? firstSearchValue(rawSearchParams.q).value}
        initialDestination={
          state?.destination ?? firstSearchValue(rawSearchParams.destination).value
        }
      />

      {state === null ? (
        <CultureInvalidQuery />
      ) : (
        <CultureList state={state} />
      )}
    </main>
  );
}

async function CultureList({ state }: { state: CultureQueryState }) {
  const data = await listPublicCulture(state.query, db);
  const hasFilters = Boolean(state.q.trim() || state.destination.trim());

  if (data.items.length === 0) {
    return (
      <Empty className="culture-empty" role="status">
        <EmptyMedia variant="icon">
          {hasFilters ? <SearchX aria-hidden="true" /> : <BookOpen aria-hidden="true" />}
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>
            {hasFilters
              ? "Không tìm thấy nội dung phù hợp"
              : "Chưa có nội dung văn hóa công khai"}
          </EmptyTitle>
          <EmptyDescription>
            {hasFilters
              ? "Hãy thử đổi từ khóa hoặc bộ lọc điểm đến."
              : "Nội dung văn hóa công khai sẽ được hiển thị tại đây."}
          </EmptyDescription>
        </EmptyHeader>
        {hasFilters && (
          <EmptyContent>
            <Link className="culture-inline-link" href="/culture">
              Xóa bộ lọc
            </Link>
          </EmptyContent>
        )}
      </Empty>
    );
  }

  return (
    <section className="culture-results" aria-labelledby="culture-results-title">
      <div className="culture-results-heading">
        <div>
          <h2 id="culture-results-title">Nội dung văn hóa</h2>
          <p>
            Trang {data.pageInfo.page} · {data.items.length} nội dung
          </p>
        </div>
      </div>

      <ul className="culture-grid">
        {data.items.map((item) => (
          <li key={item.id}>
            <Link
              className="culture-card-link"
              href={cultureDetailHref(item.slug)}
            >
              <Card className="culture-card" size="sm">
                <CultureCover src={item.coverImageUrl} alt={item.title} />
                <CardContent className="culture-card-content">
                  <h3 className="culture-card-title">
                    {item.title}
                  </h3>
                  <p className="culture-card-summary">
                    {item.summary || "Chưa có phần tóm tắt."}
                  </p>
                  <span className="culture-card-action">
                    Đọc nội dung <ArrowRight aria-hidden="true" />
                  </span>
                </CardContent>
              </Card>
            </Link>
          </li>
        ))}
      </ul>

      <nav className="culture-pagination" aria-label="Phân trang nội dung văn hóa">
        {data.pageInfo.page > 1 ? (
          <Link href={culturePageHref(state, data.pageInfo.page - 1)}>
            Trang trước
          </Link>
        ) : (
          <span aria-hidden="true" />
        )}
        <span aria-current="page">Trang {data.pageInfo.page}</span>
        {data.pageInfo.hasNextPage ? (
          <Link href={culturePageHref(state, data.pageInfo.page + 1)}>
            Trang sau
          </Link>
        ) : (
          <span aria-hidden="true" />
        )}
      </nav>
    </section>
  );
}

function CultureInvalidQuery() {
  return (
    <section className="culture-state" role="alert">
      <h2>Bộ lọc không hợp lệ</h2>
      <p>Hãy kiểm tra từ khóa, điểm đến hoặc số trang rồi thử lại.</p>
      <Link className="culture-state-link" href="/culture">
        Về danh sách văn hóa
      </Link>
    </section>
  );
}
