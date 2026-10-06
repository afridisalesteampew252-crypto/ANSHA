import { tool, type ToolApprovalStatus } from 'ai';
import { z } from 'zod';
import { buildPeerStats, peerKey, priceSanityWarning } from '@/lib/price-sanity';
import { revalidatePublicListing, type PublicListingKind } from '@/lib/revalidate-public-server';
import { logAssistantAction } from './audit';
import type { AssistantActionPreview, AssistantChangePreview, AssistantWriteToolName } from './preview';
import {
  type AssistantToolContext,
  MAX_WRITE_PROPOSALS_PER_REQUEST,
  clip,
  errorMessage,
  loadStaff,
  partLabel,
  staffName,
  vehicleLabel,
} from './shared';

type Scalar = string | number | boolean | null;

type Prepared = {
  entityType: string;
  entityId: string | null;
  preview: AssistantActionPreview;
  /** Full current values of the fields being changed (for the audit log). */
  before: Record<string, Scalar>;
};

type Applied = {
  entityId?: string | null;
  after: Record<string, Scalar>;
  revalidate?: { kind: PublicListingKind; slug: string | null };
  message: string;
};

type WriteSpec<S extends z.ZodTypeAny> = {
  name: AssistantWriteToolName;
  description: string;
  inputSchema: S;
  /** Read current state with the admin's session; return a preview or a denial reason. */
  prepare: (input: z.infer<S>) => Promise<Prepared | { denied: string }>;
  /** Perform exactly one record change with the admin's session. */
  apply: (input: z.infer<S>, prepared: Prepared) => Promise<Applied>;
};

const uuid = z.string().uuid();
const MAX_AMOUNT = 100_000_000;

function change(field: string, before: unknown, after: unknown): AssistantChangePreview {
  const norm = (v: unknown): Scalar => {
    if (v === undefined || v === null || v === '') return null;
    if (typeof v === 'number' || typeof v === 'boolean') return v;
    return clip(String(v), 400);
  };
  return { field, before: norm(before), after: norm(after) };
}

const sameValue = (a: unknown, b: unknown) => (a ?? null) === (b ?? null) || String(a ?? '') === String(b ?? '');

/** Builds the AI SDK tool + its approval policy from a write spec. */
function defineWriteTool<S extends z.ZodTypeAny>(ctx: AssistantToolContext, spec: WriteSpec<S>) {
  const approve = async (input: z.infer<S>): Promise<ToolApprovalStatus> => {
    if (ctx.writesDisabledReason) return { type: 'denied', reason: ctx.writesDisabledReason };
    ctx.writeProposals.count += 1;
    if (ctx.writeProposals.count > MAX_WRITE_PROPOSALS_PER_REQUEST) {
      return {
        type: 'denied',
        reason: `Too many changes proposed at once (max ${MAX_WRITE_PROPOSALS_PER_REQUEST} per message). Bulk or mass updates are not allowed here; use the dedicated admin screen (e.g. Bulk vehicle prices) or do them a few at a time.`,
      };
    }
    try {
      const prepared = await spec.prepare(input);
      if ('denied' in prepared) return { type: 'denied', reason: prepared.denied };
      return { type: 'user-approval', reason: JSON.stringify(prepared.preview) };
    } catch (error) {
      return { type: 'denied', reason: `Could not prepare this change: ${errorMessage(error)}` };
    }
  };

  const execute = async (input: z.infer<S>, { toolCallId }: { toolCallId: string }) => {
    if (ctx.writesDisabledReason) throw new Error(ctx.writesDisabledReason);
    // Re-read the record now (it may have changed since the preview was shown).
    const prepared = await spec.prepare(input);
    if ('denied' in prepared) throw new Error(prepared.denied);

    const base = {
      tool: spec.name,
      entityType: prepared.entityType,
      entityId: prepared.entityId,
      toolCallId,
      args: input,
      model: ctx.modelId,
    };
    // Audit first: if the audit log is unavailable, the change is not made.
    const approvedLog = await logAssistantAction(ctx.supabase, {
      ...base,
      phase: 'approved',
      before: prepared.before,
      after: Object.fromEntries(prepared.preview.changes.map((c) => [c.field, c.after])),
    });
    if (!approvedLog.ok) {
      throw new Error(`Audit log unavailable, so the change was NOT made (${approvedLog.error}).`);
    }

    let applied: Applied;
    try {
      applied = await spec.apply(input, prepared);
    } catch (error) {
      const message = errorMessage(error);
      await logAssistantAction(ctx.supabase, { ...base, phase: 'failed', before: prepared.before, error: message });
      throw new Error(`The change failed and nothing was saved: ${message}`);
    }

    await logAssistantAction(ctx.supabase, {
      ...base,
      entityId: applied.entityId ?? prepared.entityId,
      phase: 'executed',
      before: prepared.before,
      after: applied.after,
    });

    let revalidated: string[] = [];
    if (applied.revalidate) {
      try {
        revalidated = revalidatePublicListing(applied.revalidate.kind, applied.revalidate.slug ? [applied.revalidate.slug] : []);
      } catch {
        revalidated = [];
      }
    }

    return {
      ok: true,
      message: applied.message,
      record: { ...prepared.preview.record, id: applied.entityId ?? prepared.preview.record.id },
      before: prepared.before,
      after: applied.after,
      revalidatedPaths: revalidated,
      // Lets the UI call the #105 client helper (/api/revalidate) if server-side
      // revalidation did not run, so public pages never stay stale after a change.
      revalidate: applied.revalidate
        ? { kind: applied.revalidate.kind, slugs: applied.revalidate.slug ? [applied.revalidate.slug] : [] }
        : null,
    };
  };

  return {
    tool: tool({ description: spec.description, inputSchema: spec.inputSchema, execute }),
    approve,
  };
}

const VEHICLE_EDIT_COLUMNS =
  'id, title, slug, make, model, variant, year, stock_number, stock_status, is_published, show_price, currency, price, price_fob, price_cf, price_cif, description';
const PART_EDIT_COLUMNS =
  'id, name, slug, part_code, brand, stock_status, is_published, show_price, currency, price, price_fob, price_cf, price_cif, description';

export function createWriteTools(ctx: AssistantToolContext) {
  const { supabase } = ctx;

  async function loadVehicle(id: string) {
    const { data, error } = await supabase.from('vehicles').select(VEHICLE_EDIT_COLUMNS).eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }
  async function loadPart(id: string) {
    const { data, error } = await supabase.from('parts').select(PART_EDIT_COLUMNS).eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }

  async function vehiclePeerWarning(vehicle: { id: string; make: string; model: string; year: number | null; currency: string }, amount: number) {
    let q = supabase
      .from('vehicles')
      .select('id, make, model, year, currency, price, price_fob')
      .ilike('make', vehicle.make)
      .ilike('model', vehicle.model)
      .neq('id', vehicle.id)
      .neq('stock_status', 'sold')
      .limit(500);
    q = vehicle.year == null ? q.is('year', null) : q.eq('year', vehicle.year);
    const { data } = await q;
    const stats = buildPeerStats(data ?? [], (r) => ({
      make: r.make,
      model: r.model,
      year: r.year,
      currency: r.currency,
      price: Number(r.price_fob) > 0 ? Number(r.price_fob) : r.price,
    }));
    return priceSanityWarning({
      price: amount,
      currency: vehicle.currency,
      peers: stats.get(peerKey(vehicle.make, vehicle.model, vehicle.year, vehicle.currency)) ?? null,
      peerLabel: `other ${vehicle.year ?? ''} ${vehicle.make} ${vehicle.model}`.replace(/\s+/g, ' '),
    });
  }

  // -------------------------------------------------------------------------
  const updateListingPrice = defineWriteTool(ctx, {
    name: 'updateListingPrice',
    description:
      'Change ONE price on ONE vehicle or part (requires the user to approve a before → after preview). Vehicles: price_fob (public listing price; also syncs the legacy list price and turns price visibility on when > 0), price_cf or price_cif. Parts: price (public list price), price_fob, price_cf or price_cif. Amount is in the record currency. Never use this for bulk changes.',
    inputSchema: z.object({
      kind: z.enum(['vehicle', 'part']),
      id: uuid.describe('Vehicle or part id (from a search tool).'),
      field: z.enum(['price', 'price_fob', 'price_cf', 'price_cif']),
      amount: z.number().min(0).max(MAX_AMOUNT),
    }),
    prepare: async ({ kind, id, field, amount }) => {
      if (kind === 'vehicle') {
        if (field === 'price') {
          return { denied: 'For vehicles use price_fob (the public listing price); the legacy list price follows FOB automatically.' };
        }
        const v = await loadVehicle(id);
        if (!v) return { denied: 'Vehicle not found (or not visible to you).' };
        if (sameValue(Number(v[field]), amount)) return { denied: `${field} is already ${amount} ${v.currency}. Nothing to change.` };
        const changes = [change(`${field} (${v.currency})`, v[field], amount)];
        const before: Record<string, Scalar> = { [field]: v[field] };
        if (field === 'price_fob') {
          changes.push(change(`price — legacy list price (${v.currency})`, v.price, amount));
          before.price = v.price;
        }
        if (amount > 0 && !v.show_price) {
          changes.push(change('show_price', false, true));
          before.show_price = v.show_price;
        }
        const warnings: string[] = [];
        const sanity = field === 'price_fob' && amount > 0 ? await vehiclePeerWarning(v, amount) : null;
        if (sanity) warnings.push(sanity);
        if (amount === 0) warnings.push('Setting 0 removes this price term from the public page.');
        if (v.is_published) warnings.push('This vehicle is published; the public page will update after the change.');
        return {
          entityType: 'vehicle',
          entityId: v.id,
          before,
          preview: {
            kind: 'assistant-action-preview',
            action: `Change ${field === 'price_fob' ? 'FOB (listing) price' : field === 'price_cf' ? 'C&F price' : 'CIF price'}`,
            record: { type: 'Vehicle', id: v.id, label: vehicleLabel(v), adminUrl: `/admin/vehicles/${v.id}` },
            changes,
            warnings,
          },
        };
      }
      const p = await loadPart(id);
      if (!p) return { denied: 'Part not found (or not visible to you).' };
      if (sameValue(Number(p[field]), amount)) return { denied: `${field} is already ${amount} ${p.currency}. Nothing to change.` };
      const warnings: string[] = [];
      if (!p.show_price) warnings.push('Price visibility is OFF for this part, so the public page keeps showing "Ask for quote".');
      if (field !== 'price') warnings.push('The public part page uses the list "price" field as the headline price.');
      return {
        entityType: 'part',
        entityId: p.id,
        before: { [field]: p[field] },
        preview: {
          kind: 'assistant-action-preview',
          action: `Change part ${field === 'price' ? 'list price' : field}`,
          record: { type: 'Part', id: p.id, label: partLabel(p), adminUrl: `/admin/parts/${p.id}` },
          changes: [change(`${field} (${p.currency})`, p[field], amount)],
          warnings,
        },
      };
    },
    apply: async ({ kind, id, field, amount }) => {
      if (kind === 'vehicle') {
        // Same RPC as Admin → Bulk vehicle prices, restricted to exactly one id.
        const { data, error } = await supabase.rpc('bulk_update_vehicle_prices', {
          vehicle_ids: [id],
          price_field: field,
          adjustment_mode: 'set',
          adjustment_value: amount,
        });
        if (error) throw new Error(error.message);
        if (Number(data) !== 1) throw new Error('No vehicle was updated.');
        const after = await loadVehicle(id);
        return {
          after: { [field]: after?.[field] ?? null, price: after?.price ?? null, show_price: after?.show_price ?? null },
          revalidate: { kind: 'vehicle', slug: after?.slug ?? null },
          message: `Updated ${field} to ${amount} ${after?.currency ?? ''}.`.trim(),
        };
      }
      const { data, error } = await supabase
        .from('parts')
        .update({ [field]: amount, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('id, slug, currency, ' + field);
      if (error) throw new Error(error.message);
      const row = (data ?? [])[0] as unknown as Record<string, Scalar> | undefined;
      if (!row) throw new Error('No part was updated (permission denied or not found).');
      return {
        after: { [field]: row[field] ?? null },
        revalidate: { kind: 'part', slug: (row.slug as string) ?? null },
        message: `Updated part ${field} to ${amount} ${row.currency ?? ''}.`.trim(),
      };
    },
  });

  // -------------------------------------------------------------------------
  const setListingPublished = defineWriteTool(ctx, {
    name: 'setListingPublished',
    description:
      'Publish or unpublish ONE vehicle or part on the public website (requires approval). Only available stock can be published.',
    inputSchema: z.object({
      kind: z.enum(['vehicle', 'part']),
      id: uuid,
      publish: z.boolean().describe('true = publish, false = unpublish.'),
    }),
    prepare: async ({ kind, id, publish }) => {
      const row = kind === 'vehicle' ? await loadVehicle(id) : await loadPart(id);
      if (!row) return { denied: `${kind === 'vehicle' ? 'Vehicle' : 'Part'} not found (or not visible to you).` };
      if (row.is_published === publish) return { denied: `It is already ${publish ? 'published' : 'unpublished'}.` };
      if (publish && row.stock_status !== 'available') {
        return { denied: `Only available stock can be published (current status: ${row.stock_status}).` };
      }
      const label = kind === 'vehicle' ? vehicleLabel(row as { title: string }) : partLabel(row as { name: string });
      const warnings: string[] = [];
      if (publish && !row.show_price) warnings.push('Price visibility is off, so the public page will show "Ask for quote".');
      if (!publish) warnings.push('The public page will stop showing this listing after revalidation.');
      return {
        entityType: kind,
        entityId: row.id,
        before: { is_published: row.is_published },
        preview: {
          kind: 'assistant-action-preview',
          action: publish ? 'Publish listing' : 'Unpublish listing',
          record: {
            type: kind === 'vehicle' ? 'Vehicle' : 'Part',
            id: row.id,
            label,
            adminUrl: `/admin/${kind === 'vehicle' ? 'vehicles' : 'parts'}/${row.id}`,
          },
          changes: [change('is_published', row.is_published, publish)],
          warnings,
        },
      };
    },
    apply: async ({ kind, id, publish }) => {
      if (kind === 'vehicle') {
        const { data, error } = await supabase.rpc('set_vehicle_public_listing', { p_vehicle_id: id, p_publish: publish });
        if (error) throw new Error(error.message);
        const row = (Array.isArray(data) ? data[0] : data) as { is_published?: boolean; slug?: string } | null;
        return {
          after: { is_published: row?.is_published ?? publish },
          revalidate: { kind: 'vehicle', slug: row?.slug ?? null },
          message: publish ? 'Vehicle published.' : 'Vehicle unpublished.',
        };
      }
      const { data, error } = await supabase
        .from('parts')
        .update({ is_published: publish, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('id, slug, is_published');
      if (error) throw new Error(error.message);
      const row = (data ?? [])[0];
      if (!row) throw new Error('No part was updated (permission denied or not found).');
      return {
        after: { is_published: row.is_published },
        revalidate: { kind: 'part', slug: row.slug },
        message: publish ? 'Part published.' : 'Part unpublished.',
      };
    },
  });

  // -------------------------------------------------------------------------
  const updateListingDetails = defineWriteTool(ctx, {
    name: 'updateListingDetails',
    description:
      'Edit listing text on ONE vehicle or part (requires approval): title (part name), brand (vehicle make / part brand), model and variant (vehicles only), description. Only pass fields that should change. The URL slug is not changed.',
    inputSchema: z.object({
      kind: z.enum(['vehicle', 'part']),
      id: uuid,
      title: z.string().trim().min(2).max(200).optional(),
      brand: z.string().trim().min(1).max(80).optional(),
      model: z.string().trim().min(1).max(80).optional(),
      variant: z.string().trim().max(120).optional(),
      description: z.string().max(5000).optional(),
    }),
    prepare: async ({ kind, id, title, brand, model, variant, description }) => {
      const requested: Record<string, string | undefined> =
        kind === 'vehicle'
          ? { title, make: brand, model, variant, description }
          : { name: title, brand, description };
      if (kind === 'part' && (model !== undefined || variant !== undefined)) {
        return { denied: 'Parts have no model/variant fields. Use title, brand or description.' };
      }
      const row = (kind === 'vehicle' ? await loadVehicle(id) : await loadPart(id)) as Record<string, Scalar> | null;
      if (!row) return { denied: `${kind === 'vehicle' ? 'Vehicle' : 'Part'} not found (or not visible to you).` };
      const changes: AssistantChangePreview[] = [];
      const before: Record<string, Scalar> = {};
      for (const [column, value] of Object.entries(requested)) {
        if (value === undefined) continue;
        if (sameValue(row[column], value)) continue;
        changes.push(change(column, row[column], value));
        before[column] = row[column];
      }
      if (!changes.length) return { denied: 'No field would change. Nothing to do.' };
      const label = kind === 'vehicle' ? vehicleLabel(row as { title: string }) : partLabel(row as { name: string });
      return {
        entityType: kind,
        entityId: id,
        before,
        preview: {
          kind: 'assistant-action-preview',
          action: 'Edit listing details',
          record: {
            type: kind === 'vehicle' ? 'Vehicle' : 'Part',
            id,
            label,
            adminUrl: `/admin/${kind === 'vehicle' ? 'vehicles' : 'parts'}/${id}`,
          },
          changes,
          warnings: row.is_published ? ['This listing is published; the public page will update after the change.'] : [],
        },
      };
    },
    apply: async ({ kind, id, title, brand, model, variant, description }, prepared) => {
      const patch: Record<string, string | null> = {};
      for (const column of Object.keys(prepared.before)) {
        const value =
          kind === 'vehicle'
            ? ({ title, make: brand, model, variant, description } as Record<string, string | undefined>)[column]
            : ({ name: title, brand, description } as Record<string, string | undefined>)[column];
        if (value !== undefined) patch[column] = value === '' && column !== 'make' && column !== 'model' ? null : value;
      }
      const table = kind === 'vehicle' ? 'vehicles' : 'parts';
      const { data, error } = await supabase
        .from(table)
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select(`id, slug, ${Object.keys(patch).join(', ')}`);
      if (error) throw new Error(error.message);
      const row = (data ?? [])[0] as unknown as Record<string, Scalar> | undefined;
      if (!row) throw new Error('No record was updated (permission denied or not found).');
      const after: Record<string, Scalar> = {};
      for (const column of Object.keys(patch)) after[column] = row[column] ?? null;
      return {
        after,
        revalidate: { kind, slug: (row.slug as string) ?? null },
        message: `Updated ${Object.keys(patch).join(', ')}.`,
      };
    },
  });

  // -------------------------------------------------------------------------
  const requestTypes = ['inquiry', 'part_request', 'bl', 'inspection', 'shipping', 'other'] as const;

  const createWorkspaceRequest = defineWriteTool(ctx, {
    name: 'createWorkspaceRequest',
    description:
      'Create ONE internal workspace request (task) and optionally assign it and set a due date (requires approval). Use listStaff to find the assignee id. Link a vehicle, customer, inquiry or part request when relevant.',
    inputSchema: z.object({
      requestType: z.enum(requestTypes),
      title: z.string().trim().min(3).max(200),
      notes: z.string().max(2000).optional(),
      assignedToId: uuid.optional(),
      dueAt: z.string().datetime({ offset: true }).optional().describe('ISO 8601 date-time, e.g. 2026-10-07T12:00:00+04:00.'),
      vehicleId: uuid.optional(),
      customerId: uuid.optional(),
      inquiryId: uuid.optional(),
      partRequestId: uuid.optional(),
    }),
    prepare: async (input) => {
      const staff = await loadStaff(supabase);
      if (input.assignedToId) {
        const assignee = staff.find((s) => s.id === input.assignedToId);
        if (!assignee || !assignee.is_active) return { denied: 'Assignee not found or inactive. Use listStaff to pick an active staff member.' };
      }
      const links: string[] = [];
      if (input.vehicleId) {
        const v = await loadVehicle(input.vehicleId);
        if (!v) return { denied: 'Linked vehicle not found.' };
        links.push(`Vehicle: ${vehicleLabel(v)}`);
      }
      if (input.customerId) {
        const { data: c } = await supabase.from('customers').select('id, full_name, customer_code').eq('id', input.customerId).maybeSingle();
        if (!c) return { denied: 'Linked customer not found.' };
        links.push(`Customer: ${c.full_name}${c.customer_code ? ` (${c.customer_code})` : ''}`);
      }
      if (input.inquiryId) {
        const { data: i } = await supabase.from('inquiries').select('id, customer_name').eq('id', input.inquiryId).maybeSingle();
        if (!i) return { denied: 'Linked inquiry not found.' };
        links.push(`Inquiry from ${i.customer_name}`);
      }
      if (input.partRequestId) {
        const { data: r } = await supabase.from('part_requests').select('id, customer_name, part_name').eq('id', input.partRequestId).maybeSingle();
        if (!r) return { denied: 'Linked part request not found.' };
        links.push(`Part request: ${r.part_name} for ${r.customer_name}`);
      }
      const warnings: string[] = [];
      if (input.dueAt && Date.parse(input.dueAt) < Date.now()) warnings.push('The due date is in the past.');
      return {
        entityType: 'workspace_request',
        entityId: null,
        before: {},
        preview: {
          kind: 'assistant-action-preview',
          action: 'Create workspace request',
          record: { type: 'Workspace request', id: null, label: input.title },
          changes: [
            change('type', null, input.requestType),
            change('title', null, input.title),
            ...(input.notes ? [change('notes', null, input.notes)] : []),
            change('assigned to', null, staffName(staff, input.assignedToId) ?? 'Unassigned'),
            ...(input.dueAt ? [change('due', null, input.dueAt)] : []),
            ...links.map((l) => change('linked', null, l)),
          ],
          warnings,
        },
      };
    },
    apply: async (input) => {
      const { data, error } = await supabase.rpc('create_workspace_request', {
        p_request_type: input.requestType,
        p_title: input.title,
        p_notes: input.notes ?? null,
        p_assigned_to: input.assignedToId ?? null,
        p_due_at: input.dueAt ?? null,
        p_vehicle_id: input.vehicleId ?? null,
        p_customer_id: input.customerId ?? null,
        p_inquiry_id: input.inquiryId ?? null,
        p_part_request_id: input.partRequestId ?? null,
      });
      if (error) throw new Error(error.message);
      const row = (Array.isArray(data) ? data[0] : data) as
        | { id: string; status: string; title: string; assigned_to: string | null; due_at: string | null; request_type: string }
        | null;
      if (!row?.id) throw new Error('The request was not created.');
      return {
        entityId: row.id,
        after: { id: row.id, request_type: row.request_type, status: row.status, title: row.title, assigned_to: row.assigned_to, due_at: row.due_at },
        message: `Created workspace request ${row.id} (/admin/requests/${row.id}).`,
      };
    },
  });

  // -------------------------------------------------------------------------
  const updateWorkspaceRequest = defineWriteTool(ctx, {
    name: 'updateWorkspaceRequest',
    description:
      'Assign / re-assign / unassign ONE workspace request, change its status or due date (requires approval). Only pass what should change.',
    inputSchema: z.object({
      requestId: uuid,
      assignedToId: uuid.optional().describe('New assignee (staff id from listStaff).'),
      unassign: z.boolean().optional().describe('true to remove the assignee.'),
      status: z.enum(['open', 'in_progress', 'waiting', 'done', 'cancelled']).optional(),
      dueAt: z.string().datetime({ offset: true }).optional(),
      clearDueDate: z.boolean().optional(),
    }),
    prepare: async ({ requestId, assignedToId, unassign, status, dueAt, clearDueDate }) => {
      if (assignedToId && unassign) return { denied: 'Choose either assignedToId or unassign, not both.' };
      if (dueAt && clearDueDate) return { denied: 'Choose either dueAt or clearDueDate, not both.' };
      const [{ data: row, error }, staff] = await Promise.all([
        supabase.from('workspace_requests').select('id, title, status, assigned_to, due_at, request_type').eq('id', requestId).maybeSingle(),
        loadStaff(supabase),
      ]);
      if (error) throw new Error(error.message);
      if (!row) return { denied: 'Workspace request not found (or not visible to you).' };
      if (assignedToId) {
        const assignee = staff.find((s) => s.id === assignedToId);
        if (!assignee || !assignee.is_active) return { denied: 'Assignee not found or inactive. Use listStaff.' };
      }
      const changes: AssistantChangePreview[] = [];
      const before: Record<string, Scalar> = {};
      if (assignedToId && assignedToId !== row.assigned_to) {
        changes.push(change('assigned to', staffName(staff, row.assigned_to) ?? 'Unassigned', staffName(staff, assignedToId)));
        before.assigned_to = row.assigned_to;
      }
      if (unassign && row.assigned_to) {
        changes.push(change('assigned to', staffName(staff, row.assigned_to), 'Unassigned'));
        before.assigned_to = row.assigned_to;
      }
      if (status && status !== row.status) {
        changes.push(change('status', row.status, status));
        before.status = row.status;
      }
      if (dueAt && (!row.due_at || Date.parse(row.due_at) !== Date.parse(dueAt))) {
        changes.push(change('due', row.due_at, dueAt));
        before.due_at = row.due_at;
      }
      if (clearDueDate && row.due_at) {
        changes.push(change('due', row.due_at, null));
        before.due_at = row.due_at;
      }
      if (!changes.length) return { denied: 'Nothing would change on this request.' };
      return {
        entityType: 'workspace_request',
        entityId: row.id,
        before,
        preview: {
          kind: 'assistant-action-preview',
          action: 'Update workspace request',
          record: { type: 'Workspace request', id: row.id, label: row.title, adminUrl: `/admin/requests/${row.id}` },
          changes,
          warnings: [],
        },
      };
    },
    apply: async ({ requestId, assignedToId, unassign, status, dueAt, clearDueDate }) => {
      const { data, error } = await supabase.rpc('update_workspace_request', {
        p_request_id: requestId,
        p_status: status ?? null,
        p_assigned_to: unassign ? null : (assignedToId ?? null),
        p_set_assigned: Boolean(assignedToId || unassign),
        p_due_at: clearDueDate ? null : (dueAt ?? null),
        p_set_due: Boolean(dueAt || clearDueDate),
        p_title: null,
        p_notes: null,
      });
      if (error) throw new Error(error.message);
      const row = (Array.isArray(data) ? data[0] : data) as { id: string; status: string; assigned_to: string | null; due_at: string | null } | null;
      if (!row?.id) throw new Error('The request was not updated.');
      return {
        after: { status: row.status, assigned_to: row.assigned_to, due_at: row.due_at },
        message: 'Workspace request updated.',
      };
    },
  });

  // -------------------------------------------------------------------------
  const setInquiryStatus = defineWriteTool(ctx, {
    name: 'setInquiryStatus',
    description: 'Mark ONE website inquiry as new, read, responded or closed (requires approval).',
    inputSchema: z.object({
      inquiryId: uuid,
      status: z.enum(['new', 'read', 'responded', 'closed']),
    }),
    prepare: async ({ inquiryId, status }) => {
      const { data: row, error } = await supabase
        .from('inquiries')
        .select('id, status, customer_name, customer_email, message')
        .eq('id', inquiryId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) return { denied: 'Inquiry not found (or not visible to you).' };
      if (row.status === status) return { denied: `The inquiry is already "${status}".` };
      return {
        entityType: 'inquiry',
        entityId: row.id,
        before: { status: row.status },
        preview: {
          kind: 'assistant-action-preview',
          action: 'Change inquiry status',
          record: {
            type: 'Inquiry',
            id: row.id,
            label: `${row.customer_name}${row.customer_email ? ` <${row.customer_email}>` : ''}: ${clip(row.message, 80) ?? ''}`,
            adminUrl: '/admin/inquiries',
          },
          changes: [change('status', row.status, status)],
          warnings: [],
        },
      };
    },
    apply: async ({ inquiryId, status }) => {
      const { data, error } = await supabase
        .from('inquiries')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', inquiryId)
        .select('id, status');
      if (error) throw new Error(error.message);
      const row = (data ?? [])[0];
      if (!row) throw new Error('No inquiry was updated (permission denied or not found).');
      return { after: { status: row.status }, message: `Inquiry marked ${row.status}.` };
    },
  });

  const all = {
    updateListingPrice,
    setListingPublished,
    updateListingDetails,
    createWorkspaceRequest,
    updateWorkspaceRequest,
    setInquiryStatus,
  };

  return {
    tools: {
      updateListingPrice: all.updateListingPrice.tool,
      setListingPublished: all.setListingPublished.tool,
      updateListingDetails: all.updateListingDetails.tool,
      createWorkspaceRequest: all.createWorkspaceRequest.tool,
      updateWorkspaceRequest: all.updateWorkspaceRequest.tool,
      setInquiryStatus: all.setInquiryStatus.tool,
    },
    approvals: {
      updateListingPrice: all.updateListingPrice.approve,
      setListingPublished: all.setListingPublished.approve,
      updateListingDetails: all.updateListingDetails.approve,
      createWorkspaceRequest: all.createWorkspaceRequest.approve,
      updateWorkspaceRequest: all.updateWorkspaceRequest.approve,
      setInquiryStatus: all.setInquiryStatus.approve,
    },
  };
}
