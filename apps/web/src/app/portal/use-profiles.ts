'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface PortalProfile {
  id: string;
  clinicId: string;
  firstName: string;
  lastName: string;
  medicalRecordNumber: string;
  clinic: { id: string; name: string; city: string; phone: string; timezone: string };
  consents: { type: string; granted: boolean; createdAt: string }[];
}

export interface PortalAppointment {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  clinic: { id: string; name: string; timezone: string };
  service: { name: string };
  doctor: { membership: { user: { firstName: string; lastName: string } } };
}

export const useProfiles = () => useQuery({ queryKey: ['portal', 'profiles'], queryFn: () => api<PortalProfile[]>('/me/patient-profiles', { clinic: null }) });
export const usePortalAppointments = () => useQuery({ queryKey: ['portal', 'appointments'], queryFn: () => api<PortalAppointment[]>('/me/appointments', { clinic: null }) });
