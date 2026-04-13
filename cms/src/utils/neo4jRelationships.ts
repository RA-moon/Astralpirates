import type { Payload } from 'payload';

import {
  incrementCarriagedEdge,
  incrementCompanionEdge,
  incrementCrewmateEdge,
  removePlanRelationshipEdges,
  refreshCarriagedRollups,
  refreshCompanionRollups,
  refreshCrewmateRollups,
} from '@/src/utils/neo4j.ts';
import { listMembershipsForFlightPlan } from '@/app/api/_lib/flightPlanMembers.ts';

const ACCEPTED_STATUSES = new Set(['accepted']);
const CREW_ROLES = new Set(['owner', 'crew']);
const isCrewRole = (role: string | null | undefined) =>
  role ? CREW_ROLES.has(role.toLowerCase()) : false;
const isPassengerRole = (role: string | null | undefined) =>
  role ? role.toLowerCase() === 'guest' : false;

const resolveOccurredAt = (entry: { respondedAt: string | null; invitedAt: string | null }) =>
  entry.respondedAt ?? entry.invitedAt ?? null;

export type RebuildPlanRelationshipsResult = {
  crewmateEdges: number;
  companionEdges: number;
  carriagedEdges: number;
  removedCrewmates: number;
  removedCompanions: number;
  removedCarriaged: number;
};

/**
 * Rebuilds all Neo4j relationships for a flight plan from the current accepted roster.
 * Removes existing per-plan edges first, then refreshes rollups (so role changes/removals are reflected).
 */
export const rebuildPlanRelationships = async (
  payloadInstance: Payload,
  flightPlanId: number,
): Promise<RebuildPlanRelationshipsResult> => {
  const roster = await listMembershipsForFlightPlan(payloadInstance, flightPlanId);
  const accepted = roster.filter((entry) => ACCEPTED_STATUSES.has(entry.status));
  const removed = await removePlanRelationshipEdges(flightPlanId);

  const crewMembers = accepted.filter((entry) => isCrewRole(entry.role));
  const passengerMembers = accepted.filter((entry) => isPassengerRole(entry.role));

  const crewmatePairs: Array<{ memberAId: number; memberBId: number }> = [];
  const companionPairs: Array<{ memberAId: number; memberBId: number }> = [];
  const carriagedPairs: Array<{ crewId: number; passengerId: number }> = [];

  for (let i = 0; i < crewMembers.length; i += 1) {
    for (let j = i + 1; j < crewMembers.length; j += 1) {
      await incrementCrewmateEdge({
        memberAId: crewMembers[i].userId,
        memberBId: crewMembers[j].userId,
        flightPlanId,
        occurredAt: resolveOccurredAt(crewMembers[j]),
        roleA: crewMembers[i].role,
        roleB: crewMembers[j].role,
      });
      crewmatePairs.push({ memberAId: crewMembers[i].userId, memberBId: crewMembers[j].userId });
    }
  }

  for (let i = 0; i < passengerMembers.length; i += 1) {
    for (let j = i + 1; j < passengerMembers.length; j += 1) {
      await incrementCompanionEdge({
        memberAId: passengerMembers[i].userId,
        memberBId: passengerMembers[j].userId,
        flightPlanId,
        occurredAt: resolveOccurredAt(passengerMembers[j]),
        roleA: passengerMembers[i].role,
        roleB: passengerMembers[j].role,
      });
      companionPairs.push({
        memberAId: passengerMembers[i].userId,
        memberBId: passengerMembers[j].userId,
      });
    }
  }

  for (const crewMember of crewMembers) {
    for (const passenger of passengerMembers) {
      await incrementCarriagedEdge({
        crewId: crewMember.userId,
        passengerId: passenger.userId,
        flightPlanId,
        occurredAt: resolveOccurredAt(passenger),
        crewRole: crewMember.role,
        passengerRole: passenger.role,
      });
      carriagedPairs.push({ crewId: crewMember.userId, passengerId: passenger.userId });
    }
  }

  await Promise.all([
    refreshCrewmateRollups([...removed.crewmates, ...crewmatePairs]),
    refreshCompanionRollups([...removed.companions, ...companionPairs]),
    refreshCarriagedRollups([...removed.carriaged, ...carriagedPairs]),
  ]);

  return {
    crewmateEdges: crewmatePairs.length,
    companionEdges: companionPairs.length,
    carriagedEdges: carriagedPairs.length,
    removedCrewmates: removed.crewmates.length,
    removedCompanions: removed.companions.length,
    removedCarriaged: removed.carriaged.length,
  };
};
