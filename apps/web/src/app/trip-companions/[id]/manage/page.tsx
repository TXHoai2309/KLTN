import { headers } from "next/headers";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import type { Metadata, Route } from "next";
import { getCompanionManagement } from "@/modules/trip-companions/companion-management-service";
import { tripReadDependencies } from "@/modules/trip-read/trip-read-server";
import { AppError } from "@/server/http/app-error";
import { CompanionManagementView } from "@/components/trip-companions/companion-management-view";
import "@/app/trip-companions/companion.css";

interface ManagePageProps {
  params: Promise<{ id: string }>;
}

const readManagementForPage = cache(async (id: string) =>
  getCompanionManagement(await headers(), id, tripReadDependencies),
);

export async function generateMetadata({ params }: ManagePageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const management = await readManagementForPage(id);
    return {
      title: `Quản lý — ${management.draft.title} | Tìm bạn đồng hành`,
      description: `Bảng quản lý tuyển thành viên chuyến đi ${management.draft.title}`,
    };
  } catch {
    return {
      title: "Quản lý tuyển thành viên — Tìm bạn đồng hành Hà Giang",
    };
  }
}

export default async function CompanionManagePage({ params }: ManagePageProps) {
  const { id } = await params;

  let management;
  try {
    management = await readManagementForPage(id);
  } catch (error: unknown) {
    if (error instanceof AppError) {
      if (error.status === 401) {
        redirect(`/login?returnTo=${encodeURIComponent(`/trip-companions/${id}/manage`)}`);
      }
      if (error.status === 403) {
        redirect(`/trip-companions/${encodeURIComponent(id)}` as Route);
      }
      if (error.status === 404) {
        notFound();
      }
    }
    throw error;
  }

  return (
    <main className="companion-page">
      <CompanionManagementView management={management} />
    </main>
  );
}
