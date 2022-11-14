// To debug this code, open chrome://extensions and click the "service worker" link in the card to open DevTools.
chrome.runtime.onInstalled.addListener(async () => {
    // Content-scripts in manifest don't allow 'world: "MAIN"'.
    chrome.scripting.registerContentScripts([{
        id: 'twitter-mastodon-interceptor',
        js: ['interceptor.js'],
        matches: ['https://*.twitter.com/*'],
        world: 'MAIN',
        runAt: 'document_start',
    }]);
});
