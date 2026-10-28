import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { companionGroupFixture } from "@/modules/trip-companions/companion-group-fixtures";
import { companionHistoryFixture } from "@/modules/trip-companions/companion-chat-fixtures";
import { companionMembersFixture } from "@/modules/trip-companions/companion-members-fixtures";
import { publicCompanionFixture } from "@/modules/trip-companions/companion-fixtures";

const reads = vi.hoisted(() => ({ group: vi.fn(), history: vi.fn(), members: vi.fn(), viewer: vi.fn(), actor: vi.fn(), public: vi.fn(), relationship: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("@/modules/trip-read/trip-read-server", () => ({ tripReadDependencies: {} }));
vi.mock("@/modules/trip-companions/companion-group-service", () => ({ getCompanionGroup: reads.group, requireGroup: reads.relationship }));
vi.mock("@/modules/trip-companions/companion-chat-service", () => ({ getCompanionHistory: reads.history }));
vi.mock("@/modules/trip-companions/companion-members-service", () => ({ getCompanionMembers: reads.members }));
vi.mock("@/modules/trip-companions/companion-service", () => ({ getCompanionViewerContext: reads.viewer, getPublicCompanion: reads.public }));
vi.mock("@/server/auth/require-traveler", () => ({ requireTraveler: reads.actor }));
vi.mock("@/components/trip-companions/companion-group-view", () => ({ CompanionGroupView: () => null }));
vi.mock("@/components/trip-companions/companion-introduction-view", () => ({ CompanionIntroductionView: () => null }));
vi.mock("@/app/trip-companions/companion.css", () => ({}));
vi.mock("@/components/trip-planner/trip-planner.css", () => ({}));
import GroupPage from "./page";
import IntroductionPage from "../page";

describe("group page critical reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reads.group.mockResolvedValue(companionGroupFixture);
    reads.actor.mockResolvedValue({ userId: "synthetic-member" });
    reads.history.mockResolvedValue(companionHistoryFixture);
    reads.members.mockResolvedValue(companionMembersFixture);
    reads.public.mockResolvedValue(publicCompanionFixture);
    reads.viewer.mockResolvedValue({ relationship: "VISITOR" });
    reads.relationship.mockResolvedValue({ relationship: "MEMBER" });
  });

  it("opens the itinerary without waiting for unused chat or members", async () => {
    await GroupPage({ params: Promise.resolve({ id: companionGroupFixture.publicationId }) });
    expect(reads.history).not.toHaveBeenCalled();
    expect(reads.members).not.toHaveBeenCalled();
  });

  it.each(["chat", "members"])("prefetches only the selected %s tab", async tab => {
    const tree = await GroupPage({ params: Promise.resolve({ id: companionGroupFixture.publicationId }), searchParams: Promise.resolve({ tab }) });
    const view = (tree as ReactElement<{ children: ReactElement<Record<string, unknown>> }>).props.children;
    expect(reads.history).toHaveBeenCalledTimes(tab === "chat" ? 1 : 0);
    expect(reads.members).toHaveBeenCalledTimes(tab === "members" ? 1 : 0);
    expect(view.props.currentUserId).toBe("synthetic-member");
    expect(view.props.initialTab).toBe(tab);
  });

  it("checks a visitor's membership on the introduction without loading the private itinerary", async () => {
    await IntroductionPage({ params: Promise.resolve({ id: companionGroupFixture.publicationId }) });
    expect(reads.public).toHaveBeenCalledOnce();
    expect(reads.relationship).toHaveBeenCalledOnce();
    expect(reads.group).not.toHaveBeenCalled();
    expect(reads.history).not.toHaveBeenCalled();
    expect(reads.members).not.toHaveBeenCalled();
  });
});
