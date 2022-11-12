/***
 *
 * Mastodon Handles in Twitter!
 *
 * This extension works by intercepting the XHRequests used by the twitter frontend and scraping them for user info.
 * Using this list we can search for anything that resembles a mastodon handle in a users name, bio or their links.
 * This entire extension is inspired by Debirdify (https://pruvisto.org/debirdify/) which I found very helpful.
 *
 * ***/

{
    // From Debirdify: https://github.com/pruvisto/debirdify/blob/main/main/extract_mastodon_ids.py
    // Matches anything of the form @foo@bar.bla or foo@bar.social or foo@social.bar or foo@barmastodonbla
    // We do not match everything of the form foo@bar or foo@bar.bla to avoid false positives like email addresses
    const M_ID_PATTERN_STRICT = /(@|🐘|Mastodon:?)?\s*?([\w\-\.]+@[\w\-\.]+\.[\w\-\.]+)/gi;
    const M_ID_PATTERN_LOOSE = /\b((http:\/\/|https:\/\/)?([\w\-\.]+\.[\w\-\.]+)\/(web\/)?@([\w\-\.]+))\/?\b/gi;
    const M_URL_PATTERN = /^\/(@|web\/@?)([\w\-\.]+)(\/.*|[.:,;!?()\[\]{}].*)?$/gi;

    const FORBIDDEN_HOSTS = ['tiktok.com', 'youtube.com', 'medium.com', 'skeb.jp', 'pronouns.page', 'foundation.app', 'gamejolt.com', 'traewelling.de', 'observablehq.com', 'gmail.com', 'hotmail.com', 'manylink.co', 'withkoji.com', 'twitter.com', 'nomadlist.com', 'figma.com', 'peakd.com', 'jabber.ccc.de', 'yahoo.com', 'aol.com', 'vice.com', 'wsj.com', 'theguardian.com', 'cbsnews.com', 'cnn.com', 'welt.de', 'nytimes.com', 'gmx.de', 'web.de', 'posteo.de', 'arcor.de', 'bell.net'];

    const HOST_HEURISTIC_KEYWORDS = ['social', 'masto', 'mastodon', 'space', 'fedi', 'toot', 'mstdn'];
    const MASTODON_KEYWORDS = ['mastodon', 'toot', 'tröt', 'fedi'];

    const $ = (query, parent = document) => parent.querySelector(query);
    const $$ = (query, parent = document) => [...parent.querySelectorAll(query)];

    console.debug('Mastodon Handles Extension loaded!');
    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function() {
        this.addEventListener('load', function () {onResponse(this)});
        origOpen.apply(this, arguments);
    };

    const parseXHRResponse = (xhrRes) => {
        try {
            return JSON.parse(xhrRes.responseText);
        } catch (e) {
            return null;
        }
    };

    const onResponse = (xhrRes) => {
        if (xhrRes.status !== 200) return;
        if (xhrRes.responseURL?.includes('all')) handleResponseWithUsers(xhrRes);
        if (xhrRes.responseURL?.includes('home')) handleResponseWithUsers(xhrRes);
        if (xhrRes.responseURL?.includes('adaptive')) handleResponseWithUsers(xhrRes);
    };

    const usersStore = {};
    window['___EXTENSION_MASTODON_HANDLES_TWITTER_USERS_STORE'] = usersStore;

    const handleResponseWithUsers = (xhrRes) => {
        const data = parseXHRResponse(xhrRes);
        if (!data) return;

        try {
            Object.entries(data.globalObjects.users).forEach(([, user]) => {
                usersStore[user.screen_name] = user;
            })
        } catch (e) {
            // We'll get 'em next time.
        }
    };

    const idlePoll = (fn, t) => {
        let idleCallback = null;

        const interval = setInterval(() => {
            if (idleCallback) cancelIdleCallback(idleCallback);
            idleCallback = requestIdleCallback(() => {
                idleCallback = null;
                fn();
            })
        }, t)

        return function abort() {
            if (idleCallback) cancelIdleCallback(idleCallback);
            clearInterval(interval);
        }
    };

    const walkXPathResult = (iter, fn) => {
        let item = iter.iterateNext();
        while (item) {
            fn(item);
            item = iter.iterateNext();
        }
    };

    const abort = idlePoll(() => {
        promoteUserPostHandles();
    }, 1000);

    const promoteUserPostHandles = () => {
        const timelineNode = $('[aria-label*=Timeline]') || document;
        try {
            const potentialUserHandles = document.evaluate("//a[contains(., '@')]", timelineNode, null, XPathResult.UNORDERED_NODE_ITERATOR_TYPE, null);
            walkXPathResult(potentialUserHandles, userHandleNode => {
                const twitterHandle = userHandleNode.textContent.substring(1); // Remove @
                if (userHandleNode.href === `https://twitter.com/${twitterHandle}` || location.pathname.includes(twitterHandle)) {
                    promoteMastodon(userHandleNode, twitterHandle);
                }
            })
        } catch (e) {/* Ignore, we'll try again in a second. */}
    };

    const isValidMastodonId = (str) => /[\w\-\.]+/.test(str);

    const matchesHostHeuristics = (str) => {
        return HOST_HEURISTIC_KEYWORDS.some(keyword => str.includes(keyword));
    };

    const validateHost = (host, strict = true) => {
        const str = host.toLowerCase();
        if (FORBIDDEN_HOSTS.includes(str)) return false;
        if (!strict) return true;
        // Todo: if (KNOWN_HOSTS.includes(str)) return true;
        if (matchesHostHeuristics(str)) return true;
        return false;
    };

    // Expects @foo@bar.tld
    const validateMastodonHandle = (handle, strict = true) => {
        const split = handle.split('@');
        if (split.length !== 3) return false;

        const  [, name, host] = split;
        return isValidMastodonId(name) && validateHost(host, strict);
    };

    // Parse Mastodon IDs of the form @foo@bar.tld or foo@bar.tld
    const findMastodonIdByHandle = (str) => {
        try {
            let matches = [...str.matchAll(M_ID_PATTERN_STRICT)].find((match) => !!match?.[2]);
            if (!matches || matches.length < 3) return null;
            const [, prefix, dirtyHandle] = matches;
            const handle = dirtyHandle.trim();
            const strict = !prefix;

            if (!validateMastodonHandle(`@${handle}`, strict)) return null;
            return `@${handle}`;
        } catch (e) {
            console.error(`Mastodon Extension: Threw while resolving mastodon handle for twitter handle: "${str}"`);
            throw e;
        }
    };

    const findMastodonIdInUrls = (urls) => {
        try {
            for (const url of urls.map(u => new URL(u))) {
                const host = url.host;
                const [,, nameNoAt] = [...url.pathname.matchAll(M_URL_PATTERN)].find((match) => !!match?.[2]) || [];
                if (!nameNoAt) continue;
                const mastodonHandle = `@${nameNoAt}@${host}`;

                if (validateMastodonHandle(mastodonHandle, true)) {
                    return mastodonHandle;
                }
            }

            return null;
        }  catch (e) {
            console.error(`Mastodon Extension: Threw while resolving mastodon handle for urls: "${urls}"`);
            throw e;
        }
    };

    const getLinkedUrls = (twitterHandle) => {
        const entities = usersStore[twitterHandle]?.entities;
        const urls = [];

        urls.push(...(entities.url?.urls?.map(u => u.expanded_url) || []));
        urls.push(...(entities.description?.urls?.map(u => u.expanded_url) || []));
        urls.push(...(entities.location?.urls?.map(u => u.expanded_url) || []));

        return urls.filter(Boolean);
    };

    const findMastodonHandle = (twitterHandle) => {
        const user = usersStore[twitterHandle];
        if (!user) return null;

        // Check: links, bio (&todo: pinned tweets).
        return findMastodonIdInUrls(getLinkedUrls(twitterHandle)) || findMastodonIdByHandle(user.description) // || findMastodonId(user.pinned_tweet_ids)
    };

    const toInstanceUrl = (mHandle) => {
        const [username, host] = mHandle.split('@').filter(Boolean);
        return `https://${host}/@${username}`;
    };

    const userMentionsMastodon = (twitterHandle) => {
        return MASTODON_KEYWORDS.some(keyword => usersStore[twitterHandle]?.description?.toLowerCase().includes(keyword));
    };

    const promoteMastodon = (anchorElement, twitterHandle) => {
        const mastodonHandle = findMastodonHandle(twitterHandle);

        const textElement = document.evaluate(`//*[contains(text(),'@${twitterHandle}')]`, anchorElement, null, XPathResult.FIRST_ORDERED_NODE_TYPE,null).singleNodeValue;
        if (mastodonHandle) {
            if (['undefined','null','NaN'].some(s => mastodonHandle.includes(s))) {
                console.warn(`Mastodon Extension: Skipping likely malformed mastodon handle "${mastodonHandle}" for "${twitterHandle}"`);
            } else {
                textElement.innerText = `🦣 ${mastodonHandle}`;
                anchorElement.href = toInstanceUrl(mastodonHandle);
                anchorElement.target = '_blank';
            }
        } else if (userMentionsMastodon(twitterHandle)) {
            textElement.innerText = `🦣 ${textElement.innerText}`;
        }
    };
}

