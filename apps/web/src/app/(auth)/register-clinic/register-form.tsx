'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useZodForm } from '@/lib/form';
import { CheckCircle2 } from 'lucide-react';
import { DEFAULT_PLANS, PLAN_CODES, registerClinicSchema, type RegisterClinicInput } from '@afyalink/shared';
import { api, errorMessage } from '@/lib/api';
import { money } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, FormGrid } from '@/components/ui/field';
import { Checkbox, Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/states';

const STEP_FIELDS = [
  ['clinic.name', 'clinic.city', 'clinic.subCity', 'clinic.phone', 'clinic.email', 'clinic.licenseNumber'],
  ['admin.firstName', 'admin.lastName', 'admin.email', 'admin.phone', 'admin.password'],
] as const;

export function RegisterClinicForm() {
  const planParam = useSearchParams().get('plan');
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, trigger, watch, setValue, formState: { errors, isSubmitting } } = useZodForm(registerClinicSchema, {
    defaultValues: {
      clinic: { timezone: 'Africa/Addis_Ababa', city: 'Addis Ababa', planCode: (PLAN_CODES as readonly string[]).includes(planParam ?? '') ? (planParam as RegisterClinicInput['clinic']['planCode']) : 'STARTER' },
    },
  });
  const plan = watch('clinic.planCode');

  const next = async () => {
    if (await trigger(STEP_FIELDS[step] as unknown as Parameters<typeof trigger>[0])) setStep((s) => s + 1);
  };

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      await api('/clinics/register', { method: 'POST', body: v, clinic: null });
      setDone(true);
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  if (done) {
    return (
      <Card className="p-9 text-center">
        <CheckCircle2 className="mx-auto size-14 text-success" aria-hidden />
        <h1 className="mt-4 text-2xl font-bold">Registration received</h1>
        <p className="mt-2 text-muted">Our team will verify your clinic and activate it. You can sign in now to view the status and set up your account.</p>
        <Button asChild className="mt-6" size="lg"><Link href="/sign-in">Go to sign in</Link></Button>
      </Card>
    );
  }

  return (
    <Card className="p-7 sm:p-9">
      <ol className="mb-7 flex gap-2" aria-label="Progress">
        {['Clinic', 'Administrator', 'Plan'].map((label, i) => (
          <li key={label} className="flex-1">
            <div className={cn('h-1.5 rounded-full transition-colors duration-500', i <= step ? 'bg-teal-500' : 'bg-line')} />
            <p className={cn('mt-2 text-xs font-medium', i === step ? 'text-brand-800' : 'text-muted')} aria-current={i === step ? 'step' : undefined}>{i + 1}. {label}</p>
          </li>
        ))}
      </ol>
      <h1 className="text-2xl font-bold">Register your clinic</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-5" noValidate>
        {error && <Alert tone="danger">{error}</Alert>}
        {step === 0 && (
          <>
            <Field label="Clinic name" required error={errors.clinic?.name?.message}><Input {...register('clinic.name')} /></Field>
            <FormGrid>
              <Field label="City" required error={errors.clinic?.city?.message}><Input {...register('clinic.city')} /></Field>
              <Field label="Sub-city" error={errors.clinic?.subCity?.message}><Input {...register('clinic.subCity')} /></Field>
              <Field label="Clinic phone" required hint="e.g. 0911 234 567" error={errors.clinic?.phone?.message}><Input type="tel" {...register('clinic.phone')} /></Field>
              <Field label="Clinic email" required error={errors.clinic?.email?.message}><Input type="email" {...register('clinic.email')} /></Field>
            </FormGrid>
            <Field label="License number" hint="Ministry of Health facility license, if available" error={errors.clinic?.licenseNumber?.message}><Input {...register('clinic.licenseNumber')} /></Field>
          </>
        )}
        {step === 1 && (
          <>
            <FormGrid>
              <Field label="First name" required error={errors.admin?.firstName?.message}><Input autoComplete="given-name" {...register('admin.firstName')} /></Field>
              <Field label="Last name" required error={errors.admin?.lastName?.message}><Input autoComplete="family-name" {...register('admin.lastName')} /></Field>
              <Field label="Your email" required error={errors.admin?.email?.message}><Input type="email" autoComplete="email" {...register('admin.email')} /></Field>
              <Field label="Your phone" error={errors.admin?.phone?.message}><Input type="tel" autoComplete="tel" {...register('admin.phone', { setValueAs: (v: string) => v || undefined })} /></Field>
            </FormGrid>
            <Field label="Password" required hint="At least 10 characters with letters and numbers" error={errors.admin?.password?.message}><Input type="password" autoComplete="new-password" {...register('admin.password')} /></Field>
          </>
        )}
        {step === 2 && (
          <>
            <fieldset>
              <legend className="mb-3 text-sm font-medium">Choose a plan (30-day trial)</legend>
              <div className="grid gap-3 sm:grid-cols-3">
                {DEFAULT_PLANS.map((p) => (
                  <button type="button" key={p.code} onClick={() => setValue('clinic.planCode', p.code)} aria-pressed={plan === p.code}
                    className={cn('rounded-xl border p-4 text-left transition-all', plan === p.code ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-200' : 'border-line hover:border-brand-200')}>
                    <p className="font-semibold">{p.name}</p>
                    <p className="mt-1 text-sm text-muted">{p.priceIsFrom ? 'from ' : ''}{money(p.monthlyPriceUsdCents)}/mo</p>
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="flex items-start gap-3 text-sm">
              <Checkbox className="mt-0.5" {...register('acceptTerms')} />
              <span>I accept the <Link href="/terms" className="font-semibold text-brand-700 underline" target="_blank">Terms of Service</Link> and <Link href="/privacy" className="font-semibold text-brand-700 underline" target="_blank">Privacy Policy</Link>, and confirm I am authorised to register this clinic.</span>
            </label>
            {errors.acceptTerms && <p className="text-xs font-medium text-danger" role="alert">{errors.acceptTerms.message}</p>}
          </>
        )}
        <div className="flex justify-between gap-3 pt-2">
          {step > 0 ? <Button type="button" variant="secondary" onClick={() => setStep((s) => s - 1)}>Back</Button> : <span />}
          {step < 2 ? <Button type="button" onClick={next}>Continue</Button> : <Button type="submit" loading={isSubmitting}>Submit registration</Button>}
        </div>
      </form>
      <p className="mt-6 text-center text-sm text-muted">Already registered? <Link href="/sign-in" className="font-semibold text-brand-700 hover:underline">Sign in</Link></p>
    </Card>
  );
}
