import { useForm, type FieldValues, type UseFormProps } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';

/**
 * react-hook-form bound to a shared Zod schema. Form state uses the schema's input type; submit handlers
 * receive the parsed output (defaults applied, phones normalised) — the same parsing the API performs.
 */
export function useZodForm<S extends z.ZodTypeAny>(schema: S, props?: Omit<UseFormProps<z.input<S> & FieldValues, unknown, z.output<S>>, 'resolver'>) {
  return useForm<z.input<S> & FieldValues, unknown, z.output<S>>({ ...props, resolver: zodResolver(schema as never) as never });
}
