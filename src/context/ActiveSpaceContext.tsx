import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthContext";
import type { FinancialSpace, ManagedSpaceRole } from "../types/domain";
import { supabase } from "../lib/supabase";
import {
  getFinancialSpaces,
  createManagedSpace as createManagedSpaceApi,
  renameManagedSpace as renameManagedSpaceApi,
  archiveManagedSpace as archiveManagedSpaceApi,
  restoreManagedSpace as restoreManagedSpaceApi,
  deleteManagedSpace as deleteManagedSpaceApi,
  leaveManagedSpace as apiLeaveManagedSpace,
  setActiveSpaceId as persistActiveSpaceId,
  getStoredActiveSpaceId,
  clearActiveSpaceState,
} from "../lib/spaces";
import { emitSpaceChanged } from "../lib/appEvents";

type ActiveSpaceContextValue = {
  spaces: FinancialSpace[];
  personalSpace: FinancialSpace | null;
  activeSpace: FinancialSpace | null;
  activeSpaceId: string | null;
  userRole: ManagedSpaceRole | "owner" | null;
  loading: boolean;
  getUserRole: (spaceOrId: FinancialSpace | string) => ManagedSpaceRole | "owner" | null;
  setActiveSpace: (spaceOrId: FinancialSpace | string) => void;
  createManagedSpace: (name: string) => Promise<FinancialSpace>;
  renameManagedSpace: (spaceId: string, name: string) => Promise<FinancialSpace>;
  archiveManagedSpace: (spaceId: string) => Promise<void>;
  restoreManagedSpace: (spaceId: string) => Promise<void>;
  deleteManagedSpace: (spaceId: string) => Promise<void>;
  leaveManagedSpace: (spaceId: string) => Promise<void>;
  refreshSpaces: (preferredSpaceId?: string) => Promise<void>;
};

const ActiveSpaceContext = createContext<ActiveSpaceContextValue | undefined>(undefined);

export function ActiveSpaceProvider({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const [spaces, setSpaces] = useState<FinancialSpace[]>([]);
  const [userRolesBySpaceId, setUserRolesBySpaceId] = useState<Record<string, ManagedSpaceRole | "owner">>({});
  const [activeSpaceId, setActiveSpaceIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const loadSpaces = useCallback(async (preferredSpaceId?: string) => {
    if (status !== "authenticated" || !user) {
      setSpaces([]);
      setUserRolesBySpaceId({});
      setActiveSpaceIdState(null);
      clearActiveSpaceState();
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [{ data, error }, { data: memberData }] = await Promise.all([
        getFinancialSpaces(),
        supabase
          .from("managed_space_members")
          .select("space_id, role")
          .eq("user_id", user.id)
          .eq("status", "active"),
      ]);

      if (error) {
        console.error("Failed to load financial spaces:", error);
        setLoading(false);
        return;
      }

      const spaceList = (data ?? []).filter((s) => !s.deleted_at);
      setSpaces(spaceList);

      const roleMap: Record<string, ManagedSpaceRole | "owner"> = {};
      spaceList.forEach((s) => {
        if (s.space_type === "personal" || s.owner_user_id === user.id) {
          roleMap[s.id] = "owner";
        } else {
          const mem = memberData?.find((m) => m.space_id === s.id);
          roleMap[s.id] = (mem?.role as ManagedSpaceRole) ?? "viewer";
        }
      });
      setUserRolesBySpaceId(roleMap);

      const personal = spaceList.find(
        (s) => s.space_type === "personal" && s.owner_user_id === user.id
      ) ?? null;

      const storedId = preferredSpaceId ?? getStoredActiveSpaceId(user.id);

      let resolvedSpace: FinancialSpace | null = null;
      if (storedId) {
        const found = spaceList.find(
          (s) => s.id === storedId && !s.is_archived && !s.deleted_at
        );
        if (found) {
          resolvedSpace = found;
        }
      }

      // Default/fallback to personal space
      if (!resolvedSpace) {
        resolvedSpace = personal;
      }

      const resolvedId = resolvedSpace?.id ?? null;
      setActiveSpaceIdState(resolvedId);
      persistActiveSpaceId(resolvedId, user.id);
    } catch (err) {
      console.error("Error initializing financial spaces:", err);
    } finally {
      setLoading(false);
    }
  }, [status, user]);

  useEffect(() => {
    if (status !== "authenticated" || !user) {
      setSpaces([]);
      setUserRolesBySpaceId({});
      setActiveSpaceIdState(null);
      clearActiveSpaceState();
      setLoading(false);
      return;
    }

    setActiveSpaceIdState(null);
    clearActiveSpaceState();
    void loadSpaces();
  }, [status, user?.id, loadSpaces]);

  const getUserRole = useCallback(
    (spaceOrId: FinancialSpace | string): ManagedSpaceRole | "owner" | null => {
      if (!user) return null;
      const targetId = typeof spaceOrId === "string" ? spaceOrId : spaceOrId.id;
      const targetSpace = typeof spaceOrId === "string"
        ? spaces.find((s) => s.id === spaceOrId)
        : spaceOrId;

      if (!targetSpace && !userRolesBySpaceId[targetId]) return null;
      if (targetSpace?.space_type === "personal" || targetSpace?.owner_user_id === user.id) {
        return "owner";
      }
      return userRolesBySpaceId[targetId] ?? null;
    },
    [user, spaces, userRolesBySpaceId]
  );

  const setActiveSpace = useCallback(
    (spaceOrId: FinancialSpace | string) => {
      if (!user) return;
      const targetId = typeof spaceOrId === "string" ? spaceOrId : spaceOrId.id;
      const targetSpace = spaces.find((s) => s.id === targetId && !s.is_archived && !s.deleted_at);

      let nextId: string | null = null;
      if (targetSpace) {
        nextId = targetSpace.id;
      } else {
        const personal = spaces.find((s) => s.space_type === "personal" && s.owner_user_id === user.id) ?? null;
        nextId = personal?.id ?? null;
      }

      setActiveSpaceIdState(nextId);
      persistActiveSpaceId(nextId, user.id);
      emitSpaceChanged();
    },
    [spaces, user]
  );

  const createManagedSpace = useCallback(
    async (name: string): Promise<FinancialSpace> => {
      const { data, error } = await createManagedSpaceApi(name);
      if (error || !data) {
        throw error || new Error("Gagal membuat Financial Space");
      }

      await loadSpaces(data.id);
      emitSpaceChanged();
      return data;
    },
    [loadSpaces]
  );

  const renameManagedSpace = useCallback(
    async (spaceId: string, name: string): Promise<FinancialSpace> => {
      const { data, error } = await renameManagedSpaceApi(spaceId, name);
      if (error || !data) {
        throw error || new Error("Gagal mengubah nama Financial Space");
      }

      await loadSpaces();
      emitSpaceChanged();
      return data;
    },
    [loadSpaces]
  );

  const archiveManagedSpace = useCallback(
    async (spaceId: string): Promise<void> => {
      const { error } = await archiveManagedSpaceApi(spaceId);
      if (error) {
        throw error;
      }

      // If active space is the one being archived, fallback to personal space
      const personal = spaces.find((s) => s.space_type === "personal" && s.owner_user_id === user?.id) ?? null;
      if (activeSpaceId === spaceId) {
        const fallbackId = personal?.id ?? null;
        setActiveSpaceIdState(fallbackId);
        persistActiveSpaceId(fallbackId, user?.id);
      }

      await loadSpaces();
      emitSpaceChanged();
    },
    [spaces, activeSpaceId, loadSpaces, user]
  );

  const restoreManagedSpace = useCallback(
    async (spaceId: string): Promise<void> => {
      const { error } = await restoreManagedSpaceApi(spaceId);
      if (error) {
        throw error;
      }

      await loadSpaces();
      emitSpaceChanged();
    },
    [loadSpaces]
  );

  const deleteManagedSpace = useCallback(
    async (spaceId: string): Promise<void> => {
      const { error } = await deleteManagedSpaceApi(spaceId);
      if (error) {
        throw error;
      }

      // If active space is the one being deleted, fallback to personal space
      const personal = spaces.find((s) => s.space_type === "personal" && s.owner_user_id === user?.id) ?? null;
      if (activeSpaceId === spaceId) {
        const fallbackId = personal?.id ?? null;
        setActiveSpaceIdState(fallbackId);
        persistActiveSpaceId(fallbackId, user?.id);
      }

      await loadSpaces();
      emitSpaceChanged();
    },
    [spaces, activeSpaceId, loadSpaces, user]
  );

  const leaveManagedSpace = useCallback(
    async (spaceId: string): Promise<void> => {
      const { error } = await apiLeaveManagedSpace(spaceId);
      if (error) {
        throw error;
      }

      // If active space is the one being left, fallback to personal space
      const personal = spaces.find((s) => s.space_type === "personal" && s.owner_user_id === user?.id) ?? null;
      if (activeSpaceId === spaceId) {
        const fallbackId = personal?.id ?? null;
        setActiveSpaceIdState(fallbackId);
        persistActiveSpaceId(fallbackId, user?.id);
      }

      await loadSpaces();
      emitSpaceChanged();
    },
    [spaces, activeSpaceId, loadSpaces, user]
  );

  const personalSpace = useMemo(
    () => spaces.find((s) => s.space_type === "personal" && s.owner_user_id === user?.id) ?? null,
    [spaces, user]
  );

  const activeSpace = useMemo(() => {
    if (loading || !user) return null;
    if (!activeSpaceId) return personalSpace;
    return spaces.find((s) => s.id === activeSpaceId && !s.is_archived && !s.deleted_at) ?? personalSpace;
  }, [loading, user, spaces, activeSpaceId, personalSpace]);

  const userRole = useMemo(() => {
    if (!activeSpace) return null;
    return getUserRole(activeSpace.id);
  }, [activeSpace, getUserRole]);

  useEffect(() => {
    const handleRoleRefresh = () => {
      void loadSpaces();
    };
    window.addEventListener("kash:space-changed", handleRoleRefresh);
    window.addEventListener("kash:membership-changed", handleRoleRefresh);

    if (activeSpace?.id && activeSpace.space_type === "managed" && user?.id) {
      const channel = supabase
        .channel(`managed-space-role-${activeSpace.id}-${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "managed_space_members",
            filter: `space_id=eq.${activeSpace.id}`,
          },
          () => {
            void loadSpaces();
          }
        )
        .subscribe();

      return () => {
        window.removeEventListener("kash:space-changed", handleRoleRefresh);
        window.removeEventListener("kash:membership-changed", handleRoleRefresh);
        supabase.removeChannel(channel);
      };
    }

    return () => {
      window.removeEventListener("kash:space-changed", handleRoleRefresh);
      window.removeEventListener("kash:membership-changed", handleRoleRefresh);
    };
  }, [activeSpace, user, loadSpaces]);

  const value = useMemo<ActiveSpaceContextValue>(
    () => ({
      spaces,
      personalSpace,
      activeSpace,
      activeSpaceId: activeSpace?.id ?? activeSpaceId,
      userRole,
      loading,
      getUserRole,
      setActiveSpace,
      createManagedSpace,
      renameManagedSpace,
      archiveManagedSpace,
      restoreManagedSpace,
      deleteManagedSpace,
      leaveManagedSpace,
      refreshSpaces: async (preferredSpaceId?: string) => {
        await loadSpaces(preferredSpaceId);
      },
    }),
    [
      spaces,
      personalSpace,
      activeSpace,
      activeSpaceId,
      userRole,
      loading,
      getUserRole,
      setActiveSpace,
      createManagedSpace,
      renameManagedSpace,
      archiveManagedSpace,
      restoreManagedSpace,
      deleteManagedSpace,
      leaveManagedSpace,
      loadSpaces,
    ]
  );

  return <ActiveSpaceContext.Provider value={value}>{children}</ActiveSpaceContext.Provider>;
}

export function useActiveSpace(): ActiveSpaceContextValue {
  const context = useContext(ActiveSpaceContext);
  if (!context) {
    throw new Error("useActiveSpace must be used within an ActiveSpaceProvider");
  }
  return context;
}
