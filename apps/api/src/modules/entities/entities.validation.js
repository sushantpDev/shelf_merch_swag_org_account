import { z } from 'zod';
import { objectId } from '../users/users.validation.js';

export const createEntitySchema = z.object({
  walletId: objectId,
  name: z.string().min(1),
  description: z.string().optional().default(''),
  colorHex: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i, 'Must be a hex color like #2563EB')
    .optional()
    .default('#2563EB'),
  expectedUsers: z.number().int().nonnegative().optional().default(0),
});

export const updateEntitySchema = z
  .object({
    name: z.string().min(1),
    description: z.string(),
    colorHex: z.string().regex(/^#[0-9a-f]{6}$/i),
    expectedUsers: z.number().int().nonnegative(),
    managerName: z.string(),
    managerTitle: z.string(),
    managerEmail: z.string().email().or(z.literal('')),
  })
  .partial();

export const assignManagerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  role: z.string().trim().max(100).optional().default(''), // display role e.g. "Marketing Manager"
  mobile: z.string().trim().refine(
    (value) => !value || /^(?:\+?91)?\d{10}$/.test(value.replace(/[\s()-]/g, '')),
    'Enter a valid 10-digit mobile number',
  ).optional().default(''),
  sendInvite: z.boolean().optional().default(true),
});

export const entityIdParams = z.object({ id: objectId });

export const listEntitiesQuery = z.object({
  walletId: objectId.optional(),
});

export const entityTransactionsQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
});
