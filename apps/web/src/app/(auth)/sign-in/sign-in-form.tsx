'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { KeyRound } from 'lucide-react';
import { useAuth, homeFor } from '@/lib/auth';
import { errorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/states';

const schema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
  mfaCode: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code').optional().or(z.literal('')),
});
type Values = z.infer<typeof schema>;

/** Only allow same-site relative redirects (prevents open redirects). */
function safeNext(next: string | null): string | null {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null;
}

export function SignInForm() {
  const { login, status, user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [mfa, setMfa] = useState(false);
  const [error, setError] = useState<string | null>(params.get('no-access') ? 'Your account has no active clinic access yet.' : null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (status === 'authenticated' && user && !params.get('no-access')) router.replace(safeNext(params.get('next')) ?? homeFor(user));
  }, [status, user, router, params]);

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      const r = await login(v.email, v.password, mfa ? v.mfaCode || undefined : undefined);
      if ('mfaRequired' in r) setMfa(true);
      else router.replace(safeNext(params.get('next')) ?? homeFor(r));
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <Card className="p-7 sm:p-9">
      <h1 className="text-2xl font-bold text-ink">{mfa ? 'Two-step verification' : 'Welcome back'}</h1>
      <p className="mt-1 text-sm text-muted">{mfa ? 'Enter the code from your authenticator app.' : 'Sign in to your AfyaLink AI workspace.'}</p>
      <form onSubmit={onSubmit} className="mt-7 space-y-5" noValidate>
        {error && <Alert tone="danger">{error}</Alert>}
        <div className={mfa ? 'hidden' : 'space-y-5'}>
          <Field label="Email" required error={errors.email?.message}><Input type="email" autoComplete="email" autoFocus {...register('email')} /></Field>
          <Field label="Password" required error={errors.password?.message}><Input type="password" autoComplete="current-password" {...register('password')} /></Field>
        </div>
        {mfa && (
          <Field label="Verification code" required error={errors.mfaCode?.message}>
            <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus placeholder="123456" {...register('mfaCode')} />
          </Field>
        )}
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          {mfa ? <><KeyRound /> Verify and sign in</> : 'Sign in'}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        New clinic? <Link href="/register-clinic" className="font-semibold text-brand-700 hover:underline">Register your clinic</Link>
      </p>
      <p className="mt-2 text-center text-xs text-muted">Staff and patients receive an activation link from their clinic.</p>
    </Card>
  );
}
