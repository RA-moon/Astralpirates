import type { NextRequest } from 'next/server';
import type { Payload } from 'payload';

import { FlightPlanTaskStateSchema, type FlightPlanTaskState } from '@astralpirates/shared/api-contracts';
import {
  loadMembershipWithOwnerFallback,
  normaliseId,
  type FlightPlanMembershipRecord,
} from '@/app/api/_lib/flightPlanMembers';
import { corsJson } from '@/app/api/_lib/cors';
import {
  isLexicalDocument,
  normalizeRichTextContent,
  richTextContentToLexicalDocument,
} from '@/app/api/_lib/content';

type AuthContext = {
  user: { id: number } | null;
  payload: Payload;
};

export const parseRequestBody = async (req: NextRequest): Promise<Record<string, unknown>> => {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
};

export const sanitizeTitle = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.length) return null;
  if (trimmed.length > 120) return trimmed.slice(0, 120);
  return trimmed;
};

export const sanitizeState = (value: unknown): FlightPlanTaskState => {
  const result = FlightPlanTaskStateSchema.safeParse(value);
  return result.success ? result.data : 'ideation';
};

export const normalizeAssigneeIds = (value: unknown): number[] => {
  if (!Array.isArray(value)) return [];
  const ids: number[] = [];
  for (const entry of value) {
    const id = normaliseId(entry);
    if (id != null && !ids.includes(id)) {
      ids.push(id);
    }
  }
  return ids;
};

export const toLexicalDescription = (value: unknown) => {
  if (isLexicalDocument(value)) return value;
  return richTextContentToLexicalDocument(normalizeRichTextContent(value));
};

type MembershipResult =
  | { membership: FlightPlanMembershipRecord }
  | { response: Response };

export const ensureViewerMembership = async ({
  req,
  auth,
  flightPlanId,
  ownerId,
  methods = 'OPTIONS,GET,POST',
  allowGuest = false,
}: {
  req: NextRequest;
  auth: AuthContext;
  flightPlanId: number;
  ownerId: number | null;
  methods?: string;
  allowGuest?: boolean;
}): Promise<MembershipResult> => {
  if (!auth.user) {
    return {
      response: corsJson(req, { error: 'Authentication required.' }, { status: 401 }, methods),
    };
  }

  const membership = await loadMembershipWithOwnerFallback({
    payload: auth.payload,
    flightPlanId,
    userId: auth.user.id,
    ownerIdHint: ownerId ?? undefined,
  });
  if (!membership || membership.status !== 'accepted') {
    return {
      response: corsJson(req, { error: 'Crew access required.' }, { status: 403 }, methods),
    };
  }

  if (allowGuest) {
    return { membership };
  }

  if (membership.role !== 'owner' && membership.role !== 'crew') {
    return {
      response: corsJson(
        req,
        { error: 'Only captains or crew organisers can perform this action.' },
        { status: 403 },
        methods,
      ),
    };
  }

  return { membership };
};
