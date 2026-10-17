"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import {
  hasRolePermission,
  type Permission,
} from "@/lib/authorization-capabilities";
import { resolveAuthReturnTo } from "@/lib/auth-return-to";
import {
  resolveIntentReturnTo,
  type AuthIntent,
} from "@/lib/auth-intent-config";
import { AuthRequiredDialog } from "./auth-required-dialog";

export interface OpenAuthModalOptions {
  intent: AuthIntent;
  returnTo?: string;
  triggerElement?: HTMLElement | null;
}

export interface ProtectedActionOptions extends OpenAuthModalOptions {
  requiredPermission?: Permission;
  onAuthorized?: () => void | Promise<void>;
}

export interface AuthRequiredContextValue {
  openAuthModal: (options: OpenAuthModalOptions) => void;
  closeAuthModal: () => void;
  executeProtectedAction: (options: ProtectedActionOptions) => Promise<boolean>;
  isAuthModalOpen: boolean;
  currentIntent: AuthIntent;
  returnTo: string;
  isSessionPending: boolean;
  sessionError: unknown;
  isAuthenticated: boolean;
  canUseTraveler: boolean;
  refetchSession: () => void;
}

const defaultAuthRequiredValue: AuthRequiredContextValue = {
  openAuthModal: ({ returnTo }) => {
    if (typeof window !== "undefined") {
      const path = returnTo ?? `${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.location.assign(resolveAuthReturnTo(path));
    }
  },
  closeAuthModal: () => {},
  executeProtectedAction: async () => false,
  isAuthModalOpen: false,
  currentIntent: "generic",
  returnTo: "/dashboard",
  isSessionPending: false,
  sessionError: null,
  isAuthenticated: false,
  canUseTraveler: false,
  refetchSession: () => {},
};

const AuthRequiredContext = createContext<AuthRequiredContextValue>(defaultAuthRequiredValue);

export function AuthRequiredProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending: isSessionPending, error: sessionError, refetch } =
    authClient.useSession();

  const [isOpen, setIsOpen] = useState(false);
  const [currentIntent, setCurrentIntent] = useState<AuthIntent>("generic");
  const [modalReturnTo, setModalReturnTo] = useState("/dashboard");
  const [triggerElement, setTriggerElement] = useState<HTMLElement | null>(null);

  const sessionRole = session?.user?.role;
  const isAuthenticated = Boolean(session?.user);
  const canUseTraveler = hasRolePermission(sessionRole, "traveler");

  const openAuthModal = useCallback(
    ({ intent, returnTo, triggerElement: el }: OpenAuthModalOptions) => {
      let resolved = "/dashboard";
      if (returnTo) {
        resolved = resolveAuthReturnTo(returnTo);
      } else if (typeof window !== "undefined") {
        resolved = resolveAuthReturnTo(
          `${window.location.pathname}${window.location.search}${window.location.hash}`
        );
      } else {
        resolved = resolveIntentReturnTo(intent);
      }

      setCurrentIntent(intent);
      setModalReturnTo(resolved);
      setTriggerElement(el ?? (document.activeElement as HTMLElement | null));
      setIsOpen(true);
    },
    []
  );

  const closeAuthModal = useCallback(() => {
    setIsOpen(false);
    setTriggerElement(null);
  }, []);

  const executeProtectedAction = useCallback(
    async ({
      intent,
      requiredPermission = "traveler",
      returnTo,
      onAuthorized,
      triggerElement: el,
    }: ProtectedActionOptions): Promise<boolean> => {
      // 1. Session Pending
      if (isSessionPending) {
        toast.info("Đang kiểm tra trạng thái đăng nhập, vui lòng đợi…");
        return false;
      }

      // 2. Auth Verification Error (Network/server failure - do NOT treat as guest!)
      if (sessionError) {
        toast.error("Không thể xác minh phiên đăng nhập. Vui lòng thử lại.", {
          action: {
            label: "Thử lại",
            onClick: () => void refetch(),
          },
        });
        return false;
      }

      // 3. User is Authenticated
      if (session?.user) {
        // Account Locked check
        const userStatus = (session.user as { status?: string }).status;
        if (userStatus === "LOCKED") {
          toast.error("Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.");
          return false;
        }

        // Check required permission
        if (hasRolePermission(session.user.role, requiredPermission)) {
          if (onAuthorized) {
            await onAuthorized();
          }
          return true;
        }

        // Insufficient permission (403) - do NOT open guest login modal
        toast.error("Bạn không có quyền thực hiện thao tác này.");
        return false;
      }

      // 4. Confirmed Guest
      openAuthModal({ intent, returnTo, triggerElement: el });
      return false;
    },
    [isSessionPending, sessionError, session, refetch, openAuthModal]
  );

  const value: AuthRequiredContextValue = useMemo(
    () => ({
      openAuthModal,
      closeAuthModal,
      executeProtectedAction,
      isAuthModalOpen: isOpen,
      currentIntent,
      returnTo: modalReturnTo,
      isSessionPending,
      sessionError,
      isAuthenticated,
      canUseTraveler,
      refetchSession: () => void refetch(),
    }),
    [
      openAuthModal,
      closeAuthModal,
      executeProtectedAction,
      isOpen,
      currentIntent,
      modalReturnTo,
      isSessionPending,
      sessionError,
      isAuthenticated,
      canUseTraveler,
      refetch,
    ]
  );

  return (
    <AuthRequiredContext.Provider value={value}>
      {children}
      <AuthRequiredDialog
        open={isOpen}
        intent={currentIntent}
        returnTo={modalReturnTo}
        onClose={closeAuthModal}
        triggerElement={triggerElement}
      />
    </AuthRequiredContext.Provider>
  );
}

export function useAuthRequired(): AuthRequiredContextValue {
  return useContext(AuthRequiredContext);
}
