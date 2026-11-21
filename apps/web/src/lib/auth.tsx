'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AuthTokens, ClinicRole, CurrentUser, MembershipSummary } from '@afyalink/shared';
import { api, ApiError, refreshSession, session } from './api';

type Status = 'loading' | 'authenticated' | 'anonymous';

interface AuthState {
  status: Status;
  user: CurrentUser | null;
  membership: MembershipSummary | null;
  role: ClinicRole | null;
  isPlatformAdmin: boolean;
  login: (email: string, password: string, mfaCode?: string) => Promise<{ mfaRequired: true } | CurrentUser>;
  completeLogin: (tokens: AuthTokens) => void;
  logout: () => Promise<void>;
  selectClinic: (clinicId: string) => void;
  reload: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);
const CLINIC_KEY = 'afyalink.activeClinic';

function readStoredClinic(): string | null {
  try {
    return localStorage.getItem(CLINIC_KEY);
  } catch {
    return null;
  }
}
function storeClinic(id: string | null) {
  try {
    if (id) localStorage.setItem(CLINIC_KEY, id);
    else localStorage.removeItem(CLINIC_KEY);
  } catch {
    /* storage unavailable — clinic selection is per-session only */
  }
}

/** Picks the active staff membership: stored choice if still valid, else the first non-patient membership. */
function pickMembership(user: CurrentUser, preferred: string | null): MembershipSummary | null {
  const staff = user.memberships.filter((m) => m.role !== 'PATIENT');
  return staff.find((m) => m.clinicId === preferred) ?? staff[0] ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [clinicId, setClinicId] = useState<string | null>(null);

  const applyUser = useCallback((u: CurrentUser) => {
    const m = pickMembership(u, readStoredClinic());
    session.setClinic(m?.clinicId ?? null);
    setClinicId(m?.clinicId ?? null);
    setUser(u);
    setStatus('authenticated');
  }, []);

  const reset = useCallback(() => {
    session.setToken(null);
    session.setClinic(null);
    setUser(null);
    setClinicId(null);
    setStatus('anonymous');
    qc.clear();
  }, [qc]);

  const reload = useCallback(async () => {
    applyUser(await api<CurrentUser>('/auth/me', { clinic: null }));
  }, [applyUser]);

  useEffect(() => {
    session.onExpired(reset);
    let cancelled = false;
    (async () => {
      const ok = await refreshSession();
      if (cancelled) return;
      if (!ok) return setStatus('anonymous');
      try {
        await reload();
      } catch {
        if (!cancelled) reset();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reload, reset]);

  const completeLogin = useCallback(
    (tokens: AuthTokens) => {
      session.setToken(tokens.accessToken);
      applyUser(tokens.user);
    },
    [applyUser],
  );

  const login = useCallback(
    async (email: string, password: string, mfaCode?: string) => {
      const res = await api<AuthTokens | { mfaRequired: true }>('/auth/login', { method: 'POST', body: { email, password, mfaCode }, clinic: null });
      if ('mfaRequired' in res) return res;
      completeLogin(res);
      return res.user;
    },
    [completeLogin],
  );

  const logout = useCallback(async () => {
    await fetch('/api/v1/auth/logout', { method: 'POST', headers: { 'X-Requested-With': 'afyalink' }, credentials: 'same-origin' }).catch(() => undefined);
    storeClinic(null);
    reset();
  }, [reset]);

  const selectClinic = useCallback(
    (id: string) => {
      storeClinic(id);
      session.setClinic(id);
      setClinicId(id);
      qc.clear();
    },
    [qc],
  );

  const value = useMemo<AuthState>(() => {
    const membership = user?.memberships.find((m) => m.clinicId === clinicId && m.role !== 'PATIENT') ?? null;
    return {
      status,
      user,
      membership,
      role: membership?.role ?? null,
      isPlatformAdmin: !!user?.platformRoles.includes('PLATFORM_ADMIN'),
      login,
      completeLogin,
      logout,
      selectClinic,
      reload,
    };
  }, [status, user, clinicId, login, completeLogin, logout, selectClinic, reload]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** Where to land after sign-in, based on the user's roles. */
export function homeFor(user: CurrentUser): string {
  if (user.platformRoles.includes('PLATFORM_ADMIN')) return '/admin';
  const staff = user.memberships.filter((m) => m.role !== 'PATIENT');
  if (staff.length === 0) return user.memberships.length ? '/portal' : '/sign-in?no-access=1';
  return staff[0]?.role === 'DOCTOR' ? '/app/workspace' : staff[0]?.role === 'LABORATORY_STAFF' ? '/app/lab' : '/app/overview';
}

export { ApiError };
