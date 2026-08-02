import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Profile } from "../api/types";
import { useAuth } from "../auth/AuthContext";

interface ProfileContextValue {
  profiles: Profile[];
  activeProfile: Profile | null;
  setActiveProfileId: (id: number) => void;
  isLoading: boolean;
  refetch: () => void;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);
const ACTIVE_KEY = "forwarder_active_profile";

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [activeId, setActiveId] = useState<number | null>(() => {
    const raw = localStorage.getItem(ACTIVE_KEY);
    return raw ? Number(raw) : null;
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["profiles"],
    queryFn: () => api.get<Profile[]>("/profiles"),
    enabled: !!user && !user.mustChangePassword,
  });

  const profiles = data ?? [];

  useEffect(() => {
    if (profiles.length === 0) return;
    if (!profiles.some((p) => p.id === activeId)) {
      const fallback = profiles[profiles.length - 1].id;
      setActiveId(fallback);
      localStorage.setItem(ACTIVE_KEY, String(fallback));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles]);

  function setActiveProfileId(id: number) {
    setActiveId(id);
    localStorage.setItem(ACTIVE_KEY, String(id));
  }

  const activeProfile = profiles.find((p) => p.id === activeId) ?? null;

  return (
    <ProfileContext.Provider value={{ profiles, activeProfile, setActiveProfileId, isLoading, refetch }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfiles(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfiles must be used within ProfileProvider");
  return ctx;
}
