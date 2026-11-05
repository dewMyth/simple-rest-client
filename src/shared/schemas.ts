import { z } from 'zod';
import { HTTP_METHODS } from './types';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/, 'Invalid id');

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

export const SCHEMA_VERSION = 1 as const;

export const historyEntrySchema = z.object({
  id,
  sentAt: z.number(),
  request: httpRequestSpecSchema,
  status: z.number().nullable(),
  durationMs: z.number().nullable(),
  error: z.string().nullable(),
});

export const historyFileSchema = z.object({
  schemaVersion: z.literal(1),
  entries: z.array(historyEntrySchema),
});

const boundsSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().min(200),
  height: z.number().min(200),
  maximized: z.boolean().default(false),
});

export const settingsSchema = z.object({
  schemaVersion: z.literal(1),
  theme: z.enum(['system', 'light', 'dark']).default('system'),
  activeEnvironmentId: z.string().nullable().default(null),
  windowBounds: boundsSchema.nullable().default(null),
  layout: z.object({ sidebarWidth: z.number(), requestFraction: z.number() }).partial().default({}),
  defaultOptions: requestOptionsSchema.default({
    timeoutMs: 30000,
    followRedirects: true,
    verifyTls: true,
  }),
  collectionOrder: z.array(z.string()).default([]),
  environmentOrder: z.array(z.string()).default([]),
});

export const settingsPatchSchema = settingsSchema
  .omit({ schemaVersion: true, windowBounds: true })
  .partial();

export const sessionTabSchema = z.object({
  id,
  request: savedRequestSchema,
  savedRef: z.object({ collectionId: id, requestId: id }).nullable(),
  /** Stable serialization of the request when it was last saved. */
  snapshot: z.string(),
  requestSection: z.enum(['params', 'headers', 'body', 'auth', 'options']).default('params'),
  responseSection: z.enum(['body', 'headers']).default('body'),
  responseView: z.enum(['pretty', 'raw']).default('pretty'),
});

export const sessionSchema = z.object({
  schemaVersion: z.literal(1),
  activeTabId: z.string().nullable(),
  tabs: z.array(sessionTabSchema),
});
