// Central feature policy for the official university mode.
// Unknown or missing optional features are disabled by default.

export const FEATURE_KEYS = Object.freeze([
    'privateMessages',
    'generalChat',
    'studyChat',
    'helpChat',
    'randomChat',
    'socialFeed',
    'follows',
    'leaderboard',
    'gamification',
    'aiAssistant',
    'videoCalls'
]);

export const OFFICIAL_MODE_DEFAULTS = Object.freeze(
    Object.fromEntries(FEATURE_KEYS.map(key => [key, false]))
);

export const normalizeFeatureFlags = (storedFlags = {}) => Object.freeze(
    Object.fromEntries(
        FEATURE_KEYS.map(key => [key, storedFlags?.[key] === true])
    )
);

export const isFeatureEnabled = (flags, featureKey) => (
    FEATURE_KEYS.includes(featureKey) && flags?.[featureKey] === true
);

export const getEnabledFeatures = flags => FEATURE_KEYS.filter(
    key => isFeatureEnabled(flags, key)
);
