// Feature flags for the university production profile.
// Optional features remain in the codebase but are disabled by default.
// The owner/admin settings can later persist these flags in Supabase.

export const FEATURE_FLAGS = Object.freeze({
    aiAssistant: false,
    gamification: false,
    socialFeed: false,
    groupChat: false,
    directMessages: false,
    voiceVideo: false,
    leaderboard: false,
    studentNotes: true,
    bookmarks: true,
    ownerControlsAvailable: true
});

const SELECTORS_BY_FEATURE = {
    aiAssistant: ['[data-feature="ai"]', '#ai-assistant', '#ai-chat', '#ai-quiz-generator'],
    gamification: ['[data-feature="gamification"]', '#streak-widget', '#goals-widget'],
    socialFeed: ['[data-feature="social"]', '#feed-section', '#feed-badge'],
    groupChat: ['[data-feature="group-chat"]', '#group-chat-toggle', '#group-chat-window'],
    directMessages: ['[data-feature="dm"]', '#dm-badge-sidebar', '#dm-panel'],
    leaderboard: ['[data-feature="leaderboard"]', '#leaderboard-section'],
    studentNotes: ['[data-feature="notes"]', '#notes-widget'],
    bookmarks: ['[data-feature="bookmarks"]', '#bookmarks-widget']
};

const hide = (element) => {
    if (!element) return;
    element.classList.add('feature-disabled');
    element.setAttribute('aria-hidden', 'true');
    element.setAttribute('hidden', '');
};

export const isFeatureEnabled = (name) => FEATURE_FLAGS[name] === true;

export const applyFeatureFlags = () => {
    Object.entries(SELECTORS_BY_FEATURE).forEach(([feature, selectors]) => {
        if (isFeatureEnabled(feature)) return;
        selectors.forEach(selector => document.querySelectorAll(selector).forEach(hide));
    });

    document.documentElement.dataset.platformProfile = 'snu-official';
};

// Dynamic widgets such as chat/DM are created after startup.
export const observeDisabledFeatures = () => {
    const observer = new MutationObserver(() => applyFeatureFlags());
    observer.observe(document.body, { childList: true, subtree: true });
    applyFeatureFlags();
    return observer;
};

window.MASAR_FEATURE_FLAGS = FEATURE_FLAGS;
window.isFeatureEnabled = isFeatureEnabled;
window.applyFeatureFlags = applyFeatureFlags;
