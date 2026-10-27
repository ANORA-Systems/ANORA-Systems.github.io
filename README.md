# anora-systems.com

The public website of ANORA Systems. A small Python script (standard library only) builds it into plain HTML and CSS; GitHub Actions builds `main` and publishes it with GitHub Pages. There is no Node, no npm and no framework.

## Build and preview

```bash
python _tools/serve.py        # builds, serves http://localhost:8000, rebuilds on every change
python _build/build.py        # only builds, into _site/
```

The first build downloads Tailwind's standalone CLI (version and SHA-256 pinned in `_build/build.py`) into `_build/bin/`. `_site/` and `_build/bin/` are not committed.

## How a page is made

Every `*.html` in the repo root (German) and in `en/` (English) is a page source: a front matter block, an optional `<head>` block with tags only this page needs, then the page body.

```html
---
title: Impressum | Anora Systems
description: Optional meta description.
nav: full          (full: the site menu; none: no menu)
footer: yes
---
<main>...</main>
```

The build wraps it in `_build/layouts/page.html`. That layout adds the shared `<head>` (canonical URL, `hreflang` alternates, link preview tags, favicons, stylesheets), the menu and the footer, whose text comes from `_build/pages.py` in both languages. Change the menu or footer there once, not in every page.

The link preview image of each language (`media/social-share-de.png`, `media/social-share-en.png`) is drawn by `python _tools/make_share_images.py`; run it again after changing the homepage headline.

An icon is written as `<i data-lucide="check" class="h-4 w-4"></i>`; the build replaces it with the SVG from `assets/lucide/`.

The example search (`js/example-box.js`) is a search form over the results in `demo/examples.json`, which are in the API's response shape; the site never calls the API. Product name, brand and category are separate searchable dropdowns of the available examples, and results appear after "Search" and a short pause with a spinner. On the homepage the search sits in the dark hero card, which expands to show the result; the Re-commerce page has a light box. The API excerpt on the homepage is built from the same file. The examples are recorded results of the October 2026 benchmark runs (42 products in 16 categories), taken unchanged from the stored search records.

`_build/pages.py` also lists every page with its counterpart in the other language. The build stops on a page that is missing there, and it writes `sitemap.xml` from that list, with each page's `lastmod` taken from its last commit.

## Self-hosted assets only

The site loads nothing from other servers. Fonts, icons and styles ship with it:

| What | Where |
|---|---|
| Fonts (Inter, Outfit, Fira Code) | `assets/fonts/`, declared in `assets/fonts/fonts.css` |
| Icons (Lucide, the apps' set; Font Awesome Free on pages not yet redesigned) | `assets/lucide/` (inlined by the build, see its README), `assets/fontawesome/` |
| Styles (Tailwind CSS 3.4.17) | compiled by the build into `assets/css/site.css`; config in `_build/tailwind.config.js` |
| Images, logos, favicons | `media/` |

The layout links all three stylesheets on every page. Never link a CDN such as Google Fonts, cdnjs, jsDelivr, unpkg, the Tailwind CDN or an icon API. A file loaded from another server sends every visitor's IP address to that provider, and the privacy policy (`datenschutz.html`, section B.2) says the site does not do this. New fonts or icons go into `assets/` with their licence file, and into the "Website" table on both open-source licence pages.

The one exception is the contact form and the call request, which send what the visitor typed to our own API at `api.anora-systems.com` when they submit it.

## Clean URLs

Pages are files like `contact.html`, but every URL we write leaves out the extension: `https://anora-systems.com/contact`, `en/privacy`. GitHub Pages serves `contact.html` at both addresses. Links, `<link rel="canonical">`, `hreflang` alternates and `sitemap.xml` all use the clean form; a homepage is its folder (`./`, `../`, `en/`, never `index.html`). A link to `contact.html` would still work, but it shows the extension in the address bar and Google reports the page as a duplicate. `python _tools/serve.py` resolves clean URLs the way GitHub Pages does.

## Tests

**Run both suites after every change that could break something**: any change to a page, layout, stylesheet, script, font, icon or image, and any move or rename of a file. Only pure text edits inside one page need no extra run while you work.

**They also run before every commit**, through the pre-commit hook in `.githooks/`. Enable it once per clone:

```bash
git config core.hooksPath .githooks
```

A failing test blocks the commit: fix the cause, never the test, unless the test itself is wrong. `git commit --no-verify` skips the hook; use it only for a failure you understand and that your commit does not touch, and say so in the commit message.

To run them by hand, from the repo root, with no dependencies to install:

```bash
python -m unittest discover -s _tests -v   # Python 3.9+: builds the site, then checks it
node --test                                # Node 20+: call scheduler slots
```

| Test | Checks |
|---|---|
| `_tests/test_build.py` | The templates render as intended; the example data has the shape the example box reads; every built page is its own canonical URL, German and English pages point at each other, and the sitemap lists every indexed page and no archived one. |
| `_tests/test_self_hosted_assets.py` | No built page, stylesheet or script loads anything from another server, and every local file a page points at exists. |
| `_tests/test_clean_urls.py` | Links between our pages, canonical and `hreflang` URLs and the sitemap use clean URLs without `.html`, and each one points at a page that exists. |
| `_tests/call-slots.test.js` | The call scheduler (`js/call-slots.js`) offers only valid times: weekdays 9:00 to 16:30 Berlin time without lunch, no public holidays, next-day bookings until 17:30, at most six weeks ahead, correct across the clock changes and in the visitor's time zone. |

The Python tests build the site into a temporary folder (`_tests/site_build.py`), so they always check what would be published. Folders starting with `_` are never published. The contact form and call request also have a manual check: after changing `js/contact-form.js`, `js/call-scheduler.js` or the contact pages, open `/contact` and `/en/contact` in the preview server, open the scheduler, pick a time and step through the form. Sending only works from https://anora-systems.com, so a local copy always ends on the email fallback.

## Publishing

`.github/workflows/deploy-pages.yml` runs the tests, builds and deploys on every push to `main`. It needs Pages > Build and deployment > Source set to "GitHub Actions" in the repo settings, and that switch must happen before the build reaches `main`; in "Deploy from a branch" mode Pages would publish the page sources as they are.
