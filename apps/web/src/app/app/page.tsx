'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { homeFor, useAuth } from '@/lib/auth';
import { Spinner } from '@/components/ui/states';

export default function AppIndex() {
  const { user } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (user) router.replace(homeFor(user));
  }, [user, router]);
  return <Spinner />;
}
