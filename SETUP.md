# Asset Tracker – setup (you only host it; nobody else installs anything)

## 1. Host the folder (free, ~5 minutes) – pick ONE
**Netlify Drop (easiest, no account tricks):** go to app.netlify.com/drop, drag this whole unzipped folder onto the page. You get a link like `https://something.netlify.app`.
**GitHub Pages:** new repo -> upload all files -> Settings > Pages > Deploy from branch `main` / root. Link: `https://<you>.github.io/<repo>/`.
**Cloudflare Pages:** Workers & Pages > Create > Pages > Upload assets > drop the folder.
It MUST be https (all three are) – the camera won't work otherwise.

## 2. (Recommended) Make the data live from your Google Sheet
Do this so everyone sees changes you make in the sheet, with no re-hosting.
1. In your sheet: File > Share > **Publish to web**. Choose the **Asset** sheet and **CSV**, click Publish, copy the link.
2. Open `config.js`, paste it between the quotes of `SHEET_CSV_URL`, save, re-upload/re-deploy that one file.
3. Keep the header names: Asset Number, Item Name, Description, Category, Status, Designated Owner, Picture.
4. Picture column: put a normal image link (https://...). A Google Drive "anyone with the link" file link also works. (Your current Picture column shows #VALUE!, so photos show placeholder icons until you fill it.)
Published sheets refresh on Google's side every few minutes. The app reloads data on open and on the refresh button.

## 3. Put QR codes on the assets
Each QR contains just the asset number (same as your sheet's QR column). Open `labels.html` on your hosted site (or print your sheet's QR column) – print, cut, stick on each item. For new assets, use the sheet's QR column.

## 4. Share
Send everyone the link (or a QR of the link). They open it in Chrome (Android) / Safari (iPhone), tap **Scan > Start scanning**, allow the camera. Installing is optional:
- Android: banner "Install" (or menu > Install app)
- iPhone: Share > Add to Home Screen

## 5. Updating later
Sheet mode: just edit the sheet. Code/config change: re-upload the changed files; phones pick it up next time they open the app online.

## Notes
- Everyone is view-only by default (`EDITABLE:false`). Set `true` only for personal use – edits then stay on that one phone, not shared. Shared edits need a real backend/database.
- iPhone Safari has no built-in QR reader API, so the first scan downloads a small library (jsQR) and caches it; after that it works offline. If it's blocked, "Scan from photo" and typing the number still work.
