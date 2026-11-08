# Lucide icons

SVGs from [lucide-static](https://www.npmjs.com/package/lucide-static) 1.49.0 (ISC licence, `LICENSE.txt`), the icon set the SpecScout apps use. Only the icons the site uses are here.

A page writes `<i data-lucide="check" class="w-4 h-4 text-anoraTeal"></i>`; the build (`_build/build.py`, `inline_icons`) replaces it with the inline SVG, 1em in size unless the classes say otherwise. To add an icon, copy its file from `icons/` in the same release:

```bash
curl -sSfL -o lucide.tgz https://registry.npmjs.org/lucide-static/-/lucide-static-1.49.0.tgz
tar -xzf lucide.tgz package/icons/<name>.svg
```

Upgrading the release means replacing every file here and `LICENSE.txt`, and the version in this file, the build's docstring and the "Website" table on both open-source licence pages.
