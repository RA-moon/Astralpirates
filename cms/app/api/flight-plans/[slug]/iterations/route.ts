import type { NextRequest } from 'next/server';

import { authenticateRequest, buildRequestForUser } from '../../../_lib/auth';
import { recordAuthorizationDecision } from '../../../_lib/authorizationDecisionTelemetry';
import { corsEmpty, corsJson } from '../../../_lib/cors';
import {
  normalizeFlightPlanSlideInputs,
  normalizeRichTextContent,
  resolveOwners,
  richTextContentToLexicalDocument,
  sanitizeFlightPlan,
} from '../../../_lib/content';
import { ensureUniqueSlug, slugify } from '../../../_lib/slugs';
import { normaliseId } from '../../../_lib/flightPlanMembers';
import {
  buildPreservedFlightPlanAccessData,
  canManageFlightPlanLifecycle,
  createFlightPlanStatusEvent,
  findFlightPlanBySlug,
  isTerminalFlightPlanStatus,
  resolveFlightPlanLifecycleStatus,
  sanitizeFlightPlanSlug,
} from '../../../_lib/flightPlanLifecycle';

const METHODS = 'OPTIONS,POST';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type IterationRequest = {
  title?: unknown;
  summary?: unknown;
  location?: unknown;
  eventDate?: unknown;
  displayDate?: unknown;
  body?: unknown;
};

type NormalizedSlide = ReturnType<typeof normalizeFlightPlanSlideInputs>[number];

const sanitizeString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const parseDateInput = (value: unknown): Date | null => {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDateCode = (date: Date): string => {
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
};

const formatDisplayDate = (date: Date): string =>
  new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(date);

const resolvePlanCategory = (value: unknown): 'test' | 'project' | 'event' => {
  if (value === 'test') return 'test';
  if (value === 'event') return 'event';
  return 'project';
};

const resolveIterationNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isNaN(parsed) && Number.isFinite(parsed) && parsed > 0) {
      return Math.trunc(parsed);
    }
  }
  return 1;
};

const toLexicalBody = (value: unknown) => {
  const normalized = normalizeRichTextContent(value);
  return normalized.length
    ? richTextContentToLexicalDocument(normalized)
    : richTextContentToLexicalDocument([
        {
          type: 'paragraph',
          children: [{ text: 'Mission details pending.' }],
        },
      ]);
};

const normalizeSlidesForIterationClone = (slides: NormalizedSlide[]): NormalizedSlide[] => {
  return slides.map((slide) => {
    if (
      slide.imageType === 'upload' &&
      slide.galleryImage == null &&
      slide.imageUrl.trim().length > 0
    ) {
      return {
        ...slide,
        imageType: 'url',
      };
    }
    return slide;
  });
};

const SCHEMA_DRIFT_ERROR_PATTERNS: RegExp[] = [
  /relation\s+"flight_plan_series"\s+does not exist/i,
  /column\s+"series_id"\s+does not exist/i,
  /column\s+"iteration_number"\s+does not exist/i,
  /enum_flight_plan_series_category/i,
  /cannot cast type enum_flight_plans_category/i,
];

const collectErrorMessages = (error: unknown, sink: Set<string>) => {
  if (!error) return;

  if (typeof error === 'string') {
    const trimmed = error.trim();
    if (trimmed.length > 0) sink.add(trimmed);
    return;
  }

  if (typeof error !== 'object') return;

  const record = error as Record<string, unknown>;
  if (typeof record.message === 'string') {
    const trimmed = record.message.trim();
    if (trimmed.length > 0) sink.add(trimmed);
  }

  if ('cause' in record) {
    collectErrorMessages(record.cause, sink);
  }
};

const isIterationSchemaDriftError = (error: unknown): boolean => {
  const messages = new Set<string>();
  collectErrorMessages(error, messages);

  for (const message of messages) {
    if (SCHEMA_DRIFT_ERROR_PATTERNS.some((pattern) => pattern.test(message))) {
      return true;
    }
  }

  return false;
};

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug?: string }> },
) {
  const auth = await authenticateRequest(req);
  if (!auth.user) {
    return corsJson(req, { error: 'Authentication required.' }, { status: 401 }, METHODS);
  }

  const resolvedParams = await context.params;
  const slug = sanitizeFlightPlanSlug(resolvedParams?.slug);
  if (!slug) {
    return corsJson(req, { error: 'Flight plan not found.' }, { status: 404 }, METHODS);
  }

  let payloadBody: IterationRequest;
  try {
    payloadBody = (await req.json()) as IterationRequest;
  } catch {
    return corsJson(req, { error: 'Invalid JSON payload.' }, { status: 400 }, METHODS);
  }

  try {
    const currentPlan = await findFlightPlanBySlug({
      payload: auth.payload,
      slug,
      depth: 1,
    });
    if (!currentPlan) {
      return corsJson(req, { error: 'Flight plan not found.' }, { status: 404 }, METHODS);
    }

    const currentPlanId = normaliseId(currentPlan.id);
    if (currentPlanId == null) {
      return corsJson(
        req,
        { error: 'Unable to resolve flight plan identifier.' },
        { status: 500 },
        METHODS,
      );
    }

    const ownerId = normaliseId(currentPlan.owner);
    const lifecycleAllowed = canManageFlightPlanLifecycle({
      ownerId,
      user: auth.user,
      adminMode: auth.adminMode,
    });
    recordAuthorizationDecision({
      payload: auth.payload,
      capability: 'manageFlightPlanLifecycle',
      allowed: lifecycleAllowed,
      reasonCode: lifecycleAllowed
        ? 'allow_owner_or_sailing_master'
        : 'deny_owner_or_sailing_master_required',
      actorId: auth.user.id,
      actorRole: auth.user.role,
      resourceType: 'flight-plan',
      resourceId: currentPlanId,
      resourceSlug: slug,
    });
    if (!lifecycleAllowed) {
      return corsJson(
        req,
        { error: 'Only the captain or sailing-master+ can create mission iterations.' },
        { status: 403 },
        METHODS,
      );
    }

    const currentStatus = resolveFlightPlanLifecycleStatus(currentPlan.status);
    if (!isTerminalFlightPlanStatus(currentStatus)) {
      return corsJson(
        req,
        { error: 'Create iteration is only available for terminal missions.' },
        { status: 400 },
        METHODS,
      );
    }

    const category = resolvePlanCategory(currentPlan.category);
    const requestedEventDate = parseDateInput(payloadBody.eventDate);
    if (category === 'event' && !requestedEventDate) {
      return corsJson(
        req,
        { error: 'Event iterations require a new eventDate.' },
        { status: 400 },
        METHODS,
      );
    }

    const nowIso = new Date().toISOString();
    const ownerForSeries = ownerId ?? normaliseId(auth.user.id);

    let seriesId = normaliseId(currentPlan.series);
    if (seriesId == null) {
      const seriesBaseSlug = `${slugify(String(currentPlan.slug ?? currentPlan.title ?? slug))}-series`;
      const seriesSlug = await ensureUniqueSlug(
        auth.payload,
        'flight-plan-series' as any,
        seriesBaseSlug,
      );
      const createdSeries = await auth.payload.create({
        collection: 'flight-plan-series' as any,
        data: {
          slug: seriesSlug,
          title: `${sanitizeString(currentPlan.title) ?? 'Mission'} Series`,
          category,
          owner: ownerForSeries,
        } as any,
        overrideAccess: true,
      });
      seriesId = normaliseId((createdSeries as unknown as Record<string, unknown>).id);
      if (seriesId == null) {
        throw new Error('Unable to initialize mission series identifier.');
      }

      await auth.payload.update({
        collection: 'flight-plans',
        id: currentPlanId,
        data: {
          series: seriesId,
          iterationNumber: resolveIterationNumber(currentPlan.iterationNumber),
          ...buildPreservedFlightPlanAccessData(currentPlan),
        } as any,
        overrideAccess: true,
      });
    }

    const latestIteration = await auth.payload.find({
      collection: 'flight-plans',
      where: {
        series: {
          equals: seriesId,
        },
      },
      sort: '-iterationNumber,-createdAt',
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });

    const latestIterationNumber = resolveIterationNumber(
      (latestIteration.docs[0] as unknown as Record<string, unknown> | undefined)?.iterationNumber,
    );
    const nextIterationNumber = Math.max(
      latestIterationNumber,
      resolveIterationNumber(currentPlan.iterationNumber),
    ) + 1;

    const nextTitle =
      sanitizeString(payloadBody.title) ??
      `${sanitizeString(currentPlan.title) ?? 'Mission'} · Iteration ${nextIterationNumber}`;
    const nextSummary = sanitizeString(payloadBody.summary) ?? sanitizeString(currentPlan.summary);
    const nextLocation = sanitizeString(payloadBody.location) ?? sanitizeString(currentPlan.location);
    const sourceGallerySlides = Array.isArray(currentPlan.gallerySlides) ? currentPlan.gallerySlides : [];
    const normalizedGallerySlides = normalizeSlidesForIterationClone(
      normalizeFlightPlanSlideInputs(sourceGallerySlides),
    );

    if (sourceGallerySlides.length > 0 && normalizedGallerySlides.length === 0) {
      auth.payload.logger?.warn?.(
        {
          event: 'flight_plan_iteration_gallery_clone_empty',
          sourceFlightPlanId: currentPlanId,
          sourceSlug: slug,
          actorId: normaliseId(auth.user.id),
        },
        'Failed to normalize source mission gallery slides while creating iteration; cloning empty gallery.',
      );
    }

    const eventDate = requestedEventDate;
    const eventDateIso = eventDate ? eventDate.toISOString() : null;
    const dateCode = eventDate ? formatDateCode(eventDate) : null;
    const displayDate =
      sanitizeString(payloadBody.displayDate) ??
      (eventDate ? formatDisplayDate(eventDate) : null);

    const nextSlugBase = `${slugify(String(currentPlan.slug ?? slug))}-iter-${nextIterationNumber}`;
    const nextSlug = await ensureUniqueSlug(auth.payload, 'flight-plans', nextSlugBase);

    const reqForUser = await buildRequestForUser(auth.payload, auth.user);
    const createdPlan = await auth.payload.create({
      collection: 'flight-plans',
      data: {
        title: nextTitle,
        summary: nextSummary,
        location: nextLocation,
        slug: nextSlug,
        path: `bridge/flight-plans/${nextSlug}`,
        category,
        body: toLexicalBody(payloadBody.body ?? currentPlan.body),
        owner: ownerForSeries,
        eventDate: eventDateIso,
        dateCode,
        displayDate,
        visibility: currentPlan.visibility,
        accessPolicy: currentPlan.accessPolicy,
        mediaVisibility: currentPlan.mediaVisibility,
        crewCanPromotePassengers: Boolean(currentPlan.crewCanPromotePassengers),
        passengersCanCreateTasks: Boolean(currentPlan.passengersCanCreateTasks),
        passengersCanCommentOnTasks: Boolean(currentPlan.passengersCanCommentOnTasks),
        isPublic: Boolean(currentPlan.isPublic),
        publicContributions: Boolean(currentPlan.publicContributions),
        gallerySlides: normalizedGallerySlides,
        status: 'planned',
        statusChangedAt: nowIso,
        statusChangedBy: normaliseId(auth.user.id),
        statusReason: 'Created as next mission iteration.',
        startedAt: null,
        finishedAt: null,
        series: seriesId,
        iterationNumber: nextIterationNumber,
        previousIteration: currentPlanId,
      } as any,
      req: reqForUser,
      depth: 1,
      overrideAccess: true,
    });

    const createdPlanId = normaliseId((createdPlan as unknown as Record<string, unknown>).id);
    if (createdPlanId != null) {
      await createFlightPlanStatusEvent({
        payload: auth.payload,
        req: reqForUser,
        flightPlanId: createdPlanId,
        fromStatus: null,
        toStatus: 'planned',
        reason: 'Created as next mission iteration.',
        changedBy: normaliseId(auth.user.id),
        changedAt: nowIso,
        actionType: 'transition',
      });
    }

    auth.payload.logger?.info?.(
      {
        event: 'flight_plan_iteration_created',
        sourceFlightPlanId: currentPlanId,
        sourceSlug: slug,
        seriesId,
        iterationNumber: nextIterationNumber,
        createdFlightPlanId: createdPlanId,
        createdSlug: nextSlug,
        actorId: normaliseId(auth.user.id),
      },
      'Created next mission iteration',
    );

    const ownerMap = await resolveOwners(auth.payload, [createdPlan as any]);
    return corsJson(
      req,
      {
        plan: sanitizeFlightPlan(createdPlan as any, ownerMap),
      },
      { status: 201 },
      METHODS,
    );
  } catch (error) {
    const schemaDrift = isIterationSchemaDriftError(error);

    auth.payload.logger?.error?.(
      {
        err: error,
        slug,
        actorId: normaliseId(auth.user.id),
        schemaDrift,
      },
      'Failed to create next flight-plan iteration',
    );
    return corsJson(
      req,
      {
        error: schemaDrift
          ? 'Mission iteration storage is not ready. Run CMS migrations and retry.'
          : 'Unable to create next mission iteration.',
      },
      { status: schemaDrift ? 503 : 500 },
      METHODS,
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsEmpty(req, METHODS);
}
