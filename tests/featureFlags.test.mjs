import test from 'node:test';
import assert from 'node:assert/strict';
import {OFFICIAL_MODE_DEFAULTS,normalizeFeatureFlags,isFeatureEnabled,getEnabledFeatures} from '../featureFlags.js';
test('official mode keeps only AI assistant and streak enabled by default',()=>assert.deepEqual(getEnabledFeatures(OFFICIAL_MODE_DEFAULTS),['streak','aiAssistant']));
test('private, social, leaderboard and video stay hidden',()=>{for(const key of ['privateMessages','socialFeed','leaderboard','videoCalls'])assert.equal(isFeatureEnabled(OFFICIAL_MODE_DEFAULTS,key),false);});
test('owner can override known features',()=>{const flags=normalizeFeatureFlags({leaderboard:true,aiAssistant:false});assert.equal(isFeatureEnabled(flags,'leaderboard'),true);assert.equal(isFeatureEnabled(flags,'aiAssistant'),false);});
test('malformed values cannot enable features',()=>{const flags=normalizeFeatureFlags({socialFeed:'true',unknownFeature:true});assert.equal(isFeatureEnabled(flags,'socialFeed'),false);assert.equal(isFeatureEnabled(flags,'unknownFeature'),false);});
