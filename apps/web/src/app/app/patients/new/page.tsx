'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createPatientSchema, LANGUAGES, SEXES } from '@afyalink/shared';
import { api, errorMessage } from '@/lib/api';
import { useZodForm } from '@/lib/form';
import { humanize } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, FormGrid } from '@/components/ui/field';
import { Checkbox, Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Alert } from '@/components/ui/states';

const LANG_LABEL: Record<string, string> = { en: 'English', am: 'Amharic (አማርኛ)', om: 'Afaan Oromo', ti: 'Tigrinya' };

export default function NewPatientPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useZodForm(createPatientSchema, { defaultValues: { preferredLanguage: 'en', smsRemindersConsent: false } });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const p = await api<{ id: string; medicalRecordNumber: string }>('/patients', { method: 'POST', body: values });
      await qc.invalidateQueries({ queryKey: ['patients'] });
      toast.success(`Patient registered · ${p.medicalRecordNumber}`);
      router.push(`/app/patients/${p.id}`);
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <>
      <PageHeader title="Register patient" description="Collect only what is needed. Fields marked * are required." />
      <form onSubmit={onSubmit} noValidate className="space-y-6">
        {error && <Alert tone="danger">{error}</Alert>}
        <Card>
          <CardHeader title="Identity" />
          <CardBody>
            <FormGrid className="sm:grid-cols-3">
              <Field label="First name" required error={errors.firstName?.message}><Input {...register('firstName')} /></Field>
              <Field label="Middle name" error={errors.middleName?.message}><Input {...register('middleName')} /></Field>
              <Field label="Last name" required error={errors.lastName?.message}><Input {...register('lastName')} /></Field>
              <Field label="Date of birth" required error={errors.dateOfBirth?.message}><Input type="date" max={new Date().toISOString().slice(0, 10)} {...register('dateOfBirth')} /></Field>
              <Field label="Sex" required error={errors.sex?.message}>
                <Select defaultValue="" {...register('sex')}><option value="" disabled>Select…</option>{SEXES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</Select>
              </Field>
              <Field label="Preferred language" error={errors.preferredLanguage?.message}>
                <Select {...register('preferredLanguage')}>{LANGUAGES.map((l) => <option key={l} value={l}>{LANG_LABEL[l]}</option>)}</Select>
              </Field>
            </FormGrid>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Contact" />
          <CardBody>
            <FormGrid>
              <Field label="Phone" hint="e.g. 0911 234 567" error={errors.phone?.message}><Input type="tel" {...register('phone', { setValueAs: (v: string) => v || undefined })} /></Field>
              <Field label="Email" error={errors.email?.message}><Input type="email" {...register('email', { setValueAs: (v: string) => v || undefined })} /></Field>
              <Field label="City" error={errors.city?.message}><Input {...register('city')} /></Field>
              <Field label="Sub-city" error={errors.subCity?.message}><Input {...register('subCity')} /></Field>
              <Field label="Emergency contact name" error={errors.emergencyContactName?.message}><Input {...register('emergencyContactName')} /></Field>
              <Field label="Emergency contact phone" error={errors.emergencyContactPhone?.message}><Input type="tel" {...register('emergencyContactPhone', { setValueAs: (v: string) => v || undefined })} /></Field>
            </FormGrid>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Consent" description="Read the consent statement to the patient and record their answers." />
          <CardBody className="space-y-4">
            <label className="flex items-start gap-3 text-sm">
              <Checkbox className="mt-0.5" {...register('dataProcessingConsent')} />
              <span><strong>Required:</strong> The patient consents to the clinic recording and processing their personal and health information for their care.</span>
            </label>
            {errors.dataProcessingConsent && <p className="text-xs font-medium text-danger" role="alert">{errors.dataProcessingConsent.message}</p>}
            <label className="flex items-start gap-3 text-sm">
              <Checkbox className="mt-0.5" {...register('smsRemindersConsent')} />
              <span>The patient agrees to receive appointment reminders by SMS (no clinical details are included).</span>
            </label>
          </CardBody>
        </Card>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
          <Button type="submit" loading={isSubmitting}>Register patient</Button>
        </div>
      </form>
    </>
  );
}
