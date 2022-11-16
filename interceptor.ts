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
    console.debug('Mastodon Handles Extension loaded!');

    const MASTODON_ICON_CLASS_NAME = 'EXTENSION_MASTODON_HANDLES_mastodonIcon';

    // From Debirdify: https://github.com/pruvisto/debirdify/blob/main/main/extract_mastodon_ids.py
    // Matches anything of the form @foo@bar.tld or foo@bar.social or foo@social.bar or foo@barmastodontld
    // We do not match everything of the form foo@bar or foo@bar.tld to avoid false positives like email addresses
    const M_ID_PATTERN_STRICT = /(@|🐘|Mastodon:?)?\s*?([\w\-\.]+@[\w\-\.]+\.[\w\-\.]+)/gi;
    const M_ID_PATTERN_LOOSE = /\b((http:\/\/|https:\/\/)?([\w\-\.]+\.[\w\-\.]+)\/(web\/)?@([\w\-\.]+))\/?\b/gi;
    const M_URL_PATTERN = /^\/(@|web\/@?)([\w\-\.]+)(\/.*|[.:,;!?()\[\]{}].*)?$/gi;

    const FORBIDDEN_HOSTS = ['tiktok.com', 'youtube.com', 'medium.com', 'skeb.jp', 'pronouns.page', 'foundation.app', 'gamejolt.com', 'traewelling.de', 'observablehq.com', 'gmail.com', 'hotmail.com', 'manylink.co', 'withkoji.com', 'twitter.com', 'nomadlist.com', 'figma.com', 'peakd.com', 'jabber.ccc.de', 'yahoo.com', 'aol.com', 'vice.com', 'wsj.com', 'theguardian.com', 'cbsnews.com', 'cnn.com', 'welt.de', 'nytimes.com', 'gmx.de', 'web.de', 'posteo.de', 'arcor.de', 'bell.net'];
    const KNOWN_HOSTS = ['mas.to', 'wandering.shop', 'peoplemaking.games', 'todon.eu', 'tilde.zone', 'libretooth.gr', 'metalhead.club', 'lor.sh', 'mathstodon.xyz', 'fosstodon.org', 'masto.ai', 'ravenation.club', 'qoto.org', 'primarycare.app', 'socel.net', 'ioc.exchange', 'hachyderm.io', 'universeodon.com', 'pettingzoo.co', 'masto.nu', 'infosec.exchange'];

    const HOST_HEURISTIC_KEYWORDS = ['social', 'masto', 'mastodon', 'space', 'fedi', 'toot', 'mstdn'];
    const FEDIVERSE_KEYWORDS = ['mastodon', 'toot', 'tröt', 'fedi', '🦣']; // Todo: Add other fediverse services: https://en.wikipedia.org/wiki/Fediverse

    // https://materialdesignicons.com/icon/mastodon
    const MASTODON_ICON_SVG_NODE = new DOMParser().parseFromString(`
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" class="${MASTODON_ICON_CLASS_NAME}">
            <path fill="currentColor" d="M20.94,14C20.66,15.41 18.5,16.96 15.97,17.26C14.66,17.41 13.37,17.56 12,17.5C9.75,17.39 8,16.96 8,16.96V17.58C8.32,19.8 10.22,19.93 12.03,20C13.85,20.05 15.47,19.54 15.47,19.54L15.55,21.19C15.55,21.19 14.27,21.87 12,22C10.75,22.07 9.19,21.97 7.38,21.5C3.46,20.45 2.78,16.26 2.68,12L2.67,8.57C2.67,4.23 5.5,2.96 5.5,2.96C6.95,2.3 9.41,2 11.97,2H12.03C14.59,2 17.05,2.3 18.5,2.96C18.5,2.96 21.33,4.23 21.33,8.57C21.33,8.57 21.37,11.78 20.94,14M18,8.91C18,7.83 17.7,7 17.15,6.35C16.59,5.72 15.85,5.39 14.92,5.39C13.86,5.39 13.05,5.8 12.5,6.62L12,7.5L11.5,6.62C10.94,5.8 10.14,5.39 9.07,5.39C8.15,5.39 7.41,5.72 6.84,6.35C6.29,7 6,7.83 6,8.91V14.17H8.1V9.06C8.1,8 8.55,7.44 9.46,7.44C10.46,7.44 10.96,8.09 10.96,9.37V12.16H13.03V9.37C13.03,8.09 13.53,7.44 14.54,7.44C15.44,7.44 15.89,8 15.89,9.06V14.17H18V8.91Z" />
        </svg>`, 'image/svg+xml').documentElement;

    const $ = <T extends HTMLElement>(query: string, parent = document) => parent.querySelector(query) as T | null;
    const $$ = (query: string, parent = document) => Array.from(parent.querySelectorAll(query));



    /*** Scrape User Data ***/


    interface UsersStoreEntry {
        twitterHandle: string;
        twitterId?: string;
        mastodonHandle?: string;
        mastodonUrl?: string;
        mentionsFediverse: boolean;
    }

    const usersStore: Record<string /* TwitterHandle */, UsersStoreEntry> = {};
    (window as any)['___EXTENSION_MASTODON_HANDLES_TWITTER_USERS_STORE'] = usersStore;

    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function() {
        this.addEventListener('load', function () {onResponse(this)});
        origOpen.apply(this, arguments as any);
    };

    const parseXHRResponse = (xhrRes: XMLHttpRequest) => {
        try {
            return JSON.parse(xhrRes.responseText);
        } catch (e) {
            return null;
        }
    };

    const onResponse = (xhrRes: XMLHttpRequest) => {
        if (xhrRes.status !== 200) return;
        if (xhrRes.responseURL?.includes('all.json')) handleJSONResponseWithUsers(xhrRes);
        if (xhrRes.responseURL?.includes('home.json')) handleJSONResponseWithUsers(xhrRes);
        if (xhrRes.responseURL?.includes('adaptive.json')) handleJSONResponseWithUsers(xhrRes);
        if (xhrRes.responseURL?.includes('guide.json')) handleJSONResponseWithUsers(xhrRes);
        if (xhrRes.responseURL?.includes('recommendations.json')) handleRecommendationsResponse(xhrRes);
        if (xhrRes.responseURL?.includes('HomeLatestTimeline')) handleLatestTweetsResponse(xhrRes);
        if (xhrRes.responseURL?.includes('CommunitiesMainPageTimeline')) handleCommunityTimelineResponse(xhrRes);
        if (xhrRes.responseURL?.includes('UserTweets')) handleUserTimelineResponse(xhrRes);
        if (xhrRes.responseURL?.includes('UserTweetsAndReplies')) handleUserTimelineResponse(xhrRes);
        if (xhrRes.responseURL?.includes('UserMedia')) handleUserTimelineResponse(xhrRes);
        if (xhrRes.responseURL?.includes('Likes')) handleUserTimelineResponse(xhrRes);
        if (xhrRes.responseURL?.includes('TweetDetail')) handleTweetDetailResponse(xhrRes);
        if (xhrRes.responseURL?.includes('Followers')) handleFollowersResponse(xhrRes);
        if (xhrRes.responseURL?.includes('Following')) handleFollowersResponse(xhrRes);
        if (xhrRes.responseURL?.includes('ConnectTabTimeline')) handleConnectTabTimelineResponse(xhrRes);
    };

    const handleJSONResponseWithUsers = (xhrRes: XMLHttpRequest) => {
        const res = parseXHRResponse(xhrRes);
        Object.entries(res?.globalObjects?.users || {}).forEach(([, user]) => {
            extractDataFromLegacyUserObject(user);
        })
    };

    const handleLatestTweetsResponse = (xhrRes: XMLHttpRequest) => {
        const res = parseXHRResponse(xhrRes);
        const graphqlInstructions = res?.data?.home?.home_timeline_urt?.instructions;
        if (graphqlInstructions) extractUsersFromGraphqlInstructions(graphqlInstructions);
    };

    const handleCommunityTimelineResponse = (xhrRes: XMLHttpRequest) => {
        const res = parseXHRResponse(xhrRes);
        const graphqlInstructions = res?.data?.viewer?.communities_timeline?.timeline?.instructions;
        if (graphqlInstructions) extractUsersFromGraphqlInstructions(graphqlInstructions);
    };

    const handleUserTimelineResponse = (xhrRes: XMLHttpRequest) => {
        const res = parseXHRResponse(xhrRes);
        const graphqlInstructions = res?.data?.user?.result?.timeline_v2?.timeline?.instructions;
        if (graphqlInstructions) extractUsersFromGraphqlInstructions(graphqlInstructions);
    };

    const handleTweetDetailResponse = (xhrRes: XMLHttpRequest) => {
        const res = parseXHRResponse(xhrRes);
        const graphqlInstructions = res?.data?.threaded_conversation_with_injections_v2?.instructions;
        if (graphqlInstructions) extractUsersFromGraphqlInstructions(graphqlInstructions);
    };

    const handleFollowersResponse = (xhrRes: XMLHttpRequest) => {
        const res = parseXHRResponse(xhrRes);
        const graphqlInstructions = res?.data?.user?.result?.timeline?.timeline?.instructions;
        if (graphqlInstructions) extractUsersFromGraphqlInstructions(graphqlInstructions);
    };

    const handleRecommendationsResponse = (xhrRes: XMLHttpRequest) => {
        const res = parseXHRResponse(xhrRes);
        res?.forEach?.((tokenizedUser: any) => {
            if (tokenizedUser?.user) extractDataFromLegacyUserObject(tokenizedUser.user)
        })
    };

    const handleConnectTabTimelineResponse = (xhrRes: XMLHttpRequest) => {
        const res = parseXHRResponse(xhrRes);
        const graphqlInstructions = res?.data?.connect_tab_timeline?.timeline?.instructions;
        if (graphqlInstructions) extractUsersFromGraphqlInstructions(graphqlInstructions);
    };

    const extractUsersFromGraphqlInstructions = (instructions: any) => {
        instructions?.forEach((instruction: any) => {
            instruction?.entries?.forEach((entry: any) => {
                const tweetResult = entry?.content?.itemContent?.tweet_results?.result;
                if (tweetResult) extractUsersFromTweetResult(tweetResult);

                const legacyUserResult = entry?.content?.itemContent?.user_results?.result?.legacy;
                if (legacyUserResult) extractDataFromLegacyUserObject(legacyUserResult);

                entry?.content?.items?.forEach((item: any) => {
                    const tweetResult = item?.item?.itemContent?.tweet_results?.result;
                    if (tweetResult) extractUsersFromTweetResult(tweetResult);

                    const legacyUserResult = item?.item?.itemContent?.user_results?.result?.legacy;
                    if (legacyUserResult) extractDataFromLegacyUserObject(legacyUserResult);
                });
            });
        });
    }

    const extractUsersFromTweetResult = (tweetResult: any) => {
        const legacyUser = (tweetResult?.core || tweetResult?.tweet?.core)?.user_results?.result?.legacy;
        if (legacyUser) extractDataFromLegacyUserObject(legacyUser);

        const retweetResult = tweetResult?.legacy?.retweeted_status_result?.result;
        if (retweetResult) extractUsersFromTweetResult(retweetResult);

        const quotedTweetUser = tweetResult?.quoted_status_result?.result?.core?.user_results?.result?.legacy;
        if (quotedTweetUser) extractDataFromLegacyUserObject(quotedTweetUser);
    }

    const extractDataFromLegacyUserObject = (legacyUser: any) => {
        const userEntry: UsersStoreEntry = {
            twitterHandle: legacyUser.screen_name,
            twitterId: legacyUser.id_str,
            mentionsFediverse: userMentionsFediverse(legacyUser),
        }

        // Look through username, any links and the user bio. Todo: Pinned tweets.
        const mastodonHandle =
            findMastodonHandle(legacyUser.name) ||
            findMastodonHandleInUrls(getLinkedUrlsFromLegacyUser(legacyUser)) ||
            findMastodonHandle(legacyUser.description);

        if (mastodonHandle) {
            userEntry.mastodonHandle = mastodonHandle;
            userEntry.mastodonUrl = mastodonHandleToInstanceUrl(mastodonHandle);
        }

        usersStore[legacyUser.screen_name] = userEntry;
    }

    const userMentionsFediverse = (legacyUser: any) => {
        return [legacyUser?.description, legacyUser?.name, ...getLinkedUrlsFromLegacyUser(legacyUser)]
            .some(str => FEDIVERSE_KEYWORDS.some(keyword => str?.toLowerCase().includes(keyword)));
    };

    // Parse Mastodon IDs of the form @foo@bar.tld or foo@bar.tld
    const findMastodonHandle = (str: string) => {
        try {
            const matches = [...str.matchAll(M_ID_PATTERN_STRICT)].find((match) => !!match?.[2]);
            if (matches && matches.length >= 3) {
                const [, prefix, dirtyHandle] = matches;
                const handle = dirtyHandle.trim();
                const strict = !prefix;

                if (validateMastodonHandle(`@${handle}`, strict)) {
                    return `@${handle}`;
                }
            } else {
                const matches = [...str.matchAll(M_ID_PATTERN_LOOSE)].find((match) => !!match?.[5]);
                if (matches && matches.length >= 6) {
                    const host = matches[3].trim();
                    const id = matches[5].trim();
                    const handle = `@${id}@${host}`;

                    if (validateMastodonHandle(handle, true)) {
                        return handle;
                    }
                }
            }

            return null;
        } catch (e) {
            console.error(`Mastodon Extension: Threw while resolving mastodon handle for twitter handle: "${str}"`);
            throw e;
        }
    };

    const findMastodonHandleInUrls = (urls: string[]) => {
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

    const isValidMastodonId = (str: string) => /[\w\-\.]+/.test(str);

    const matchesHostHeuristics = (str: string) => {
        return HOST_HEURISTIC_KEYWORDS.some(keyword => str.includes(keyword));
    };

    const validateHost = (host: string, strict = true) => {
        const str = host.toLowerCase();
        if (FORBIDDEN_HOSTS.includes(str)) return false;
        if (!strict) return true;
        if (KNOWN_HOSTS.includes(str)) return true;
        if (matchesHostHeuristics(str)) return true;
        return false;
    };

    // Expects @foo@bar.tld
    const validateMastodonHandle = (handle: string, strict = true) => {
        const split = handle.split('@');
        if (split.length !== 3) return false;

        const  [, name, host] = split;
        return isValidMastodonId(name) && validateHost(host, strict);
    };

    const getLinkedUrlsFromLegacyUser = (user: any) => {
        const urls = [];
        urls.push(...(user?.entities?.url?.urls?.map((u: any) => u.expanded_url) || []));
        urls.push(...(user?.entities?.description?.urls?.map((u: any) => u.expanded_url) || []));
        urls.push(...(user?.entities?.location?.urls?.map((u: any) => u.expanded_url) || []));
        return urls.filter(Boolean);
    };

    const mastodonHandleToInstanceUrl = (mastodonHandle: string) => {
        const [username, host] = mastodonHandle.split('@').filter(Boolean);
        return `https://${host}/@${username}`;
    };



    /*** Insert into UI ***/


    const idleInterval = (fn: () => unknown, t: number) => {
        let idleCallback: number | null = null;

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

    idleInterval(() => addIconToHandles(), 1_000);

    const addIconToHandles = () => {
        const potentialUserHandles = document.evaluate("//span[starts-with(., '@')]", document, null, XPathResult.UNORDERED_NODE_ITERATOR_TYPE, null);
        const twitterHandleElements: HTMLSpanElement[] = mapXPathResult(potentialUserHandles, (el) => el);

        twitterHandleElements.forEach((el) => {
            const twitterHandle = el.textContent!.substring(1); // Remove @
            const user = usersStore[twitterHandle];
            if (!user) return;

            tryAsTweet(el, user);
            tryAsTweetSpotlight(el, user);
            tryAsUserCell(el, user);
        })
    };

    const findParentElement = (node: HTMLElement, predicate: (node: HTMLElement) => boolean, maxDepth = Infinity) => {
        let depth = 0;
        let target: HTMLElement | null = node;
        while (target && depth <= maxDepth) {
            if (predicate(target)) return target;
            target = target.parentElement;
            depth++;
        }
        return null;
    }

    const tryAsTweet = (el: HTMLSpanElement, user: UsersStoreEntry) => {
        try {
            if (el.dataset.hasTwitterPromotion) return;

            const mastodonIconElement = createMastodonIconElement(user);
            if (!mastodonIconElement) return;

            const wrapper = findParentElement(el, (el) => !!el.textContent?.startsWith(`@${user.twitterHandle}·`) && !!el.querySelector('time'), 6);
            if (!wrapper) return;

            wrapper.appendChild(createTwitterSeparatorElement());
            wrapper.appendChild(mastodonIconElement);

            el.dataset.hasTwitterPromotion = 'true';
        } catch (e) { /* ... */ }
    }

    const tryAsTweetSpotlight = (el: HTMLSpanElement, user: UsersStoreEntry) => {
        try {
            if (el.dataset.hasTwitterPromotion) return;

            const mastodonIconElement = createMastodonIconElement(user);
            if (!mastodonIconElement) return;

            const wrapper = el.closest(`[data-testid="User-Names"] a[href="/${user.twitterHandle}"]`)?.parentElement?.parentElement;
            if (!wrapper) return;

            wrapper.appendChild(createTwitterSeparatorElement());
            wrapper.appendChild(mastodonIconElement);

            el.dataset.hasTwitterPromotion = 'true';
        } catch (e) { /* ... */ }
    }

    const tryAsUserCell = (el: HTMLSpanElement, user: UsersStoreEntry) => {
        try {
            if (el.dataset.hasTwitterPromotion) return;

            const mastodonIconElement = createMastodonIconElement(user);
            if (!mastodonIconElement) return;

            const wrapper = el.closest(`[data-testid="UserCell"] a[href="/${user.twitterHandle}"]`)?.parentElement?.parentElement;
            if (!wrapper) return;

            wrapper.appendChild(createTwitterSeparatorElement());
            wrapper.appendChild(mastodonIconElement);

            el.dataset.hasTwitterPromotion = 'true';
        } catch (e) { /* ... */ }
    }

    const mapXPathResult = (iter: XPathResult, fn: (element: Node) => any) => {
        const result: any[] = [];
        let item = iter.iterateNext();
        while (item) {
            result.push(fn(item));
            item = iter.iterateNext();
        }
        return result;
    };

    const createMastodonIconElement = (user: UsersStoreEntry) => {
        let element = null;

        if (user.mastodonUrl) {
            element = document.createElement('a');
            element.href = user.mastodonUrl;
            element.target = '_blank';

            if (user.mastodonHandle) {
                element.title = user.mastodonHandle;
            }
        } else if (user.mentionsFediverse) {
            element = document.createElement('a');
            element.href = `https://twitter.com/${user.twitterHandle}`;
        }

        if (element) {
            element.appendChild(MASTODON_ICON_SVG_NODE.cloneNode(true));
        }

        return element;
    }

    const createTwitterSeparatorElement = () => {
        const span = document.createElement('span');
        span.textContent = '·';

        const wrapper = document.createElement('div');
        wrapper.setAttribute('aria-hidden', 'true');
        wrapper.style.color = 'rgb(113, 118, 123)';
        wrapper.style.padding = '0 4px';
        wrapper.style.fontSize = '15px';
        wrapper.style.lineHeight = '20px';
        wrapper.style.fontFamily = "'TwitterChirp', sans-serif";

        wrapper.appendChild(span);

        return wrapper;
    }
}
