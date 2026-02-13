# ATS Drawer Nav Pack

## Files included
- `css/nav.css` drawer + button styling
- `js/nav.js` loads the nav partial and wires open/close behavior
- `partials/nav.html` the actual menu markup (edit the links here)
- `images/icons/hamburger-*.png` hamburger icon
- `images/icons/kebab-*.png` three-dots icon
- `favicon.ico` generated from your ATS logo image

## Add to every page (in <head>)
<link rel="icon" href="./favicon.ico">
<link rel="stylesheet" href="./css/nav.css">

## Add near the end of <body>
<script src="./js/nav.js"></script>

## Notes
- The nav is injected automatically at the top of <body>.
- Edit menu items in `partials/nav.html`.
- Links use `./page.html` to behave nicely on GitHub Pages.
