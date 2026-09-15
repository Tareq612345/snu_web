import test from 'node:test';
import assert from 'node:assert/strict';

import {
    OFFICIAL_MODE_DEFAULTS,
    normalizeFeatureFlags,
    isFeatureEnabled,
    getEnabledFeatures
} from '../featureFlags.js';

test('official mode keeps only AI assistant and streak enabled by default', () => {
    assert.deepEqual(getEnabledFeatures(OFFICIAL_MODE_DEFAULTS), ['streak', 'aiAssistant']);
});

test('private messages, social features, and leaderboard stay hidden by default', () => {
    assert.equal(isFeatureEnabled(OFFICIAL_MODE_DEFAULTS, 'privateMessages'), false);
    assert.equal(isFeatureEnabled(OFFICIAL_MODE_DEFAULTS, 'socialFeed'), false);
    assert.equal(isFeatureEnabled(OFFICIAL_MODE_DEFAULTS, 'leaderboard'), false);
    assert.equal(isFeatureEnabled(OFFICIAL_MODE_DEFAULTS, 'videoCalls'), false);
});

test('the owner can explicitly override a known feature', () => {
    const flags = normalizeFeatureFlags({ leaderboard: true, aiAssistant: false });
    assert.equal(isFeatureEnabled(flags, 'leaderboard'), true);
    assert.equal(isFeatureEnabled(flags, 'aiAssistant'), false);
});

test('unknown and malformed values cannot enable features', () => {
    const flags = normalizeFeatureFlags({ socialFeed: 'true', unknownFeature: true });
    assert.equal(isFeatureEnabled(flags, 'socialFeed'), false);
    assert.equal(isFeatureEnabled(flags, 'unknownFeature'), false);
});
