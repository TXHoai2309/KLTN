import { headers } from "next/headers";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import type { Metadata, Route } from "next";
import { getCompanionGroup } from "@/modules/trip-companions/companion-group-service";
import { getCompanionMembers } from "@/modules/trip-companions/companion-members-service";
import { getCompanionHistory } from "@/modules/trip-companions/companion-chat-service";
import { getCompanionViewerContext } from "@/modules/trip-companions/companion-service";
import { tripReadDependencies } from "@/modules/trip-read/trip-read-server";
import { AppError } from "@/server/http/app-error";
import { requireTraveler } from "@/server/auth/require-traveler";
import { CompanionGroupView } from "@/components/trip-companions/companion-group-view";
import "@/app/trip-companions/companion.css";
import "@/components/trip-planner/trip-planner.css";

interface GroupPageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ tab?: string }>;
}

// React cache lasts for this server render only. Metadata and the page share
// one authorized snapshot; a later request checks the current account/membership.
const readGroupForPage = cache(async (id: string) =>
  getCompanionGroup(await headers(), id, tripReadDependencies),
);

export async function generateMetadata({ params }: GroupPageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const group = await readGroupForPage(id);
    return {
      title: `${group.introduction.title} — Nhóm đồng hành Hà Giang`,
      description: `Lịch trình chi tiết và nhóm đồng hành chuyến đi ${group.introduction.title}`,
    };
  } catch {
    return {
      title: "Nhóm đồng hành — Tìm bạn đồng hành Hà Giang",
    };
  }
}

export default async function CompanionGroupPage({ params, searchParams }: GroupPageProps) {
  const { id } = await params;
  const reqHeaders = await headers();
  const sp = searchParams ? await searchParams : undefined;
  const initialTab =
    sp?.tab === "chat" ? "chat" : sp?.tab === "members" ? "members" : undefined;

  let group;
  let currentUserId: string;
  try {
    const [actor, authorizedGroup] = await Promise.all([
      requireTraveler(reqHeaders, tripReadDependencies),
      readGroupForPage(id),
    ]);
    currentUserId = actor.userId;
    group = authorizedGroup;
  } catch (error: unknown) {
    if (error instanceof AppError) {
      if (error.status === 401) {
        redirect(`/login?returnTo=${encodeURIComponent(`/trip-companions/${id}/group`)}`);
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

  // Only the visible tab belongs on the critical path. Other tabs retain their
  // client-side reads; independent host/tab reads run concurrently.
  const [viewer, initialMembers, initialHistory] = await Promise.all([
    group.relationship === "HOST"
      ? getCompanionViewerContext(reqHeaders, id, tripReadDependencies).catch(() => undefined)
      : undefined,
    initialTab === "members"
      ? getCompanionMembers(reqHeaders, id, tripReadDependencies).catch(() => undefined)
      : undefined,
    initialTab === "chat"
      ? getCompanionHistory(reqHeaders, id, {}, tripReadDependencies).catch(() => undefined)
      : undefined,
  ]);
  const tripId = viewer?.relationship === "HOST" ? viewer.tripId : undefined;

  return (
    <main className="companion-page" lang="vi">
      <CompanionGroupView
        group={group}
        tripId={tripId}
        initialMembers={initialMembers}
        initialHistory={initialHistory}
        initialTab={initialTab}
        currentUserId={currentUserId}
      />
    </main>
  );
}
