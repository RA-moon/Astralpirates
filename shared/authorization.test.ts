import assert from 'node:assert/strict';
import test from 'node:test';

import {
  can,
  evaluateAuthorization,
} from './authorization';

test('admin capabilities enforce role and toggle dependencies', () => {
  assert.equal(
    can('adminReadAllContent', {
      actor: { userId: 11, isAuthenticated: true, websiteRole: 'quartermaster' },
      toggles: { adminViewEnabled: true, adminEditEnabled: false },
    }),
    true,
  );

  assert.equal(
    can('adminEditAllContent', {
      actor: { userId: 11, isAuthenticated: true, websiteRole: 'quartermaster' },
      toggles: { adminViewEnabled: true, adminEditEnabled: true },
    }),
    false,
  );

  assert.equal(
    can('adminEditAllContent', {
      actor: { userId: 7, isAuthenticated: true, websiteRole: 'captain' },
      toggles: { adminViewEnabled: false, adminEditEnabled: true },
    }),
    false,
  );

  assert.equal(
    can('adminEditAllContent', {
      actor: { userId: 7, isAuthenticated: true, websiteRole: 'captain' },
      toggles: { adminViewEnabled: true, adminEditEnabled: true },
    }),
    true,
  );
});

test('manageAvatar supports owner or captain pathways', () => {
  assert.equal(
    can('manageAvatar', {
      actor: { userId: 21, isAuthenticated: true, websiteRole: 'swabbie' },
      owner: { userId: 21 },
    }),
    true,
  );

  assert.equal(
    can('manageAvatar', {
      actor: { userId: 22, isAuthenticated: true, websiteRole: 'swabbie' },
      owner: { userId: 21 },
    }),
    false,
  );

  assert.equal(
    can('manageAvatar', {
      actor: { userId: 22, isAuthenticated: true, websiteRole: 'captain' },
      owner: { userId: 21 },
    }),
    true,
  );
});

test('flight-plan lifecycle capabilities map to owner and role thresholds', () => {
  assert.equal(
    can('manageFlightPlanLifecycle', {
      actor: { userId: 7, isAuthenticated: true, websiteRole: 'swabbie' },
      owner: { userId: 7 },
    }),
    true,
  );

  assert.equal(
    can('manageFlightPlanLifecycle', {
      actor: { userId: 8, isAuthenticated: true, websiteRole: 'sailing-master' },
      owner: { userId: 7 },
    }),
    true,
  );

  assert.equal(
    can('deleteFlightPlan', {
      actor: { userId: 8, isAuthenticated: true, websiteRole: 'quartermaster' },
      owner: { userId: 7 },
    }),
    true,
  );

  assert.equal(
    can('deleteFlightPlan', {
      actor: { userId: 8, isAuthenticated: true, websiteRole: 'sailing-master' },
      owner: { userId: 7 },
    }),
    false,
  );
});

test('website capability thresholds preserve legacy minimum-role behavior', () => {
  assert.equal(
    can('createFlightPlans', {
      actor: { userId: 301, isAuthenticated: true, websiteRole: 'seamen' },
    }),
    true,
  );

  assert.equal(
    can('createFlightPlans', {
      actor: { userId: 302, isAuthenticated: true, websiteRole: 'powder-monkey' },
    }),
    false,
  );

  assert.equal(
    can('manageLogs', {
      actor: { userId: 303, isAuthenticated: true, websiteRole: 'captain' },
    }),
    true,
  );

  assert.equal(
    can('manageLogs', {
      actor: { userId: 304, isAuthenticated: true, websiteRole: 'quartermaster' },
    }),
    false,
  );

  assert.equal(
    can('createFlightPlans', {
      actor: { userId: null, isAuthenticated: false, websiteRole: 'captain' },
    }),
    false,
  );

  assert.equal(
    can('manageMissionMedia', {
      actor: { userId: 305, isAuthenticated: true, websiteRole: 'captain' },
      toggles: { adminViewEnabled: false, adminEditEnabled: false },
    }),
    true,
  );

  assert.equal(
    can('manageMissionMedia', {
      actor: { userId: 306, isAuthenticated: true, websiteRole: 'captain' },
      toggles: { adminViewEnabled: true, adminEditEnabled: true },
    }),
    true,
  );

  assert.equal(
    can('manageMissionMedia', {
      actor: { userId: 307, isAuthenticated: true, websiteRole: 'quartermaster' },
      toggles: { adminViewEnabled: false, adminEditEnabled: false },
    }),
    false,
  );
});

test('editPage supports allowlists and min-role fallback behavior', () => {
  assert.equal(
    can(
      'editPage',
      {
        actor: { userId: 200, isAuthenticated: true, websiteRole: 'swabbie' },
      },
      {
        allowedUserIds: [200],
      },
    ),
    true,
  );

  assert.equal(
    can(
      'editPage',
      {
        actor: { userId: 201, isAuthenticated: true, websiteRole: 'boatswain' },
      },
      {
        minimumRole: 'boatswain',
      },
    ),
    true,
  );

  // Invalid min-role falls back to the permission minimum role (`captain`).
  assert.equal(
    can(
      'editPage',
      {
        actor: { userId: 202, isAuthenticated: true, websiteRole: 'quartermaster' },
      },
      {
        minimumRole: 'invalid-role',
      },
    ),
    false,
  );
});

test('evaluateAuthorization returns normalized decision payload', () => {
  const decision = evaluateAuthorization('manageHonorBadgeMedia', {
    actor: { userId: '88', websiteRole: 'captain' },
  });

  assert.equal(decision.allowed, true);
  assert.equal(decision.capability, 'manageHonorBadgeMedia');
  assert.equal(decision.context.actor.isAuthenticated, true);
});
