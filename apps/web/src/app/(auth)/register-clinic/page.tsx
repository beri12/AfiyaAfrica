import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RegisterClinicForm } from './register-form';

export const metadata: Metadata = { title: 'Register your clinic' };

export default function RegisterClinicPage() {
  return <Suspense><RegisterClinicForm /></Suspense>;
}
