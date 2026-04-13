import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canUseAdminEditOverride,
  canUseAdminReadOverride,
  parseAdminModeFlag,
  resolveAdminModeEligibility,
  resolveEffectiveAdminMode,
} from './adminMode';

test('parseAdminModeFlag recognizes expected true values', () => {
  assert.equal(parseAdminModeFlag(true), true);
  assert.equal(parseAdminModeFlag(1), true);
  assert.equal(parseAdminModeFlag('true'), true);
  assert.equal(parseAdminModeFlag('TRUE'), true);
  assert.equal(parseAdminModeFlag('1'), true);
  assert.equal(parseAdminModeFlag('on'), true);
  assert.equal(parseAdminModeFlag('yes'), true);
});

test('parseAdminModeFlag returns false for unsupported values', () => {
  assert.equal(parseAdminModeFlag(false), false);
  assert.equal(parseAdminModeFlag(0), false);
  assert.equal(parseAdminModeFlag('false'), false);
  assert.equal(parseAdminModeFlag('0'), false);
  assert.equal(parseAdminModeFlag(undefined), false);
  assert.equal(parseAdminModeFlag(null), false);
});

test('resolveAdminModeEligibility respects website role thresholds', () => {
  assert.deepEqual(resolveAdminModeEligibility('captain'), {
    canUseAdminView: true,
    canUseAdminEdit: true,
  });
  assert.deepEqual(resolveAdminModeEligibility('quartermaster'), {
    canUseAdminView: true,
    canUseAdminEdit: false,
  });
  assert.deepEqual(resolveAdminModeEligibility('sailing-master'), {
    canUseAdminView: false,
    canUseAdminEdit: false,
  });
  assert.deepEqual(resolveAdminModeEligibility('guest'), {
    canUseAdminView: false,
    canUseAdminEdit: false,
  });
});

test('resolveEffectiveAdminMode enforces edit dependency on admin view', () => {
  const captainWithEditOnly = resolveEffectiveAdminMode({
    role: 'captain',
    adminViewRequested: false,
    adminEditRequested: true,
  });
  assert.equal(captainWithEditOnly.adminViewEnabled, false);
  assert.equal(captainWithEditOnly.adminEditEnabled, false);
  assert.equal(canUseAdminReadOverride(captainWithEditOnly), false);
  assert.equal(canUseAdminEditOverride(captainWithEditOnly), false);

  const captainFull = resolveEffectiveAdminMode({
    role: 'captain',
    adminViewRequested: true,
    adminEditRequested: true,
  });
  assert.equal(captainFull.adminViewEnabled, true);
  assert.equal(captainFull.adminEditEnabled, true);
  assert.equal(canUseAdminReadOverride(captainFull), true);
  assert.equal(canUseAdminEditOverride(captainFull), true);
});

test('resolveEffectiveAdminMode keeps non-captain users read-only', () => {
  const quartermaster = resolveEffectiveAdminMode({
    role: 'quartermaster',
    adminViewRequested: true,
    adminEditRequested: true,
  });
  assert.equal(quartermaster.adminViewEnabled, true);
  assert.equal(quartermaster.adminEditEnabled, false);
  assert.equal(canUseAdminReadOverride(quartermaster), true);
  assert.equal(canUseAdminEditOverride(quartermaster), false);
});
