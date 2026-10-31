# Devpost submission: On Approval

- **Hackathon:** YouCam API Skin AI & eCommerce VTO Hackathon (Devpost)
- **Deadline:** Nov 2, 2026, 11:45 am EST = **16:45 UTC** (17:45 in Gabon). Submit by 12:00 UTC.
- **Topic:** eCommerce VTO
- **API used:** YouCam AI Clothes (virtual try-on), v4, with the File API
- **Required:** public repo with licence + setup steps, text description, screenshots, 1–3 min demo video on YouTube showing it running on the device it was built for (phone), explaining the YouCam API used. No unlicensed music.

## Tagline
Try it on with YouCam, take it home on approval, keep what fits.

## Description (paste, then edit in your own words)
On Approval brings back the mail-order house's oldest promise, goods sent on approval, and puts a fitting room in front of it. A shopper fills a four-number measure card once, and every item shows the size that fits them and how sure that is. They add one photo and YouCam's AI Clothes try-on shows them wearing the piece next to the product photo. The parcel goes out on approval: nothing is charged until they mark each piece keep or send back. The shop's ledger then counts what really happened, the return rate for pieces tried on with YouCam against pieces that were not, high fit confidence against low, and the reasons things came back, so a merchant can see whether try-on is paying for itself.

## How we built it / challenges / what we learned / what's next
Written by Rav3n in his own words. Facts available:
- Node 20+, zero dependencies; vanilla HTML/CSS/JS front end; JSON-file store.
- YouCam flow: File API (`/s2s/v2.0/file/cloth-v4`) for both photos → `POST /s2s/v2.0/task/cloth-v4` with `garment_category` per item and `filter_multi_person: normal` → poll the task → copy the result locally because result links expire after 2 hours.
- Fit scoring in `src/fit.mjs`, 6 unit tests; return risk is labelled an estimate and starts from the shop's own return rate.
- Ledger rates are counted only from decided lines.
- Mock mode lets the whole flow run without a key.

## Screenshots to upload
1. Catalogue with measure card filled (fit chips on each tile)
2. Item sheet: product photo next to the YouCam try-on, sizes scored
3. Parcel with fit, try-on status and chance of return
4. Approval slip with keep / return
5. Ledger: tried on vs not tried on

## Demo video script (about 2:15, record on the phone)
1. **0:00–0:15** "Online fashion sends you a parcel but no fitting room, so people buy two sizes and return one. On Approval puts the fitting room back, using the YouCam API."
2. **0:15–0:35** Catalogue: type chest, waist, hips, inseam. Point at the chips: "Every item now shows my size and how sure it is."
3. **0:35–1:10** Open the shirt. Show the sizes scored ("S is 4 cm tight at the chest"). Add photo, tap Try it on. "This is YouCam's AI Clothes API, the cloth-v4 virtual try-on. My photo and the product photo go up through YouCam's File API, and here I am wearing it." Tap Looks right.
4. **1:10–1:30** Add trousers without trying on. Open Parcel: "Each piece shows its fit and its chance of coming back. Nothing is charged." Send on approval.
5. **1:30–1:50** My approvals: keep the shirt, return the trousers as too small.
6. **1:50–2:15** Ledger: "For the shop: returns on pieces tried on with YouCam against pieces that weren't, and why things came back. That's how a merchant knows if try-on pays for itself." End on the masthead.

## Before submitting
- [ ] YouCam key set on Railway, try-on works live on the phone (mode chip says "YouCam try-on live")
- [ ] Real product photos uploaded for at least two items (better try-ons than the illustrated samples)
- [ ] README placeholders replaced: Railway URL, YouTube link
- [ ] Repo public on GitHub, licence visible
- [ ] Video public on YouTube, 1–3 min, no copyrighted music
