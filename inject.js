
// Nothing happens here, just escaping the isolated world.
// https://stackoverflow.com/questions/9515704/access-variables-and-functions-defined-in-page-context-using-a-content-script/9517879#9517879
const s = document.createElement('script');
s.src = chrome.runtime.getURL('interceptor.js');
s.onload = function() { this.remove() };
(document.head || document.documentElement).prepend(s);
