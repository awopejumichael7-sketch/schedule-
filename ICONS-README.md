# Icons

This folder needs four PNG files for the PWA manifest and service worker
to work exactly as configured:

- `icon-192.png` (192×192)
- `icon-512.png` (512×512)
- `icon-maskable-192.png` (192×192, with safe-zone padding for maskable icons)
- `icon-maskable-512.png` (512×512, with safe-zone padding for maskable icons)

These are binary image assets, so they aren't generated as part of this
codebase — drop in your own logo/branding here. Two free, no-signup ways
to produce all four sizes correctly (including the maskable safe zone) from
a single source image:

1. https://realfavicongenerator.net (also generates favicons)
2. https://maskable.app/editor — specifically for getting the maskable
   safe-zone padding right so Android doesn't crop your icon oddly

Until real files are added, the app still runs fine — browsers simply fall
back to a generic icon, and the "Add to Home Screen" prompt still works.
