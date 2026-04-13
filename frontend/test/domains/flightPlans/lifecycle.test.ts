import { describe, expect, it } from 'vitest';

import {
  canEditFlightPlanMission,
  canDeleteFlightPlanForViewer,
  canManageFlightPlanLifecycleForViewer,
  hasFlightPlanAdminEditAccess,
  hasFlightPlanAdminReadAccess,
  getFlightPlanBucketLabel,
  getFlightPlanStatusLabel,
  resolveFlightPlanLifecycleBucket,
  resolveFlightPlanLifecycleStatus,
} from '~/domains/flightPlans/lifecycle';

describe('flightPlans lifecycle helpers', () => {
  it('normalizes lifecycle status and bucket labels', () => {
    expect(resolveFlightPlanLifecycleStatus('canceled')).toBe('cancelled');
    expect(resolveFlightPlanLifecycleBucket('ongoing')).toBe('active');
    expect(getFlightPlanStatusLabel('on-hold')).toBe('On hold');
    expect(getFlightPlanBucketLabel('postponed')).toBe('Archived');
  });

  it('enforces terminal owner-only mission editing policy', () => {
    expect(
      canEditFlightPlanMission({
        isOwner: true,
        isCrewOrganiser: false,
        membershipResolved: false,
        viewerIsContributor: false,
        status: 'success',
      }),
    ).toBe(true);

    expect(
      canEditFlightPlanMission({
        isOwner: false,
        isCrewOrganiser: true,
        membershipResolved: true,
        viewerIsContributor: false,
        status: 'failure',
      }),
    ).toBe(false);

    expect(
      canEditFlightPlanMission({
        isOwner: false,
        isCrewOrganiser: true,
        membershipResolved: true,
        viewerIsContributor: false,
        status: 'pending',
      }),
    ).toBe(true);

    expect(
      canEditFlightPlanMission({
        isOwner: false,
        isCrewOrganiser: true,
        membershipResolved: true,
        viewerIsContributor: true,
        status: 'pending',
      }),
    ).toBe(false);

    expect(
      canEditFlightPlanMission({
        ownerId: 5,
        viewerUserId: 8,
        viewerRole: 'captain',
        adminViewEnabled: true,
        adminEditEnabled: true,
        isOwner: false,
        isCrewOrganiser: false,
        membershipResolved: false,
        viewerIsContributor: false,
        status: 'pending',
      }),
    ).toBe(true);

    expect(
      canEditFlightPlanMission({
        ownerId: 5,
        viewerUserId: 8,
        viewerRole: 'captain',
        adminViewEnabled: true,
        adminEditEnabled: true,
        isOwner: false,
        isCrewOrganiser: false,
        membershipResolved: false,
        viewerIsContributor: false,
        status: 'failure',
      }),
    ).toBe(true);
  });

  it('derives lifecycle/delete permissions from shared capability evaluator', () => {
    expect(
      canManageFlightPlanLifecycleForViewer({
        ownerId: 5,
        viewerUserId: 6,
        viewerRole: 'sailing-master',
      }),
    ).toBe(true);

    expect(
      canManageFlightPlanLifecycleForViewer({
        ownerId: 5,
        viewerUserId: 6,
        viewerRole: 'boatswain',
      }),
    ).toBe(false);

    expect(
      canDeleteFlightPlanForViewer({
        ownerId: 5,
        viewerUserId: 6,
        viewerRole: 'quartermaster',
      }),
    ).toBe(true);

    expect(
      canDeleteFlightPlanForViewer({
        ownerId: 5,
        viewerUserId: 6,
        viewerRole: 'sailing-master',
      }),
    ).toBe(false);

    expect(
      canManageFlightPlanLifecycleForViewer({
        ownerId: 5,
        viewerUserId: 6,
        viewerRole: 'captain',
        adminViewEnabled: true,
        adminEditEnabled: true,
      }),
    ).toBe(true);

    expect(
      canDeleteFlightPlanForViewer({
        ownerId: 5,
        viewerUserId: 6,
        viewerRole: 'captain',
        adminViewEnabled: true,
        adminEditEnabled: true,
      }),
    ).toBe(true);
  });

  it('derives admin read/edit capability lanes from role + toggle dependencies', () => {
    expect(
      hasFlightPlanAdminReadAccess({
        viewerUserId: 10,
        viewerRole: 'quartermaster',
        adminViewEnabled: true,
      }),
    ).toBe(true);

    expect(
      hasFlightPlanAdminReadAccess({
        viewerUserId: 10,
        viewerRole: 'quartermaster',
        adminViewEnabled: false,
      }),
    ).toBe(false);

    expect(
      hasFlightPlanAdminEditAccess({
        viewerUserId: 11,
        viewerRole: 'captain',
        adminViewEnabled: true,
        adminEditEnabled: true,
      }),
    ).toBe(true);

    expect(
      hasFlightPlanAdminEditAccess({
        viewerUserId: 11,
        viewerRole: 'captain',
        adminViewEnabled: true,
        adminEditEnabled: false,
      }),
    ).toBe(false);

    expect(
      hasFlightPlanAdminEditAccess({
        viewerUserId: 11,
        viewerRole: 'quartermaster',
        adminViewEnabled: true,
        adminEditEnabled: true,
      }),
    ).toBe(false);
  });
});
