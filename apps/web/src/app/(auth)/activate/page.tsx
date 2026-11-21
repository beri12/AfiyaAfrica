'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { passwordSchema, type AuthTokens } from '@afyalink/shared';
import { api, errorMessage } from '@/lib/api';
import { homeFor, useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/states';

const schema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: 'Passwords do not match', path: ['confirm'] });

function ActivateForm() {
  const token = useSearchParams().get('token');
  const router = useRouter();
  const { completeLogin } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      const tokens = await api<AuthTokens>('/auth/activate', { method: 'POST', body: { token, password: v.password }, clinic: null });
      completeLogin(tokens);
      router.replace(homeFor(tokens.user));
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  if (!token) return <Alert tone="danger" title="Invalid link">This activation link is incomplete. Ask your clinic to resend the invitation.</Alert>;
  return (
    <Card className="p-7 sm:p-9">
      <h1 className="text-2xl font-bold">Activate your account</h1>
      <p className="mt-1 text-sm text-muted">Choose a password with at least 10 characters, including letters and numbers.</p>
      <form onSubmit={onSubmit} className="mt-7 space-y-5" noValidate>
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="New password" required error={errors.password?.message}><Input type="password" autoComplete="new-password" {...register('password')} /></Field>
        <Field label="Confirm password" required error={errors.confirm?.message}><Input type="password" autoComplete="new-password" {...register('confirm')} /></Field>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>Activate and sign in</Button>
      </form>
    </Card>
  );
}

export default function ActivatePage() {
  return <Suspense><ActivateForm /></Suspense>;
}
