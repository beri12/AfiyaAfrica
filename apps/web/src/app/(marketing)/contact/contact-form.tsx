'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2 } from 'lucide-react';
import { contactMessageSchema, type ContactMessageInput } from '@afyalink/shared';
import { api, errorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, FormGrid } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Alert } from '@/components/ui/states';

export function ContactForm() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ContactMessageInput>({ resolver: zodResolver(contactMessageSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await api('/contact', { method: 'POST', body: values, clinic: null });
      setSent(true);
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  if (sent) {
    return (
      <Card className="flex flex-col items-center justify-center p-10 text-center">
        <CheckCircle2 className="size-12 text-success" aria-hidden />
        <h2 className="mt-4 text-xl font-semibold">Message sent</h2>
        <p className="mt-2 text-muted">Thank you — we&apos;ll be in touch soon.</p>
      </Card>
    );
  }
  return (
    <Card className="p-6 sm:p-8">
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {error && <Alert tone="danger">{error}</Alert>}
        <FormGrid>
          <Field label="Your name" required error={errors.name?.message}><Input autoComplete="name" {...register('name')} /></Field>
          <Field label="Email" required error={errors.email?.message}><Input type="email" autoComplete="email" {...register('email')} /></Field>
        </FormGrid>
        <Field label="Clinic or organisation" error={errors.organization?.message}><Input autoComplete="organization" {...register('organization')} /></Field>
        <Field label="Message" required error={errors.message?.message}><Textarea rows={6} {...register('message')} /></Field>
        <Button type="submit" size="lg" loading={isSubmitting} className="w-full sm:w-auto">Send message</Button>
      </form>
    </Card>
  );
}
