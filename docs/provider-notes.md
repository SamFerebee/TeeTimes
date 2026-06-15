# Provider Notes

## Bergen County Golf

Status: parked for later.

The attempted Playwright connection flow opened the Bergen tee-time site, but the Cloudflare/human-verification page looped after the checkbox was selected. That suggests the automated browser fingerprint was not trusted enough for a durable session.

Better options to revisit:

- Use the normal browser first. Open Bergen in Chrome/Edge, pass verification, log in, and inspect DevTools Network while selecting course/date/player filters.
- If a clean JSON tee-time endpoint exists, add a dedicated Bergen provider that calls it directly.
- If the site only renders tee times in-page after login, build a small browser extension or bookmarklet that runs inside the already-verified normal browser session and posts visible tee-time data back to the local app.
- Keep server-side Playwright as a last resort only. It is likely to stay brittle against the verification page.

Useful Bergen URL:

- https://golfbergencounty.com/tee-times

## Galloping Hill / Union County

Status: switched from blocked EZLinks to GolfNow API.

Galloping Hill's own tee-time page links to three EZLinks access portals:

- Public 5-day access: https://unioncountygolf.ezlinksgolf.com/
- 7-day card access: https://unioncounty7day.ezlinksgolf.com/
- 14-day card access: https://unioncounty14day.ezlinksgolf.com/

All three EZLinks domains currently return a Cloudflare JavaScript/cookie challenge to backend requests.

However, Galloping Hill is also listed on GolfNow as facility `5095`, and GolfNow exposes tee-time inventory through:

- `POST https://www.golfnow.com/api/tee-times/tee-time-search-results`

Current app config uses:

- provider: `golfnow`
- facility id: `5095`
- latitude: `40.67886`
- longitude: `-74.28269`
- booking URL: https://www.golfnow.com/tee-times/facility/5095-galloping-hill-golf-course/search

This appears to expose public GolfNow inventory. It may not include 7-day or 14-day Union County cardholder-only inventory unless GolfNow exposes that through an authenticated customer token.
