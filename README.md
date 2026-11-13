# Broken Link Checker: find 404s and dead images on a site

Give it a start address and a page limit. It crawls the site's own pages, checks every link and image address it finds once, and returns one row for each broken link or image, with the page it is on, the address, the status or error, and the link text.

## How it works
- Crawls pages on the same site as the start address, up to the page limit (default 50, maximum 500).
- Checks each link and image address once: a HEAD request first, and a GET request when the server answers 405.
- A link counts as broken when the answer is a status of 400 or higher, or when there is no answer at all (timeout, domain not found, connection refused).
- Skips `mailto:`, `tel:`, `javascript:` and `#` anchors.
- The run log ends with a summary line, for example: `SUMMARY: 1 broken links or images found (1 unique addresses) on 30 pages checked; 179 addresses tested.`

## Input
| Field | Meaning |
|---|---|
| `startUrl` | The address to start from, for example `https://www.example.com` |
| `maxPages` | Pages to crawl, 1 to 500, default 50 |

## Output
One dataset row per broken link or image occurrence: `page`, `link`, `kind` (link or image), `status`, `error`, `linkText`.

Example from a real run on `https://www.myclawn.com` with `maxPages` 30 (30 pages crawled, 179 addresses tested):
```json
{
  "page": "https://www.myclawn.com/support",
  "link": "https://reportaproblem.apple.com/",
  "kind": "link",
  "status": 403,
  "error": null,
  "linkText": "reportaproblem.apple.com"
}
```
The status 403 here means the other site refused the automated check; open such a link by hand to confirm it.

## Run it locally
Needs Node.js 18 or newer.
```bash
git clone https://github.com/20vision/broken-link-checker.git
cd broken-link-checker
npm install
mkdir -p storage/key_value_stores/default
echo '{"startUrl":"https://www.example.com","maxPages":30}' > storage/key_value_stores/default/INPUT.json
npm start
```
Rows are written to `storage/datasets/default/`. The summary line is printed at the end of the run.

## Run it on Apify
The actor is public: https://apify.com/20vision/broken-link-checker. To deploy your own copy: `npm install -g apify-cli`, `apify login`, `apify push`.

## Limits
- Only pages that are served as HTML are read; pages that need JavaScript to show their links are not.
- Pages behind a login are not reached.
- External addresses are checked, but not crawled.
- Some sites answer automated requests with 403 or 429 although the page works in a browser.
- Cloudflare email-protection links are skipped, because a browser decodes them into mail links.

## License
MIT, see `LICENSE`.

---
Need the same job behind a login, or with several steps? MyClawn gives an agent its own cloud computer: https://www.myclawn.com/check-my-website-for-broken-links?utm_source=github&utm_medium=repo&utm_campaign=broken-link-checker
