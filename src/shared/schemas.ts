import { z } from 'zod';
import { HTTP_METHODS } from './types';

const id = z.string().min(1).max(200);

export const keyValueSchema = z.object({
  id,
  key: z.string(),
  value: z.string(),
  enabled: z.boolean(),
});

export const multipartFieldSchema = z.discriminatedUnion('kind', [
  z.object({
    id,
    kind: z.literal('text'),
    key: z.string(),
    value: z.string(),
    enabled: z.boolean(),
  }),
  z.object({
    id,
    kind: z.literal('file'),
    key: z.string(),
    filePath: z.string(),
    enabled: z.boolean(),
  }),
]);

export const requestBodySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  z.object({ type: z.literal('json'), content: z.string() }),
  z.object({ type: z.literal('text'), content: z.string() }),
  z.object({ type: z.literal('form'), fields: z.array(keyValueSchema) }),
  z.object({ type: z.literal('multipart'), fields: z.array(multipartFieldSchema) }),
]);

export const authSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  z.object({ type: z.literal('bearer'), token: z.string() }),
  z.object({ type: z.literal('basic'), username: z.string(), password: z.string() }),
]);

export const requestOptionsSchema = z.object({
  timeoutMs: z
    .number()
    .int()
    .min(0)
    .max(24 * 60 * 60 * 1000),
  followRedirects: z.boolean(),
  verifyTls: z.boolean(),
});

export const httpMethodSchema = z.enum(HTTP_METHODS);

export const httpRequestSpecSchema = z.object({
  method: httpMethodSchema,
  url: z.string().max(64 * 1024),
  headers: z.array(keyValueSchema),
  body: requestBodySchema,
  auth: authSchema,
  options: requestOptionsSchema,
});

export const savedRequestSchema = httpRequestSpecSchema.extend({
  id,
  name: z.string(),
  disabledParams: z.array(keyValueSchema).default([]),
});

export const collectionSchema = z.object({
  schemaVersion: z.literal(1),
  id,
  name: z.string(),
  requests: z.array(savedRequestSchema),
});

export const environmentSchema = z.object({
  schemaVersion: z.literal(1),
  id,
  name: z.string(),
  variables: z.array(keyValueSchema),
});

export const sendInputSchema = z.object({
  sendId: id,
  tabId: id,
  request: httpRequestSpecSchema,
  variables: z.record(z.string(), z.string()),
});

export const idSchema = id;
