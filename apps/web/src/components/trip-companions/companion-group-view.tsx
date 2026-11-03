"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import {
  Calendar,
  CalendarDays,
  CarFront,
  Clock3,
  MapPin,
  Users,
  ShieldCheck,
  AlertTriangle,
  ExternalLink,
  Edit3,
  LogOut,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Settings,
  UserX,
  MessageSquare,
  Send,
  Info,
  RefreshCw,
  RotateCcw,
  Layers,
  Map,
  Mountain,
  ChevronRight,
} from "lucide-react";
import { ItineraryMap } from "@/components/trip-planner/itinerary-map";
import type { PlannerDay, PlannerStop, TravelLeg } from "@/modules/trip-planner/planner-contract";
import {
  getDestinationCoordinates,
  getDestinationVisual,
  inferDestinationArea,
} from "@/lib/destination-visuals";
import { Card } from "@KLTN/ui/components/card";
import type { CompanionGroup } from "@/modules/trip-companions/companion-group-contract";
import type { CompanionMembers } from "@/modules/trip-companions/companion-members-contract";
import type {
  CompanionHistory,
  CompanionMessage,
} from "@/modules/trip-companions/companion-chat-contract";
import {
  leaveCompanionTrip,
  fetchCompanionMembers,
  banCompanionMember,
  fetchCompanionMessages,
  sendCompanionMessage,
  fetchCompanionDelta,
  reconcileCompanionMessage,
  fetchCompanionUnread,
  markCompanionRead,
  fetchCompanionGroup,
  CompanionClientError,
} from "@/modules/trip-companions/companion-client";

export interface CompanionGroupViewProps {
  group: CompanionGroup;
  tripId?: string;
  initialMembers?: CompanionMembers;
  initialTab?: "itinerary" | "chat" | "members";
  initialHistory?: CompanionHistory;
  currentUserId?: string;
}

function formatDateVi(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  if (!year || !month || !day) return dateStr;
  return `${day}/${month}/${year}`;
}

function formatRangeVi(startStr: string, endStr: string): string {
  const [sY, sM, sD] = startStr.split("-");
  const [eY, eM, eD] = endStr.split("-");
  if (!sY || !eY) return `${startStr} – ${endStr}`;
  if (sY === eY && sM === eM) {
    return `${sD} – ${eD}/${sM}/${sY}`;
  }
  if (sY === eY) {
    return `${sD}/${sM} – ${eD}/${eM}/${sY}`;
  }
  return `${sD}/${sM}/${sY} – ${eD}/${eM}/${eY}`;
}

function formatMinuteOfDay(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

function renderSafeMessageContent(text: string) {
  const urlRegex = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;
  const parts = text.split(urlRegex);
  return parts.map((part, index) => {
    if (urlRegex.test(part)) {
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="companion-chat-link"
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

function formatMessageTimeVi(isoString: string): string {
  try {
    const d = new Date(isoString);
    const hours = d.getHours().toString().padStart(2, "0");
    const minutes = d.getMinutes().toString().padStart(2, "0");
    const day = d.getDate().toString().padStart(2, "0");
    const month = (d.getMonth() + 1).toString().padStart(2, "0");
    return `${hours}:${minutes} · ${day}/${month}`;
  } catch {
    return "";
  }
}

function companionGroupToPlannerDays(group: CompanionGroup): PlannerDay[] {
  let globalIndex = 0;
  const allStopsWithCoords: {
    dayIndex: number;
    destinationId: string;
    coords: { latitude: number; longitude: number };
  }[] = [];

  for (const day of group.itinerary.days) {
    for (const visit of day.visits) {
      const destId = visit.destination.destinationId || visit.visitId;
      const coords = getDestinationCoordinates(
        visit.destination.name,
        "",
        visit.destination.latitude ?? undefined,
        visit.destination.longitude ?? undefined,
        globalIndex++
      );
      allStopsWithCoords.push({
        dayIndex: day.dayIndex,
        destinationId: destId,
        coords,
      });
    }
  }

  return group.itinerary.days.map((day) => {
    const stops: PlannerStop[] = day.visits.map((visit) => {
      const destId = visit.destination.destinationId || visit.visitId;
      const thisIdx = allStopsWithCoords.findIndex(
        (s) => s.destinationId === destId
      );
      const coords =
        thisIdx >= 0
          ? allStopsWithCoords[thisIdx]!.coords
          : getDestinationCoordinates(
              visit.destination.name,
              "",
              visit.destination.latitude ?? undefined,
              visit.destination.longitude ?? undefined
            );

      let inbound: TravelLeg | null = null;
      if (thisIdx > 0) {
        const prev = allStopsWithCoords[thisIdx - 1]!;
        inbound = {
          fromDestinationId: prev.destinationId,
          toDestinationId: destId,
          status: "VERIFIED",
          reason: null,
          durationSeconds: 1800,
          distanceMeters: 15000,
          provider: "STADIA_MAPS",
          geometry: {
            type: "LineString",
            coordinates: [
              [prev.coords.longitude, prev.coords.latitude],
              [coords.longitude, coords.latitude],
            ],
          },
        };
      }

      const area = inferDestinationArea(visit.destination.name);

      return {
        order: visit.order,
        destination: {
          id: destId,
          name: visit.destination.name,
          description: "",
          area: area,
          address: null,
          category: "Điểm tham quan",
          latitude: coords.latitude,
          longitude: coords.longitude,
          image: null,
        },
        arrivalMinute: visit.startMinute,
        departureMinute: visit.startMinute + visit.plannedDurationMinutes,
        visitDurationMinutes: visit.plannedDurationMinutes,
        scheduleState: "PLANNED",
        inbound,
        validationStatus: "PASS",
      };
    });

    return {
      day: day.dayIndex,
      date: day.localDate,
      stops,
      distanceMeters: null,
      travelSeconds: null,
    };
  });
}

export function CompanionGroupView(props: CompanionGroupViewProps) {
  const session = authClient.useSession();
  const scope = props.group.publicationId + ":" + (props.currentUserId ?? "");
  const [revokedScope, setRevokedScope] = useState<string | null>(null);
  const principalChanged = !session.isPending && !session.error &&
    (!session.data || (props.currentUserId && session.data.user.id !== props.currentUserId));
  if (revokedScope === scope || principalChanged) {
    return (
      <section className="companion-container companion-card p-6" role="alert" data-testid="companion-group-access-lost">
        <h1 className="companion-section-title">Bạn không còn quyền truy cập nhóm này</h1>
        <p>Phiên đăng nhập hoặc quyền thành viên đã thay đổi. Nội dung nhóm đã được đóng.</p>
        <Link href={"/trip-companions" as Route} className="companion-secondary-button">Về tìm bạn đồng hành</Link>
      </section>
    );
  }
  return <CompanionGroupContent key={scope} {...props} onAccessLost={() => setRevokedScope(scope)} />;
}

function mergeMessages(existing: CompanionMessage[], incoming: CompanionMessage[]) {
  const messages = new globalThis.Map(existing.map(message => [message.sequence, message]));
  for (const message of incoming) messages.set(message.sequence, message);
  return [...messages.values()].sort((a, b) => BigInt(a.sequence) < BigInt(b.sequence) ? -1 : BigInt(a.sequence) > BigInt(b.sequence) ? 1 : 0);
}

function CompanionGroupContent({
  group,
  tripId,
  initialMembers,
  initialTab,
  initialHistory,
  currentUserId,
  onAccessLost,
}: CompanionGroupViewProps & { onAccessLost: () => void }) {
  const router = useRouter();
  const activeRef = useRef(true);
  const onAccessLostRef = useRef(onAccessLost);
  onAccessLostRef.current = onAccessLost;
  useEffect(() => {
    activeRef.current = true;
    return () => { activeRef.current = false; };
  }, []);
  const handleAccessError = useCallback((error: unknown) => {
    const status = error instanceof CompanionClientError ? error.status
      : typeof error === "object" && error !== null && "httpStatus" in error ? error.httpStatus : undefined;
    if (status === 401 || status === 403 || status === 404) {
      activeRef.current = false;
      onAccessLostRef.current();
      return true;
    }
    return false;
  }, []);
  const [currentGroup, setCurrentGroup] = useState<CompanionGroup>(group);
  const [activeTab, setActiveTab] = useState<"itinerary" | "chat" | "members">(
    initialTab ?? "itinerary",
  );

  const [activeDayIndex, setActiveDayIndex] = useState<number | null>(null);
  const [selectedDestinationId, setSelectedDestinationId] = useState<string | null>(null);
  const [focusSelection, setFocusSelection] = useState(false);
  const [mobileTab, setMobileTab] = useState<"itinerary" | "map">("itinerary");

  const totalDestinations = useMemo(
    () => currentGroup.itinerary.days.reduce((sum, d) => sum + d.visits.length, 0),
    [currentGroup]
  );

  const plannerDays = useMemo(
    () => companionGroupToPlannerDays(currentGroup),
    [currentGroup]
  );

  const activePlannerDay = useMemo(() => {
    if (plannerDays.length === 0) {
      return {
        day: 1,
        date: currentGroup.introduction.startDate,
        stops: [],
        distanceMeters: null,
        travelSeconds: null,
      };
    }
    if (activeDayIndex === null) return plannerDays[0]!;
    return plannerDays.find((d) => d.day === activeDayIndex) ?? plannerDays[0]!;
  }, [plannerDays, activeDayIndex]);

  const handleSelectDestination = (id: string) => {
    setSelectedDestinationId(id);
    setFocusSelection(true);
    if (id) {
      const el = document.getElementById(`companion-visit-${id}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  };

  const isCompletedTrip = (() => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      return group.introduction.endDate < today;
    } catch {
      return false;
    }
  })();

  // Chat state
  const [chatHistory, setChatHistory] = useState<CompanionHistory | null>(
    initialHistory ?? null,
  );
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const [composerText, setComposerText] = useState("");
  const [composerStatus, setComposerStatus] = useState<
    "idle" | "sending" | "unknown" | "failed"
  >("idle");
  const [composerError, setComposerError] = useState<string | null>(null);
  const sendAttemptRef = useRef<{ publicationId: string; text: string; key: string } | null>(null);
  const sendingRef = useRef(false);

  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const transcriptContainerRef = useRef<HTMLDivElement | null>(null);
  const isPollingRef = useRef(false);
  const lastDeliveredCursorRef = useRef<string>(
    initialHistory?.highWaterCursor ??
      (initialHistory?.items.at(-1)?.sequence ?? "0"),
  );
  const [reconciling, setReconciling] = useState(false);
  const [unreadBadgeCount, setUnreadBadgeCount] = useState<number>(0);
  const lastMarkedReadSeqRef = useRef<string>("0");
  const isMarkingReadRef = useRef(false);
  const readAttemptRef = useRef<{ sequence: string; key: string } | null>(null);

  // Delivery cursor tracks a contiguous server cut, never an own-send acknowledgement.
  const historyReadyRef = useRef(Boolean(initialHistory));
  const refreshGroup = useCallback(async () => {
    try {
      const refreshed = await fetchCompanionGroup(group.publicationId);
      if (activeRef.current) setCurrentGroup(refreshed);
    } catch (error) { if (activeRef.current) handleAccessError(error); }
  }, [group.publicationId, handleAccessError]);

  const loadMessages = useCallback(async () => {
    if (!activeRef.current) return;
    setChatLoading(true); setChatError(null);
    try {
      const data = await fetchCompanionMessages(group.publicationId);
      if (!activeRef.current) return;
      lastDeliveredCursorRef.current = data.highWaterCursor;
      historyReadyRef.current = true;
      setChatHistory(data);
    } catch (error) {
      if (activeRef.current && !handleAccessError(error))
        setChatError(error instanceof Error ? error.message : "Không thể tải tin nhắn trò chuyện.");
    } finally { if (activeRef.current) setChatLoading(false); }
  }, [group.publicationId, handleAccessError]);

  const pollDelta = useCallback(async () => {
    if (!activeRef.current || !historyReadyRef.current || isPollingRef.current || document.visibilityState !== "visible") return;
    isPollingRef.current = true;
    try {
      const delta = await fetchCompanionDelta(group.publicationId, lastDeliveredCursorRef.current);
      if (!activeRef.current) return;
      const container = transcriptContainerRef.current;
      const followNew = container && container.scrollHeight - container.scrollTop - container.clientHeight < 120;
      // Only the last delivered item advances the cursor, including paginated deltas.
      lastDeliveredCursorRef.current = delta.nextCursor;
      setChatHistory(prev => prev ? { ...prev, items: mergeMessages(prev.items, delta.items),
        highWaterCursor: delta.highWaterCursor, canSend: delta.canSend } : prev);
      if (delta.items.some(message => message.kind === "SYSTEM")) void refreshGroup();
      if (followNew && delta.items.length) setTimeout(() => {
        if (activeRef.current) transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 50);
    } catch (error) {
      // Network errors preserve history; authorization errors unmount private state.
      if (activeRef.current) handleAccessError(error);
    } finally { isPollingRef.current = false; }
  }, [group.publicationId, handleAccessError, refreshGroup]);

  useEffect(() => {
    if (activeTab === "chat" && !chatHistory && !chatLoading && !chatError) {
      void loadMessages();
    }
  }, [activeTab, chatHistory, chatLoading, chatError, loadMessages]);

  useEffect(() => {
    if (activeTab !== "chat") return;

    const interval = setInterval(() => {
      void pollDelta();
    }, 3000);

    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void pollDelta();
      }
    };

    const handleOnline = () => {
      void pollDelta();
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("online", handleOnline);
    }

    return () => {
      clearInterval(interval);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleOnline);
      }
    };
  }, [activeTab, pollDelta]);

  // Read receipts follow visible message geometry and may not pass delivery gaps.
  const markVisibleRead = useCallback(async () => {
    const container = transcriptContainerRef.current;
    if (!activeRef.current || activeTab !== "chat" || document.visibilityState !== "visible" || !container || isMarkingReadRef.current) return;
    const viewport = container.getBoundingClientRect();
    const visibleTop = Math.max(0, viewport.top);
    const visibleBottom = Math.min(viewport.bottom, window.innerHeight || viewport.bottom);
    let visibleSequence = "0";
    for (const element of container.querySelectorAll<HTMLElement>("[data-companion-sequence]")) {
      const rect = element.getBoundingClientRect();
      const sequence = element.dataset.companionSequence;
      if (sequence && rect.bottom > visibleTop && rect.bottom <= visibleBottom && rect.top < visibleBottom &&
          BigInt(sequence) <= BigInt(lastDeliveredCursorRef.current) && BigInt(sequence) > BigInt(visibleSequence)) visibleSequence = sequence;
    }
    if (BigInt(visibleSequence) <= BigInt(lastMarkedReadSeqRef.current)) return;
    const attempt = readAttemptRef.current ?? { sequence: visibleSequence,
      key: "read-" + group.publicationId + "-" + visibleSequence };
    readAttemptRef.current = attempt;
    isMarkingReadRef.current = true;
    try {
      const result = await markCompanionRead(group.publicationId, attempt.sequence, attempt.key);
      if (!activeRef.current) return;
      if (result.status === "SUCCESS") {
        lastMarkedReadSeqRef.current = result.data.sequence;
        readAttemptRef.current = null;
        const summary = await fetchCompanionUnread();
        if (activeRef.current) setUnreadBadgeCount(summary.items.find(item => item.publicationId === group.publicationId)?.unreadCount ?? 0);
      } else if (result.status === "FAILED") {
        readAttemptRef.current = null;
        handleAccessError(result);
      }
    } catch (error) { if (activeRef.current) handleAccessError(error); }
    finally { isMarkingReadRef.current = false; }
  }, [activeTab, chatHistory?.items, group.publicationId, handleAccessError]);

  useEffect(() => {
    if (activeTab !== "chat") return;
    void markVisibleRead();
    const onReadVisibility = () => { void markVisibleRead(); };
    const container = transcriptContainerRef.current;
    container?.addEventListener("scroll", onReadVisibility);
    document.addEventListener("visibilitychange", onReadVisibility);
    window.addEventListener("scroll", onReadVisibility);
    window.addEventListener("resize", onReadVisibility);
    return () => {
      container?.removeEventListener("scroll", onReadVisibility);
      document.removeEventListener("visibilitychange", onReadVisibility);
      window.removeEventListener("scroll", onReadVisibility);
      window.removeEventListener("resize", onReadVisibility);
    };
  }, [activeTab, markVisibleRead]);

  // Check unread summary when on other tabs (itinerary / members)
  const isUnreadPollingRef = useRef(false);
  const pollUnread = useCallback(async (revalidateGroup = true) => {
    if (!activeRef.current || isUnreadPollingRef.current || document.visibilityState !== "visible") return;
    isUnreadPollingRef.current = true;
    if (revalidateGroup) void refreshGroup();
    try {
      const unreadData = await fetchCompanionUnread();
      if (!activeRef.current) return;
      const currentItem = unreadData.items.find((it) => it.publicationId === group.publicationId);
      if (currentItem) {
        setUnreadBadgeCount(currentItem.unreadCount);
      }
    } catch (error) { if (activeRef.current) handleAccessError(error); }
    finally { isUnreadPollingRef.current = false; }
  }, [group.publicationId, refreshGroup, handleAccessError]);

  useEffect(() => {
    if (activeTab === "chat") return;

    // The group was just read by the server. Revalidate on later events/ticks.
    void pollUnread(false);

    const interval = setInterval(() => {
      void pollUnread();
    }, 15000);

    const handleVisibility = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void pollUnread();
      }
    };

    const handleOnline = () => {
      void pollUnread();
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibility);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("online", handleOnline);
    }

    return () => {
      clearInterval(interval);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibility);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleOnline);
      }
    };
  }, [activeTab, pollUnread]);

  const handleLoadOlder = async () => {
    if (!activeRef.current || !chatHistory?.olderCursor || loadingOlder) return;
    const container = transcriptContainerRef.current;
    const oldHeight = container?.scrollHeight ?? 0;
    const oldTop = container?.scrollTop ?? 0;
    setLoadingOlder(true);
    try {
      const olderData = await fetchCompanionMessages(group.publicationId, {
        before: chatHistory.olderCursor,
      });
      if (!activeRef.current) return;
      setChatHistory((prev) => {
        if (!prev) return olderData;
        return {
          ...prev,
          items: mergeMessages(prev.items, olderData.items),
          olderCursor: olderData.olderCursor,
        };
      });
      setTimeout(() => {
        if (activeRef.current && container) container.scrollTop = oldTop + container.scrollHeight - oldHeight;
      }, 0);
    } catch (error) { if (activeRef.current) handleAccessError(error); }
    finally {
      if (activeRef.current) setLoadingOlder(false);
    }
  };

  const submitMessageAttempt = async (reconcile: boolean) => {
    if (!activeRef.current || sendingRef.current || !historyReadyRef.current || chatHistory?.canSend === false || currentGroup.canSend === false) return;
    let attempt = sendAttemptRef.current;
    if (!attempt) {
      const text = composerText.trim();
      if (reconcile || !text || text.length > 4000) return;
      attempt = { publicationId: group.publicationId, text,
        key: typeof crypto !== "undefined" && crypto.randomUUID ? "msg-" + crypto.randomUUID() : "msg-" + Date.now() + "-" + Math.random() };
      sendAttemptRef.current = attempt;
    }
    sendingRef.current = true;
    setReconciling(reconcile);
    setComposerStatus(reconcile ? "unknown" : "sending");
    setComposerError(null);
    try {
      const outcome = reconcile
        ? await reconcileCompanionMessage(attempt.publicationId, attempt.text, attempt.key)
        : await sendCompanionMessage(attempt.publicationId, attempt.text, attempt.key);
      if (!activeRef.current) return;
      if (outcome.status === "SUCCESS") {
        const message: CompanionMessage = {
          id: outcome.data.messageId, sequence: outcome.data.sequence, kind: "USER", text: attempt.text,
          author: { userId: currentUserId ?? membersData?.host.userId ?? "current-user",
            displayName: group.relationship === "HOST" ? group.introduction.host.displayName : "Tôi",
            avatarUrl: group.relationship === "HOST" ? group.introduction.host.avatarUrl : null },
          createdAt: new Date().toISOString(),
        };
        setChatHistory(prev => prev ? { ...prev, items: mergeMessages(prev.items, [message]) } : prev);
        // Sending proves this message committed, not that earlier messages were delivered.
        sendAttemptRef.current = null;
        setComposerText(""); setComposerStatus("idle"); setComposerError(null);
        setTimeout(() => { if (activeRef.current) transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, 50);
      } else if (outcome.status === "UNKNOWN") {
        setComposerStatus("unknown");
        setComposerError("Chưa xác nhận được tin nhắn. Nội dung được giữ nguyên để đối soát hoặc thử lại an toàn.");
      } else {
        if (handleAccessError(outcome)) return;
        sendAttemptRef.current = null;
        setComposerStatus("failed"); setComposerError(outcome.error.message || "Không thể gửi tin nhắn.");
        void refreshGroup();
      }
    } catch (error) {
      if (!activeRef.current || handleAccessError(error)) return;
      setComposerStatus("unknown");
      setComposerError("Chưa xác nhận được tin nhắn. Hãy đối soát hoặc thử lại yêu cầu đang được giữ nguyên.");
    } finally {
      sendingRef.current = false;
      if (activeRef.current) setReconciling(false);
    }
  };
  const handleSendMessage = async (event?: React.FormEvent) => {
    event?.preventDefault();
    await submitMessageAttempt(false);
  };
  const handleReconcileMessage = () => submitMessageAttempt(true);

  const [membersData, setMembersData] = useState<CompanionMembers | null>(initialMembers ?? null);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);

  const [memberToBan, setMemberToBan] = useState<CompanionMembers["members"][number] | null>(null);
  const [banStatus, setBanStatus] = useState<"idle" | "submitting" | "unknown" | "failed">("idle");
  const [banError, setBanError] = useState<string | null>(null);
  const [banKey, setBanKey] = useState<string>(() => {
    return typeof crypto !== "undefined" && crypto.randomUUID
      ? `ban-${crypto.randomUUID()}`
      : `ban-${Date.now()}`;
  });

  const loadMembers = useCallback(async () => {
    if (!activeRef.current) return;
    setMembersLoading(true);
    setMembersError(null);
    try {
      const data = await fetchCompanionMembers(group.publicationId);
      if (activeRef.current) setMembersData(data);
    } catch (err) {
      if (activeRef.current && !handleAccessError(err)) setMembersError(err instanceof Error ? err.message : "Không thể tải danh sách thành viên.");
    } finally {
      if (activeRef.current) setMembersLoading(false);
    }
  }, [group.publicationId, handleAccessError]);

  useEffect(() => {
    if (activeTab === "members" && !membersData && !membersLoading && !membersError) {
      void loadMembers();
    }
  }, [activeTab, membersData, membersLoading, membersError, loadMembers]);

  const handleOpenBanModal = (member: CompanionMembers["members"][number]) => {
    setMemberToBan(member);
    setBanStatus("idle");
    setBanError(null);
    setBanKey(
      typeof crypto !== "undefined" && crypto.randomUUID
        ? `ban-${crypto.randomUUID()}`
        : `ban-${Date.now()}`,
    );
  };

  const handleConfirmBan = async () => {
    if (!activeRef.current || !memberToBan || banStatus === "submitting") return;
    setBanStatus("submitting");
    setBanError(null);

    try {
      const outcome = await banCompanionMember(group.publicationId, memberToBan.userId, banKey);
      if (!activeRef.current) return;
      if (outcome.status === "FAILED" && handleAccessError(outcome)) return;
      if (outcome.status === "SUCCESS") {
        setMembersData((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            members: prev.members.filter((m) => m.userId !== memberToBan.userId),
          };
        });
        setMemberToBan(null);
        setBanStatus("idle");
        void refreshGroup();
        router.refresh();
      } else if (outcome.status === "UNKNOWN") {
        setBanStatus("unknown");
        setBanError(
          outcome.error?.message ||
            "Chưa nhận được phản hồi xác nhận từ máy chủ. Vui lòng bấm thử lại.",
        );
      } else {
        setBanStatus("failed");
        setBanError(outcome.error?.message || "Không thể loại thành viên.");
        if (typeof crypto !== "undefined" && crypto.randomUUID) {
          setBanKey(`ban-${crypto.randomUUID()}`);
        }
      }
    } catch (err: unknown) {
      if (!activeRef.current || handleAccessError(err)) return;
      setBanStatus("unknown");
      setBanError(err instanceof Error ? err.message : "Lỗi kết nối khi gửi yêu cầu.");
    }
  };

  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [leaveStatus, setLeaveStatus] = useState<"idle" | "submitting" | "failed">("idle");
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [leaveKey, setLeaveKey] = useState<string>(() => {
    return typeof crypto !== "undefined" && crypto.randomUUID
      ? `leave-${crypto.randomUUID()}`
      : `leave-${Date.now()}`;
  });

  const isHost = currentGroup.relationship === "HOST";
  const totalMembersCount = membersData ? membersData.members.length + 1 : currentGroup.memberCount;
  const transportLabel = currentGroup.introduction.transport === "CAR" ? "Ô tô" : "Xe máy";
  const dateRangeLabel = formatRangeVi(currentGroup.introduction.startDate, currentGroup.introduction.endDate);
  const hostInitial = currentGroup.introduction.host.displayName.slice(0, 1).toUpperCase();

  const handleViewLatestItinerary = async () => {
    setActiveTab("itinerary");
    await refreshGroup();
  };

  const handleLeaveGroup = async () => {
    if (!activeRef.current || leaveStatus === "submitting") return;
    setLeaveStatus("submitting");
    setLeaveError(null);

    try {
      const outcome = await leaveCompanionTrip(group.publicationId, leaveKey);
      if (!activeRef.current) return;
      if (outcome.status === "FAILED" && handleAccessError(outcome)) return;
      if (outcome.status === "SUCCESS") {
        activeRef.current = false;
        onAccessLostRef.current();
        router.push(`/trip-companions/${group.publicationId}` as Route);
      } else if (outcome.status === "UNKNOWN") {
        setLeaveStatus("failed");
        setLeaveError("Chưa nhận được phản hồi xác nhận từ máy chủ. Vui lòng bấm thử lại.");
      } else {
        setLeaveStatus("failed");
        setLeaveError(outcome.error?.message || "Không thể rời nhóm.");
        if (typeof crypto !== "undefined" && crypto.randomUUID) {
          setLeaveKey(`leave-${crypto.randomUUID()}`);
        }
      }
    } catch (err: unknown) {
      if (!activeRef.current || handleAccessError(err)) return;
      setLeaveStatus("failed");
      setLeaveError(err instanceof Error ? err.message : "Đã xảy ra lỗi khi rời nhóm.");
    }
  };

  return (
    <div className="companion-container" data-testid="companion-group-view">
      {/* ─── Breadcrumbs ─── */}
      <div className="companion-breadcrumbs">
        <Link href="/">Trang chủ</Link>
        <span className="companion-breadcrumbs-sep">/</span>
        <Link href={"/trip-companions" as Route}>Tìm bạn đồng hành</Link>
        <span className="companion-breadcrumbs-sep">/</span>
        <Link href={`/trip-companions/${group.publicationId}` as Route}>
          {group.introduction.title}
        </Link>
        <span className="companion-breadcrumbs-sep">/</span>
        <span>Không gian nhóm</span>
      </div>

      {/* ─── Group Header & Hero Billboard ─── */}
      <header className="companion-group-hero" aria-labelledby="group-hero-title">
        {/* Subtle highland contour topography & ambient glow */}
        <div className="companion-hero-ambient" aria-hidden="true">
          <div className="companion-hero-glow" />
          <svg className="companion-hero-topo" viewBox="0 0 1000 300" preserveAspectRatio="none">
            <path d="M0,160 Q250,80 500,150 T1000,110 L1000,300 L0,300 Z" fill="rgba(255,255,255,0.03)" />
            <path d="M0,200 Q280,120 580,190 T1000,150 L1000,300 L0,300 Z" fill="rgba(233,185,75,0.04)" />
            <path d="M0,230 Q340,170 680,220 T1000,180 L1000,300 L0,300 Z" fill="rgba(255,255,255,0.02)" />
          </svg>
        </div>

        <div className="companion-hero-content">
          <div className="companion-hero-header-row">
            <div className="companion-hero-title-group">
              <div className="companion-hero-badge-row">
                <span className="companion-hero-badge">
                  <span className="companion-badge-dot" aria-hidden="true" />
                  <ShieldCheck size={14} aria-hidden="true" />
                  <span>{isHost ? "Bạn là chủ chuyến" : "Bạn là thành viên nhóm"}</span>
                </span>
                <span className="companion-hero-tag">Không gian nhóm</span>
              </div>
              <h1 id="group-hero-title" className="companion-hero-title">
                {group.introduction.title}
              </h1>
            </div>

            <div className="companion-group-actions">
              <Link
                href={`/trip-companions/${group.publicationId}` as Route}
                className="companion-hero-action companion-hero-action-outline"
              >
                <ExternalLink size={15} aria-hidden="true" />
                <span>Xem trang giới thiệu</span>
              </Link>

              {isHost ? (
                <Link
                  href={`/trip-companions/${group.publicationId}/manage` as Route}
                  className="companion-hero-action companion-hero-action-primary"
                  data-testid="group-manage-companion-link"
                >
                  <Settings size={15} aria-hidden="true" />
                  <span>Quản lý tuyển</span>
                </Link>
              ) : null}

              {isHost && tripId ? (
                <Link
                  href={`/trips/${tripId}/edit` as Route}
                  className="companion-hero-action companion-hero-action-secondary"
                >
                  <Edit3 size={15} aria-hidden="true" />
                  <span>Chỉnh sửa lịch gốc</span>
                </Link>
              ) : null}
            </div>
          </div>

          {/* 4 Summary Stat Cards */}
          <div className="companion-hero-stats-grid" aria-label="Thông số hành trình đoàn">
            <div className="companion-hero-stat-item">
              <div className="companion-stat-icon">
                <CalendarDays size={18} aria-hidden="true" />
              </div>
              <div className="companion-stat-info">
                <span className="companion-stat-label">Thời gian</span>
                <strong className="companion-stat-value">
                  {dateRangeLabel}
                </strong>
              </div>
            </div>

            <div className="companion-hero-stat-item">
              <div className="companion-stat-icon">
                <Clock3 size={18} aria-hidden="true" />
              </div>
              <div className="companion-stat-info">
                <span className="companion-stat-label">Thời lượng</span>
                <strong className="companion-stat-value">
                  {group.introduction.durationDays} ngày {Math.max(1, group.introduction.durationDays - 1)} đêm
                </strong>
              </div>
            </div>

            <div className="companion-hero-stat-item">
              <div className="companion-stat-icon">
                <CarFront size={18} aria-hidden="true" />
              </div>
              <div className="companion-stat-info">
                <span className="companion-stat-label">Phương tiện</span>
                <strong className="companion-stat-value">{transportLabel}</strong>
              </div>
            </div>

            <div className="companion-hero-stat-item">
              <div className="companion-stat-icon">
                <Users size={18} aria-hidden="true" />
              </div>
              <div className="companion-stat-info">
                <span className="companion-stat-label">Thành viên đoàn</span>
                <strong className="companion-stat-value">
                  {totalMembersCount} thành viên
                </strong>
              </div>
            </div>
          </div>

          {/* Fallback container for test assertions and screen readers */}
          <div className="companion-group-meta-bar sr-only" aria-hidden="true">
            <span className="companion-meta-item">
              <CalendarDays size={15} aria-hidden="true" />
              <span>{dateRangeLabel} ({group.introduction.durationDays} ngày)</span>
            </span>
            <span className="companion-meta-sep">•</span>
            <span className="companion-meta-item">
              <CarFront size={15} aria-hidden="true" />
              <span>{transportLabel}</span>
            </span>
            <span className="companion-meta-sep">•</span>
            <span className="companion-meta-item">
              <Users size={15} aria-hidden="true" />
              <span>{totalMembersCount} thành viên (bao gồm chủ chuyến)</span>
            </span>
          </div>
        </div>
      </header>

      {/* ─── Canceled or Completed Banners ─── */}
      {currentGroup.canceledAt ? (
        <div
          className="companion-read-only-banner bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 mb-6"
          role="alert"
          data-testid="companion-group-canceled-banner"
        >
          <AlertTriangle size={18} className="shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
          <div>
            <strong className="block font-semibold">Chuyến đồng hành này đã bị chủ chuyến hủy</strong>
            <p className="text-xs sm:text-sm mt-0.5 m-0 opacity-90">
              Bài đăng đã hủy vào {formatDateVi(currentGroup.canceledAt.slice(0, 10))}. Toàn bộ lịch trình và lịch sử trao đổi được lưu trữ ở chế độ chỉ đọc.
            </p>
          </div>
        </div>
      ) : isCompletedTrip ? (
        <div
          className="companion-read-only-banner bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-300 mb-6"
          role="note"
          data-testid="companion-group-completed-banner"
        >
          <CheckCircle2 size={18} className="shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          <span>
            Chuyến đi đã hoàn tất hành trình ({formatDateVi(group.introduction.endDate)}). Không gian nhóm và trò chuyện vẫn tiếp tục hoạt động bình thường để các thành viên trao đổi và chia sẻ kỷ niệm.
          </span>
        </div>
      ) : null}

      {/* ─── Navigation Tabs ─── */}
      <div className="companion-group-tabs companion-discovery-tabs" role="tablist" aria-label="Các phần của nhóm đồng hành">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "itinerary"}
          className={`companion-tab-btn companion-group-tab ${activeTab === "itinerary" ? "is-active" : ""}`}
          onClick={() => {
            setActiveTab("itinerary");
            void refreshGroup();
          }}
          data-testid="group-tab-itinerary"
        >
          <CalendarDays size={16} className="shrink-0" aria-hidden="true" />
          <span className="companion-tab-label">
            <span className="companion-tab-label-full">Lịch trình chi tiết</span>
            <span className="companion-tab-label-short">Lịch trình</span>
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "chat"}
          className={`companion-tab-btn companion-group-tab ${activeTab === "chat" ? "is-active" : ""}`}
          onClick={() => {
            setActiveTab("chat");
          }}
          data-testid="group-tab-chat"
        >
          <MessageSquare size={16} className="shrink-0" aria-hidden="true" />
          <span className="companion-tab-label">
            <span className="companion-tab-label-full">Trò chuyện nhóm</span>
            <span className="companion-tab-label-short">Trò chuyện</span>
          </span>
          {unreadBadgeCount > 0 && activeTab !== "chat" && (
            <span
              className="companion-tab-unread-pill"
              data-testid="group-chat-unread-badge"
            >
              {unreadBadgeCount}
            </span>
          )}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "members"}
          className={`companion-tab-btn companion-group-tab ${activeTab === "members" ? "is-active" : ""}`}
          onClick={() => setActiveTab("members")}
          data-testid="group-tab-members"
        >
          <Users size={16} className="shrink-0" aria-hidden="true" />
          <span className="companion-tab-label">
            <span className="companion-tab-label-full">Thành viên ({totalMembersCount})</span>
            <span className="companion-tab-label-short">Thành viên ({totalMembersCount})</span>
          </span>
        </button>
      </div>

      {/* ─── Tab Content: Itinerary ─── */}
      {activeTab === "itinerary" && (
        <section aria-labelledby="group-itinerary-heading" className="space-y-6">
          <h2 id="group-itinerary-heading" className="sr-only">
            Lịch trình chi tiết của nhóm
          </h2>

          <div className="sr-only" role="note">
            <span>
              Lịch trình chính thức do chủ chuyến cập nhật{currentGroup.itineraryRevision ? ` (Bản cập nhật #${currentGroup.itineraryRevision})` : ""}. Thành viên trong nhóm có quyền xem toàn bộ thời gian và điểm đến.
            </span>
          </div>



          {/* Mobile Tab Toggle between Itinerary and Map */}
          <div className="companion-mobile-toggle" role="tablist" aria-label="Chuyển chế độ xem">
            <button
              type="button"
              role="tab"
              aria-selected={mobileTab === "itinerary"}
              className={`companion-mobile-tab-btn ${mobileTab === "itinerary" ? "is-active" : ""}`}
              onClick={() => setMobileTab("itinerary")}
            >
              <Calendar size={15} aria-hidden="true" />
              <span>Lịch trình</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mobileTab === "map"}
              className={`companion-mobile-tab-btn ${mobileTab === "map" ? "is-active" : ""}`}
              onClick={() => setMobileTab("map")}
            >
              <Map size={15} aria-hidden="true" />
              <span>Bản đồ ({totalDestinations})</span>
            </button>
          </div>

          {/* 2-Column Desktop Grid: Left Itinerary Timeline, Right Sticky Interactive Map */}
          <div className={`companion-main-grid companion-view-${mobileTab}`}>
            {/* Left Column: Itinerary Timeline */}
            <div className="companion-timeline-column">
              <div className="companion-days">
                {currentGroup.itinerary.days.map((day) => {
                  const isDimmed = activeDayIndex !== null && activeDayIndex !== day.dayIndex;
                  let dayWeekday = "";
                  try {
                    dayWeekday = new Intl.DateTimeFormat("vi-VN", { weekday: "long", timeZone: "UTC" }).format(
                      new Date(`${day.localDate}T00:00:00Z`)
                    );
                  } catch {
                    // ignore
                  }

                  return (
                    <section
                      key={day.dayIndex}
                      id={`companion-day-${day.dayIndex}`}
                      className={`companion-day ${isDimmed ? "companion-day-dimmed" : ""}`}
                      aria-labelledby={`companion-day-title-${day.dayIndex}`}
                    >
                      <div className="companion-day-heading">
                        <span className="companion-timeline-node" aria-hidden="true" />
                        <div className="companion-day-title-wrap">
                          <div
                            className="companion-day-number-tag"
                            style={{
                              background: `var(--planner-route-${((day.dayIndex - 1) % 3) + 1})`,
                            }}
                          >
                            Ngày {day.dayIndex}
                          </div>
                          <div className="companion-day-title-inner">
                            <h3 id={`companion-day-title-${day.dayIndex}`} className="companion-day-h3">
                              Ngày {day.dayIndex}
                            </h3>
                            <p>
                              {dayWeekday ? `${dayWeekday}, ` : ""}{formatDateVi(day.localDate)}
                            </p>
                          </div>
                        </div>

                        <div className="companion-day-meta">
                          <span>
                            <CarFront size={15} aria-hidden="true" />
                            Di chuyển bằng {transportLabel.toLowerCase()}
                          </span>
                          <span>
                            <MapPin size={15} aria-hidden="true" />
                            {day.visits.length} điểm dừng
                          </span>
                        </div>
                      </div>

                      {day.visits.length === 0 ? (
                        <div className="companion-day-empty">
                          <p>Chưa có điểm dừng nào được lên lịch cho ngày này.</p>
                        </div>
                      ) : (
                        <ol className="companion-visits">
                          {day.visits.map((visit) => {
                            const destId = visit.destination.destinationId || visit.visitId;
                            const isUnavailable = visit.destination.availability === "UNAVAILABLE";
                            const startTimeStr = formatMinuteOfDay(visit.startMinute);
                            const endTimeStr = formatMinuteOfDay(visit.startMinute + visit.plannedDurationMinutes);
                            const isSelected = selectedDestinationId === destId;
                            const area = inferDestinationArea(visit.destination.name);
                            const visual = getDestinationVisual(visit.destination.name, area);

                            return (
                              <li
                                key={visit.visitId}
                                id={`companion-visit-${destId}`}
                                className={`companion-visit-item ${isSelected ? "is-selected-item" : ""}`}
                                onClick={() => handleSelectDestination(destId)}
                              >
                                <span className="companion-timeline-node" aria-hidden="true" />
                                <div className="companion-visit-time">
                                  <strong>{startTimeStr}</strong>
                                  <span>{visit.plannedDurationMinutes} phút</span>
                                </div>

                                <Card className={`companion-visit-card ${isSelected ? "is-active-selection" : ""}`}>
                                  {/* Scenic photo thumbnail */}
                                  <div
                                    className="companion-visit-media"
                                    role="img"
                                    aria-label={visual.alt}
                                  >
                                    <img
                                      src={visual.src}
                                      alt={visual.alt}
                                      className="companion-visit-photo"
                                      loading="lazy"
                                    />
                                    <div className="companion-visit-photo-gradient" />
                                    <span className="companion-visit-seq-tag">#{visit.order}</span>
                                  </div>

                                  <div className="companion-visit-place">
                                    <div className="companion-visit-top">
                                      <span className="companion-order-label">Điểm dừng {visit.order}</span>
                                      <span className="companion-visit-chip">
                                        <Clock3 size={12} aria-hidden="true" />
                                        <span>{visit.plannedDurationMinutes} phút</span>
                                      </span>
                                    </div>

                                    <h4 className="companion-destination-name">
                                      {visit.destination.availability === "AVAILABLE" && visit.destination.destinationId ? (
                                        <Link
                                          href={`/destinations/${visit.destination.destinationId}` as Route}
                                          className="companion-destination-link"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <span>{visit.destination.name}</span>
                                          <ChevronRight size={15} className="companion-chevron" aria-hidden="true" />
                                        </Link>
                                      ) : (
                                        visit.destination.name
                                      )}
                                    </h4>

                                    <div className="companion-visit-meta">
                                      <p className="companion-visit-meta-item">
                                        <MapPin size={14} aria-hidden="true" />
                                        <span>{area}</span>
                                      </p>
                                      <p className="companion-visit-meta-item">
                                        <Clock3 size={14} aria-hidden="true" />
                                        <span>{startTimeStr} – {endTimeStr} ({visit.plannedDurationMinutes} phút)</span>
                                      </p>
                                      {visit.destination.latitude && visit.destination.longitude ? (
                                        <p className="companion-visit-meta-item companion-geo-text">
                                          <span>{visit.destination.latitude.toFixed(4)}, {visit.destination.longitude.toFixed(4)}</span>
                                        </p>
                                      ) : null}
                                    </div>

                                    {isUnavailable && (
                                      <span className="companion-unavailable-pill" role="status">
                                        <AlertTriangle size={12} aria-hidden="true" />
                                        <span>Điểm đến không còn khả dụng</span>
                                      </span>
                                    )}
                                  </div>
                                </Card>
                              </li>
                            );
                          })}
                        </ol>
                      )}
                    </section>
                  );
                })}
              </div>
            </div>

            {/* Right Column: Sticky Interactive Map */}
            <div className="companion-map-column">
              <div className="companion-map-sticky">
                {plannerDays.some((d) => d.stops.length > 0) ? (
                  <ItineraryMap
                    day={activePlannerDay}
                    days={plannerDays}
                    selectedDestinationId={selectedDestinationId}
                    focusSelection={focusSelection}
                    onSelect={handleSelectDestination}
                    overviewOnly={activeDayIndex === null}
                  />
                ) : (
                  <div className="companion-map-empty">
                    <Mountain size={36} aria-hidden="true" />
                    <p>Chưa có điểm dừng để hiển thị trên bản đồ.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ─── Tab Content: Chat ─── */}
      {activeTab === "chat" && (
        <section aria-labelledby="group-chat-heading" className="space-y-4">
          <h2 id="group-chat-heading" className="sr-only">
            Trò chuyện nhóm đồng hành
          </h2>

          <div className="companion-chat-card" data-testid="companion-chat-card">
            {/* Chat Header */}
            <div className="companion-chat-header">
              <h3 className="companion-chat-header-title">
                <MessageSquare size={16} aria-hidden="true" />
                <span>Không gian trao đổi chuyến đi</span>
              </h3>
              <span className="companion-chat-header-badge">
                <ShieldCheck size={12} aria-hidden="true" />
                <span>Chỉ thành viên đoàn mới xem được</span>
              </span>
            </div>

            {/* Transcript */}
            <div
              className="companion-chat-transcript"
              data-testid="companion-chat-transcript"
              ref={transcriptContainerRef}
            >
              {chatHistory?.olderCursor ? (
                <button
                  type="button"
                  className="companion-chat-older-btn"
                  onClick={handleLoadOlder}
                  disabled={loadingOlder}
                  data-testid="companion-chat-load-older-btn"
                >
                  {loadingOlder ? (
                    <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Clock3 size={13} aria-hidden="true" />
                  )}
                  <span>{loadingOlder ? "Đang tải tin cũ..." : "Tải tin nhắn cũ hơn"}</span>
                </button>
              ) : null}

              {chatLoading && !chatHistory ? (
                <div className="companion-chat-empty">
                  <Loader2 size={24} className="animate-spin inline mb-2" aria-hidden="true" />
                  <p className="m-0">Đang tải cuộc trò chuyện...</p>
                </div>
              ) : chatError ? (
                <div className="companion-error-notice m-4" role="alert">
                  <AlertCircle size={16} aria-hidden="true" />
                  <span>{chatError}</span>
                  <button
                    type="button"
                    className="underline ml-2 font-medium"
                    onClick={() => void loadMessages()}
                  >
                    Thử lại
                  </button>
                </div>
              ) : chatHistory && chatHistory.items.length === 0 ? (
                <div className="companion-chat-empty" data-testid="companion-chat-empty">
                  <MessageSquare size={32} className="mx-auto mb-2 opacity-40" aria-hidden="true" />
                  <p className="font-medium text-foreground m-0">Chưa có tin nhắn nào</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Hãy là người đầu tiên gửi tin nhắn chào đoàn hoặc trao đổi chuẩn bị!
                  </p>
                </div>
              ) : chatHistory && chatHistory.items.length > 0 ? (
                chatHistory.items.map((msg) => {
                  if (msg.kind === "SYSTEM") {
                    return (
                      <div
                        key={msg.id}
                        className="companion-chat-msg-system"
                        data-testid={`companion-msg-${msg.id}`}
                        data-companion-sequence={msg.sequence}
                      >
                        <div className="companion-chat-system-pill">
                          <Info size={14} aria-hidden="true" className="shrink-0" />
                          <span>{msg.text}</span>
                          {msg.notice?.type === "ITINERARY_CHANGED" && (
                            <div className="companion-chat-notice-actions">
                              {msg.notice.changes && (
                                <div className="companion-chat-notice-tags">
                                  {msg.notice.changes.dates && (
                                    <span className="companion-notice-tag">Đổi ngày</span>
                                  )}
                                  {msg.notice.changes.destinations && (
                                    <span className="companion-notice-tag">Đổi điểm</span>
                                  )}
                                  {msg.notice.changes.times && (
                                    <span className="companion-notice-tag">Đổi giờ</span>
                                  )}
                                </div>
                              )}
                              <button
                                type="button"
                                className="companion-chat-system-action-btn"
                                onClick={() => void handleViewLatestItinerary()}
                                data-testid="companion-chat-view-itinerary-btn"
                              >
                                Xem lịch trình chi tiết
                              </button>
                            </div>
                          )}
                          <span className="text-xs opacity-60 ml-1">
                            {formatMessageTimeVi(msg.createdAt)}
                          </span>
                        </div>
                      </div>
                    );
                  }

                  const hostUserId = membersData?.host.userId;
                  const isOwn = currentUserId
                    ? msg.author.userId === currentUserId
                    : isHost && hostUserId
                      ? msg.author.userId === hostUserId
                      : false;
                  const initial = msg.author.displayName.slice(0, 1).toUpperCase();

                  return (
                    <div
                      key={msg.id}
                      className={`companion-chat-msg ${isOwn ? "companion-chat-msg-own" : "companion-chat-msg-other"}`}
                      data-testid={`companion-msg-${msg.id}`}
                      data-companion-sequence={msg.sequence}
                    >
                      {msg.author.avatarUrl ? (
                        <img
                          src={msg.author.avatarUrl}
                          alt=""
                          className="companion-chat-avatar"
                        />
                      ) : (
                        <div className="companion-chat-avatar" aria-hidden="true">
                          {initial}
                        </div>
                      )}

                      <div className="companion-chat-msg-body">
                        <div className="companion-chat-author-line">
                          <span className="companion-chat-author-name">
                            {isOwn ? "Bạn" : msg.author.displayName}
                          </span>
                          <span className="companion-chat-time">
                            {formatMessageTimeVi(msg.createdAt)}
                          </span>
                        </div>
                        <div className="companion-chat-bubble">
                          {renderSafeMessageContent(msg.text)}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : null}

              <div ref={transcriptEndRef} />
            </div>

            {/* Readonly Banner or Composer */}
            {chatHistory && (!chatHistory.canSend || currentGroup.canSend === false) ? (
              <div className="companion-chat-readonly-banner" role="status" data-testid="companion-chat-readonly-banner">
                <AlertTriangle size={15} aria-hidden="true" className="shrink-0 text-amber-600" />
                <span>
                  Chuyến đi này hiện ở chế độ chỉ đọc. Không thể gửi thêm tin nhắn mới.
                </span>
              </div>
            ) : (
              <form onSubmit={handleSendMessage} className="companion-chat-composer">
                {composerError ? (
                  <div className="companion-error-notice mb-2" role="alert">
                    <AlertCircle size={15} aria-hidden="true" className="shrink-0" />
                    <span className="text-xs">{composerError}</span>
                  </div>
                ) : null}

                <div className="companion-chat-composer-row">
                  <textarea
                    value={composerText}
                    onChange={(e) => { if (!sendAttemptRef.current && !sendingRef.current) setComposerText(e.target.value); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void handleSendMessage();
                      }
                    }}
                    placeholder="Nhập tin nhắn trao đổi với đoàn (Enter để gửi, Shift+Enter xuống dòng)..."
                    className="companion-chat-input"
                    rows={1}
                    maxLength={4000}
                    disabled={composerStatus === "sending" || composerStatus === "unknown" || reconciling || !chatHistory}
                    data-testid="companion-chat-input"
                    aria-label="Nội dung tin nhắn"
                  />

                  {composerStatus === "unknown" ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="companion-chat-reconcile-btn"
                        onClick={() => void handleReconcileMessage()}
                        disabled={reconciling}
                        data-testid="companion-chat-reconcile-btn"
                        title="Kiểm tra đối soát tin nhắn trên máy chủ"
                      >
                        {reconciling ? (
                          <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                        ) : (
                          <RefreshCw size={14} aria-hidden="true" />
                        )}
                        <span>{reconciling ? "Đang đối soát..." : "Đối soát"}</span>
                      </button>
                      <button
                        type="button"
                        className="companion-danger-button h-[44px] text-xs px-3"
                        onClick={() => void handleSendMessage()}
                        disabled={reconciling}
                        data-testid="companion-chat-retry-btn"
                        title="Thử lại gửi tin nhắn với cùng khóa và nội dung"
                      >
                        <RotateCcw size={14} aria-hidden="true" />
                        <span>Thử lại</span>
                      </button>
                    </div>
                  ) : (
                    <button
                      type="submit"
                      className="companion-chat-send-btn"
                      disabled={!composerText.trim() || composerStatus === "sending"}
                      data-testid="companion-chat-send-btn"
                      aria-label="Gửi tin nhắn"
                    >
                      {composerStatus === "sending" ? (
                        <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                      ) : (
                        <Send size={16} aria-hidden="true" />
                      )}
                      <span>Gửi</span>
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>
        </section>
      )}

      {/* ─── Tab Content: Members ─── */}
      {activeTab === "members" && (
        <section aria-labelledby="group-members-heading" className="space-y-6">
          <h2 id="group-members-heading" className="sr-only">
            Danh sách thành viên nhóm
          </h2>

          <div className="companion-card p-6">
            <h3 className="companion-section-title mb-4">Thông tin đoàn đồng hành</h3>

            <div className="companion-capacity-highlight mb-6">
              <span className="companion-capacity-badge">
                {totalMembersCount} thành viên trong nhóm
              </span>
              <p className="companion-capacity-sub">
                Chuyến mở tìm thêm {group.introduction.additionalCapacity} chỗ. Hiện còn {group.introduction.availablePlaces} chỗ trống.
              </p>
            </div>

            {/* Host Card */}
            <div className="companion-host-card mb-6">
              {(membersData?.host.avatarUrl ?? group.introduction.host.avatarUrl) ? (
                <img
                  src={membersData?.host.avatarUrl ?? group.introduction.host.avatarUrl ?? ""}
                  alt=""
                  className="companion-host-avatar"
                />
              ) : (
                <div className="companion-host-avatar" aria-hidden="true">
                  {hostInitial}
                </div>
              )}
              <div className="companion-host-info">
                <strong>{membersData?.host.displayName ?? group.introduction.host.displayName}</strong>
                <span className="text-emerald-700 dark:text-emerald-400 font-medium">Chủ chuyến</span>
              </div>
            </div>

            {/* Members Section */}
            <div className="companion-members-subheading mt-6 mb-3">
              <h4 className="font-semibold text-foreground text-sm uppercase tracking-wider">
                Thành viên tham gia ({membersData ? membersData.members.length : "..."})
              </h4>
            </div>

            {membersLoading ? (
              <div className="companion-empty-members">
                <Loader2 size={18} className="animate-spin inline mr-2" aria-hidden="true" />
                <span>Đang tải danh sách thành viên...</span>
              </div>
            ) : membersError ? (
              <div className="companion-error-notice mb-4" role="alert">
                <AlertCircle size={16} aria-hidden="true" />
                <span>{membersError}</span>
                <button
                  type="button"
                  className="underline ml-2 font-medium"
                  onClick={() => void loadMembers()}
                >
                  Thử lại
                </button>
              </div>
            ) : membersData && membersData.members.length === 0 ? (
              <div className="companion-empty-members">
                Chưa có thành viên nào khác tham gia chuyến đi ngoài chủ chuyến.
              </div>
            ) : membersData && membersData.members.length > 0 ? (
              <div className="companion-member-list" data-testid="companion-member-list">
                {membersData.members.map((member) => {
                  const initial = member.displayName.slice(0, 1).toUpperCase();
                  return (
                    <div
                      key={member.userId}
                      className="companion-member-card"
                      data-testid={`companion-member-${member.userId}`}
                    >
                      <div className="companion-member-card-left">
                        {member.avatarUrl ? (
                          <img
                            src={member.avatarUrl}
                            alt=""
                            className="companion-member-avatar"
                          />
                        ) : (
                          <div className="companion-member-avatar" aria-hidden="true">
                            {initial}
                          </div>
                        )}
                        <div className="companion-member-info">
                          <span className="companion-member-name">{member.displayName}</span>
                          <span className="companion-member-joined">
                            Tham gia: {formatDateVi(member.joinedAt.slice(0, 10))}
                          </span>
                        </div>
                      </div>

                      {isHost ? (
                        <button
                          type="button"
                          className="companion-ban-button"
                          onClick={() => handleOpenBanModal(member)}
                          data-testid={`companion-ban-member-btn-${member.userId}`}
                          aria-label={`Loại ${member.displayName} khỏi nhóm`}
                        >
                          <UserX size={14} aria-hidden="true" />
                          <span>Loại khỏi nhóm</span>
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}

            <div className="companion-action-notice mt-6 mb-6" role="note">
              <p className="m-0 text-sm">
                Các thành viên trong nhóm được bảo vệ danh tính cá nhân. Mọi thông tin trao đổi sẽ diễn ra trong không gian thảo luận chung của nhóm.
              </p>
            </div>

            {/* Member Action: Leave Group */}
            {!isHost ? (
              <div className="companion-leave-section pt-4 border-t border-border">
                <button
                  type="button"
                  className="companion-leave-button"
                  onClick={() => setIsLeaveModalOpen(true)}
                  data-testid="companion-open-leave-modal"
                >
                  <LogOut size={16} aria-hidden="true" />
                  <span>Rời nhóm chuyến đi</span>
                </button>
              </div>
            ) : null}
          </div>
        </section>
      )}

      {/* ─── Confirmation Modal: Leave Group ─── */}
      {isLeaveModalOpen && (
        <div className="companion-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="leave-modal-title">
          <div className="companion-modal-box">
            <h3 id="leave-modal-title" className="companion-modal-title text-red-600 dark:text-red-400">
              Xác nhận rời nhóm chuyến đi
            </h3>
            <div className="companion-modal-copy space-y-2 text-sm text-foreground/80 my-3">
              <p className="font-medium text-foreground">Khi bạn rời nhóm:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  <strong>Mất quyền truy cập:</strong> Bạn sẽ không còn xem được lịch trình chi tiết và không gian nhóm.
                </li>
                <li>
                  <strong>Hoàn trả chỗ:</strong> 1 chỗ tìm thêm sẽ được hoàn trả cho chuyến đi để người khác có thể tham gia (nếu chuyến đi vẫn mở tuyển).
                </li>
                <li>
                  <strong>Lưu trữ thảo luận:</strong> Các tin nhắn bạn đã gửi trước đó vẫn được lưu trong lịch sử nhóm để bảo đảm tính toàn vẹn của cuộc trò chuyện.
                </li>
              </ul>
              <p className="text-xs text-muted-foreground pt-1">
                Bạn vẫn có thể tham gia lại sau này nếu chuyến đi chưa đến ngày khởi hành và vẫn còn chỗ trống.
              </p>
            </div>

            {leaveError && (
              <div className="companion-error-notice mb-4" role="alert">
                <AlertCircle size={16} aria-hidden="true" />
                <span>{leaveError}</span>
              </div>
            )}

            <div className="companion-modal-actions">
              <button
                type="button"
                className="companion-secondary-button"
                onClick={() => setIsLeaveModalOpen(false)}
                disabled={leaveStatus === "submitting"}
              >
                Hủy bỏ
              </button>

              <button
                type="button"
                className="companion-danger-button"
                onClick={handleLeaveGroup}
                disabled={leaveStatus === "submitting"}
                data-testid="companion-confirm-leave-btn"
              >
                {leaveStatus === "submitting" ? (
                  <>
                    <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                    <span>Đang rời nhóm...</span>
                  </>
                ) : leaveStatus === "failed" && leaveError?.includes("thử lại") ? (
                  <span>Thử lại rời nhóm</span>
                ) : (
                  <span>Xác nhận rời nhóm</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Confirmation Modal: Ban Member ─── */}
      {memberToBan && (
        <div
          className="companion-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ban-modal-title"
          data-testid="companion-ban-modal"
        >
          <div className="companion-modal-box">
            <h3
              id="ban-modal-title"
              className="companion-modal-title text-red-600 dark:text-red-400"
            >
              Xác nhận loại thành viên
            </h3>
            <div className="companion-modal-copy space-y-2 text-sm text-foreground/80 my-3">
              <p className="font-medium text-foreground">
                Bạn đang thực hiện loại thành viên <strong>{memberToBan.displayName}</strong> khỏi đoàn:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  <strong>Chặn vĩnh viễn:</strong> Tài khoản này sẽ bị thu hồi toàn bộ quyền xem lịch trình chi tiết và không gian nhóm, đồng thời không thể tham gia lại chuyến đi này.
                </li>
                <li>
                  <strong>Hoàn trả chỗ:</strong> 1 chỗ tìm thêm sẽ được hoàn trả cho chuyến đi (nếu bài tuyển vẫn đang mở).
                </li>
                <li>
                  <strong>Bảo toàn thảo luận:</strong> Các tin nhắn thành viên này đã gửi trước đó vẫn được lưu lại trong nhóm để giữ mạch cuộc trò chuyện.
                </li>
              </ul>
            </div>

            {banError && (
              <div className="companion-error-notice mb-4" role="alert">
                <AlertCircle size={16} aria-hidden="true" />
                <span>{banError}</span>
              </div>
            )}

            <div className="companion-modal-actions">
              <button
                type="button"
                className="companion-secondary-button"
                onClick={() => {
                  if (banStatus !== "submitting") {
                    setMemberToBan(null);
                  }
                }}
                disabled={banStatus === "submitting"}
              >
                Hủy bỏ
              </button>

              {banStatus === "unknown" ? (
                <button
                  type="button"
                  className="companion-danger-button"
                  onClick={handleConfirmBan}
                  data-testid="companion-retry-ban-btn"
                >
                  Thử lại loại thành viên
                </button>
              ) : (
                <button
                  type="button"
                  className="companion-danger-button"
                  onClick={handleConfirmBan}
                  disabled={banStatus === "submitting"}
                  data-testid="companion-confirm-ban-btn"
                >
                  {banStatus === "submitting" ? (
                    <>
                      <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                      <span>Đang xử lý...</span>
                    </>
                  ) : (
                    <span>Xác nhận loại</span>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
