# RingBeat — replace ALL files at repo root

GitHub repo: files must sit next to each other (no `docs/`, no `css/`, no `js/`, no `img/` folders).

1. Delete every file currently in https://github.com/f99-tech/box (root).
2. Upload EVERY file from this ZIP into the repo **root**.
3. Settings → Pages → Deploy from a branch → `main` → **`/` (root)**  (not `/docs`).
4. Hard refresh: Ctrl+Shift+R → https://f99-tech.github.io/box/

index.html must load `app.css` and `app.js` (not `css/app.css` / `js/app.js`).
