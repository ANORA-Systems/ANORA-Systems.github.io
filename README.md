# anora-systems.com

The public website of ANORA Systems, served by GitHub Pages from `main`. Plain static HTML: no build step, no package manager. Pushing to `main` publishes the site.

## Self-hosted assets only

The site loads nothing from other servers. Fonts, icons and scripts ship in this repo:

| What | Where |
|---|---|
| Fonts (Inter, Outfit, Fira Code) | `assets/fonts/`, declared in `assets/fonts/fonts.css` |
| Icons (Font Awesome Free) | `assets/fontawesome/` |
| Tailwind (play script) | `assets/tailwind/` |
| Images, logos, favicons | `media/` |

Every page links `assets/tailwind/tailwindcss-play-3.4.17.js`, `assets/fontawesome/css/all.min.css` and `assets/fonts/fonts.css` (with `../` from `en/`). Never link a CDN such as Google Fonts, cdnjs, jsDelivr, unpkg, the Tailwind CDN or an icon API. A file loaded from another server sends every visitor's IP address to that provider, and the privacy policy (`datenschutz.html`, section B.2) says the site does not do this. New fonts or icons go into `assets/` with their licence file, and into the "Website" table on both open-source licence pages.

The one exception is the contact form and the call request, which send what the visitor typed to our own API at `api.anora-systems.com` when they submit it.

## Tests

**Run both suites after every change that could break something**: any change to a page, stylesheet, script, font, icon or image, and any move or rename of a file. Only pure text edits inside one page need no extra run while you work.

**They also run before every commit**, through the pre-commit hook in `.githooks/`. Enable it once per clone:

```bash
git config core.hooksPath .githooks
```

A failing test blocks the commit: fix the cause, never the test, unless the test itself is wrong. `git commit --no-verify` skips the hook; use it only for a failure you understand and that your commit does not touch, and say so in the commit message.

To run them by hand, from the repo root, with no dependencies to install:

```bash
python -m unittest discover -s _tests -v   # Python 3: self-hosted assets
node --test                                # Node 20+: call scheduler slots
```

| Test | Checks |
|---|---|
| `_tests/test_self_hosted_assets.py` | No page, stylesheet or script loads anything from another server, and every local file a page points at exists. |
| `_tests/call-slots.test.js` | The call scheduler (`js/call-slots.js`) offers only valid times: weekdays 9:00 to 16:30 Berlin time without lunch, no public holidays, next-day bookings until 17:30, at most six weeks ahead, correct across the clock changes and in the visitor's time zone. |

Folders starting with `_` are not published by GitHub Pages. The contact form and call request also have a manual check: after changing `js/contact-form.js`, `js/call-scheduler.js` or the contact pages, open `contact.html` and `en/contact.html`, open the scheduler, pick a time and step through the form. Sending only works from https://anora-systems.com, so a local copy always ends on the email fallback.
