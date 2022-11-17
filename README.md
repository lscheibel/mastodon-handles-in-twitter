# <img src="https://user-images.githubusercontent.com/44374653/201935205-8c62ec45-e088-4c47-afed-462ae40f89ce.png" width="32px" style="transform: translateY(12px)"> Mastodon Handles in Twitter

Find out who has a Mastodon account while scrolling twitter!

<img width="348" alt="image" src="https://user-images.githubusercontent.com/44374653/201537046-a8bccb13-55e7-4c29-af8e-120a3422a7a8.png">
<img width="349" alt="image" src="https://user-images.githubusercontent.com/44374653/201537076-38550428-41f3-49d1-a45e-1d4164c13931.png">

## Installation

Install it from the Chrome Web Store: https://chrome.google.com/webstore/detail/mastodon-handles-in-twitt/ncgejfiheecflhpoifeembagnjgigioi
Works for any Chromium based browser (Chrome, Edge, etc).

## About

This is a Chromium (Chrome, Edge, etc.) extension which tries to find the Mastodon handle of a Twitter user and display it next to their tweets.
It works very similarly to [Debirdify](https://pruvisto.org/debirdify/) by searching through Twitters user bios.

## Dev Version & Development

If you want to make changes or simply run the most recent version follow these steps:

1. Clone repository
2. `npm i` to install dependencies (for dev only) (ℹ️ Skip if you don't plan on making changes.)
3. `npm run dev` to start a typescript file watcher (ℹ️ Skip if you don't plan on making changes.)
4. Go to `chrome://extensions`
    - Enable "Developer mode"
    - Click "Load unpackaged"
    - Select repository
5. Remember to hit the refresh button on the dev extension under chrome://extensions after making changes.
