import test from 'node:test';
import assert from 'node:assert/strict';

import {
    FEATURE_KEYS,
    OFFICIAL_MODE_DEFAULTS,
    normalizeFeatureFlags,
    isFeatureEnabled,
    getEnabledFeatures
} from '../featureFlags.js';

test('strict official mode disables every optional feature by default', () => {
    assert.equal(FEATURE_KEYS.length > 0, true);
    assert.deepEqual(getEnabledFeatures(OFFICIAL_MODE_DEFAULTS), []);
});

test('only explicit true values enable known features', () => {
    const flags = normalizeFeatureFlags({
        leaderboard: true,
        privateMessages: false,
        unknownFeature: true
    });

    assert.equal(isFeatureEnabled(flags, 'leaderboard'), true);
    assert.equal(isFeatureEnabled(flags, 'privateMessages'), false);
    assert.equal(isFeatureEnabled(flags, 'unknownFeature'), false);
});

test('missing, malformed, and truthy non-boolean values stay disabled', () => {
    const flags = normalizeFeatureFlags({
        aiAssistant: 'true',
        socialFeed: 1,
        follows: null
    });

    assert.deepEqual(getEnabledFeatures(flags), []);
});
