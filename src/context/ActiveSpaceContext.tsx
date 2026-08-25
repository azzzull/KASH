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
import type { FinancialSpace } from "../types/domain";
import {
  getFinancialSpaces,
  setActiveSpaceId as persistActiveSpaceId,
  getActiveSpaceId as getStoredActiveSpaceId,
} from "../lib/spaces";

type ActiveSpaceContextValue = {
  spaces: FinancialSpace[];
  personalSpace: FinancialSpace | null;
  activeSpace: FinancialSpace | null;
  activeSpaceId: string | null;
  loading: boolean;
  setActiveSpace: (spaceOrId: FinancialSpace | string) => void;
  refreshSpaces: () => Promise<void>;
};

const ActiveSpaceContext = createContext<ActiveSpaceContextValue | undefined>(undefined);

export function ActiveSpaceProvider({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const [spaces, setSpaces] = useState<FinancialSpace[]>([]);
  const [activeSpaceId, setActiveSpaceIdState] = useState<string | null>(getStoredActiveSpaceId());
  const [loading, setLoading] = useState<boolean>(true);

  const loadSpaces = useCallback(async () => {
    if (status !== "authenticated" || !user) {
      setSpaces([]);
      setActiveSpaceIdState(null);
      persistActiveSpaceId(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await getFinancialSpaces();
      if (error) {
        console.error("Failed to load financial spaces:", error);
        setLoading(false);
        return;
      }

      const spaceList = data ?? [];
      setSpaces(spaceList);

      const personal = spaceList.find((s) => s.space_type === "personal") ?? null;
      const storedId = getStoredActiveSpaceId();

      let resolvedSpace: FinancialSpace | null = null;
      if (storedId) {
        const found = spaceList.find((s) => s.id === storedId && !s.is_archived);
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
      persistActiveSpaceId(resolvedId);
    } catch (err) {
      console.error("Error initializing financial spaces:", err);
    } finally {
      setLoading(false);
    }
  }, [status, user]);

  useEffect(() => {
    loadSpaces();
  }, [loadSpaces]);

  const setActiveSpace = useCallback(
    (spaceOrId: FinancialSpace | string) => {
      const targetId = typeof spaceOrId === "string" ? spaceOrId : spaceOrId.id;
      const targetSpace = spaces.find((s) => s.id === targetId && !s.is_archived);

      if (targetSpace) {
        setActiveSpaceIdState(targetSpace.id);
        persistActiveSpaceId(targetSpace.id);
      } else {
        const personal = spaces.find((s) => s.space_type === "personal") ?? null;
        const fallbackId = personal?.id ?? null;
        setActiveSpaceIdState(fallbackId);
        persistActiveSpaceId(fallbackId);
      }
    },
    [spaces]
  );

  const personalSpace = useMemo(
    () => spaces.find((s) => s.space_type === "personal") ?? null,
    [spaces]
  );

  const activeSpace = useMemo(() => {
    if (!activeSpaceId) return personalSpace;
    return spaces.find((s) => s.id === activeSpaceId) ?? personalSpace;
  }, [spaces, activeSpaceId, personalSpace]);

  const value = useMemo<ActiveSpaceContextValue>(
    () => ({
      spaces,
      personalSpace,
      activeSpace,
      activeSpaceId: activeSpace?.id ?? activeSpaceId,
      loading,
      setActiveSpace,
      refreshSpaces: loadSpaces,
    }),
    [spaces, personalSpace, activeSpace, activeSpaceId, loading, setActiveSpace, loadSpaces]
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
