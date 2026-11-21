import { Body, HttpStatus, PipeTransform, Query } from '@nestjs/common';
import { ApiBody, ApiQuery } from '@nestjs/swagger';
import { ZodEffects, ZodObject, type ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { AppError } from '../http/errors';

export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodTypeAny) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value ?? {});
    if (!result.success) {
      throw new AppError(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_FAILED',
        'Request validation failed',
        result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }
    return result.data;
  }
}

type OpenApiSchema = Record<string, unknown>;

export function toOpenApi(schema: ZodTypeAny): OpenApiSchema {
  const json = (zodToJsonSchema as (s: unknown, o: unknown) => unknown)(schema, {
    target: 'openApi3',
    $refStrategy: 'none',
  }) as OpenApiSchema;
  delete json.$schema;
  return json;
}

function unwrapObject(schema: ZodTypeAny): ZodObject<Record<string, ZodTypeAny>> | undefined {
  let s: ZodTypeAny = schema;
  while (s instanceof ZodEffects) s = s.innerType();
  return s instanceof ZodObject ? (s as ZodObject<Record<string, ZodTypeAny>>) : undefined;
}

/** Validates the request body with a Zod schema and documents it in Swagger. */
export function ZodBody(schema: ZodTypeAny): ParameterDecorator {
  const body = Body(new ZodValidationPipe(schema));
  return (target, key, index) => {
    body(target, key, index);
    if (!key) return;
    const descriptor = Object.getOwnPropertyDescriptor(target, key);
    if (descriptor) ApiBody({ schema: toOpenApi(schema) })(target, key, descriptor);
  };
}

/** Validates the query string with a Zod schema and documents each parameter in Swagger. */
export function ZodQuery(schema: ZodTypeAny): ParameterDecorator {
  const query = Query(new ZodValidationPipe(schema));
  return (target, key, index) => {
    query(target, key, index);
    if (!key) return;
    const descriptor = Object.getOwnPropertyDescriptor(target, key);
    const obj = unwrapObject(schema);
    if (!descriptor || !obj) return;
    for (const [name, prop] of Object.entries(obj.shape)) {
      ApiQuery({ name, required: !prop.isOptional(), schema: toOpenApi(prop) })(target, key, descriptor);
    }
  };
}
