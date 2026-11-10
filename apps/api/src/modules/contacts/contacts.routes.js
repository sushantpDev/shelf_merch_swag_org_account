import { Router } from 'express';
import { z } from 'zod';
import { uploader, SPREADSHEET_TYPES } from '../../middleware/upload.middleware.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { resolveTenant, requireTenantContext } from '../../middleware/tenant.middleware.js';
import { tenantArea } from '../../middleware/tenantAccess.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { objectId } from '../users/users.validation.js';
import { Contact } from './contact.model.js';
import {
  assertContactAccess,
  contactToPublicJSON,
  createOrRestoreContact,
  getContactOrThrow,
  listContactsForUser,
  prepareContactPayloadForUser,
  updateContact,
} from './contacts.service.js';
import { ImportJob } from '../imports/importJob.model.js';
import { enqueueCsvImport } from '../../jobs/queues.js';
import { writeAudit } from '../../services/audit.service.js';
import { ApiError, NotFoundError } from '../../utils/errors.js';

const upload = uploader({ allow: SPREADSHEET_TYPES, maxSizeMb: 5 });
const router = Router();

router.use(authenticate, resolveTenant, requireTenantContext);
const canRead = tenantArea('contacts', 'read');
const canWrite = tenantArea('contacts', 'write');

const addressSchema = z
  .object({
    line1: z.string().optional(),
    line2: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    pincode: z.string().optional(),
    country: z.string().optional(),
  })
  .partial();

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional().default(''),
  role: z.enum(['Owner', 'Admin', 'Sender', 'Member', 'Non-Member']).optional().default('Member'),
  department: z.string().optional().default(''),
  employeeCode: z.string().optional().default(''),
  address: addressSchema.optional(),
});

router.get(
  '/',
  canRead,
  asyncHandler(async (req, res) => {
    res.json(await listContactsForUser({ tenantId: req.tenantId, user: req.user }));
  }),
);

router.post(
  '/',
  canWrite,
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => {
    const payload = await prepareContactPayloadForUser({
      tenantId: req.tenantId,
      user: req.user,
      body: req.body,
    });
    const contact = await createOrRestoreContact({
      tenantId: req.tenantId,
      payload,
      source: 'manual',
    });
    writeAudit({ req, action: 'contact.create', entityType: 'Contact', entityId: contact._id, after: contact.toObject() });
    res.status(201).json(contactToPublicJSON(contact));
  }),
);

router.patch(
  '/:id',
  canWrite,
  validate({ params: z.object({ id: objectId }), body: createSchema.partial() }),
  asyncHandler(async (req, res) => {
    const { contact, before } = await updateContact({
      tenantId: req.tenantId,
      user: req.user,
      contactId: req.params.id,
      body: req.body,
    });
    writeAudit({ req, action: 'contact.update', entityType: 'Contact', entityId: contact._id, before, after: contact.toObject() });
    res.json(contactToPublicJSON(contact));
  }),
);

router.delete(
  '/:id',
  canWrite,
  validate({ params: z.object({ id: objectId }) }),
  asyncHandler(async (req, res) => {
    const contact = await getContactOrThrow({ tenantId: req.tenantId, contactId: req.params.id });
    await assertContactAccess({ tenantId: req.tenantId, user: req.user, contact });
    if (contact.role === 'Owner') {
      throw new ApiError(403, 'The workspace owner contact cannot be deleted', 'OWNER_PROTECTED');
    }
    const before = contact.toObject();
    await contact.softDelete();
    writeAudit({
      req,
      action: 'contact.delete',
      entityType: 'Contact',
      entityId: contact._id,
      before,
      after: { deletedAt: contact.deletedAt },
    });
    res.status(204).send();
  }),
);

const ACCEPTED_IMPORT_EXT = /\.(csv|xlsx|xls)$/i;
const ACCEPTED_IMPORT_MIME = new Set([
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
]);

// §7.7 — multipart CSV/Excel upload, processed by the csv-import worker.
router.post(
  '/import',
  canWrite,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new ApiError(400, 'File is required (field name "file")', 'FILE_REQUIRED');
    const extOk = ACCEPTED_IMPORT_EXT.test(req.file.originalname);
    const mimeOk = ACCEPTED_IMPORT_MIME.has(req.file.mimetype);
    if (!extOk && !mimeOk) {
      throw new ApiError(415, 'Only CSV and Excel files (.csv, .xlsx, .xls) are accepted', 'UNSUPPORTED_FILE_TYPE');
    }
    const job = await ImportJob.create({
      tenantId: req.tenantId,
      kind: 'contacts',
      fileName: req.file.originalname,
      csv: req.file.buffer,
      createdBy: req.user.userId,
    });
    await enqueueCsvImport({ tenantId: req.tenantId, jobId: job._id });
    writeAudit({ req, action: 'contact.import', entityType: 'ImportJob', entityId: job._id, after: { fileName: job.fileName } });
    res.status(202).json({ importJobId: String(job._id), status: job.status });
  }),
);

router.get(
  '/import/:jobId/status',
  canRead,
  validate({ params: z.object({ jobId: objectId }) }),
  asyncHandler(async (req, res) => {
    const job = await ImportJob.findOne({ _id: req.params.jobId, tenantId: req.tenantId });
    if (!job) throw new NotFoundError('Import job not found');
    res.json({
      status: job.status,
      totalRows: job.totalRows,
      validCount: job.validCount,
      errorCount: job.errorCount,
      errors: job.errors,
    });
  }),
);

export default router;
