// Central feature policy for the official university mode.
// Unknown features are disabled. Inspect protection stays enabled unless the owner disables it.
export const FEATURE_KEYS = Object.freeze(['privateMessages','generalChat','studyChat','helpChat','randomChat','socialFeed','follows','leaderboard','xp','achievements','streak','aiAssistant','videoCalls','inspectProtection']);
export const OFFICIAL_MODE_DEFAULTS = Object.freeze({privateMessages:false,generalChat:false,studyChat:false,helpChat:false,randomChat:false,socialFeed:false,follows:false,leaderboard:false,xp:false,achievements:false,streak:true,aiAssistant:true,videoCalls:false,inspectProtection:true});
export const normalizeFeatureFlags = (storedFlags={}) => Object.freeze(Object.fromEntries(FEATURE_KEYS.map(key=>[key,typeof storedFlags?.[key]==='boolean'?storedFlags[key]:OFFICIAL_MODE_DEFAULTS[key]])));
export const isFeatureEnabled = (flags,featureKey) => FEATURE_KEYS.includes(featureKey)&&flags?.[featureKey]===true;
export const getEnabledFeatures = flags => FEATURE_KEYS.filter(key=>isFeatureEnabled(flags,key));
