# On Approval

**Try it on with YouCam. Take it home on approval. Keep what fits.**

A century ago, mail-order houses sent goods "on approval": the parcel arrived, you tried things on at home, kept what fitted and sent the rest back. Online fashion rebuilt the parcel but lost the fitting room, so shoppers now buy two sizes and return one. On Approval puts the fitting room back in front of the parcel:

1. **Try it on** with the YouCam AI Clothes virtual try-on: one photo of you, the shop's product photo, and you see yourself wearing it.
2. **Pick the size from your own numbers.** A four-number measure card (chest, waist, hips, inseam) is scored against each item's size chart, size by size, with the reason a size misses ("chest 4 cm tight").
3. **Take it home on approval.** Nothing is charged; the parcel is held for a set window. Mark each piece *keep* or *send back* with a reason.
4. **The shop's ledger** counts what really happened: the return rate for pieces tried on with YouCam against pieces that were not, high fit confidence against low, and why things came back.

Built solo by Rav3n for the **YouCam API Skin AI & eCommerce VTO Hackathon** (eCommerce VTO topic).

- **Live demo:** `<Railway URL>`
- **Demo video:** `<YouTube link>`

## Try it: do X, see Y

Requires Node 20 or newer. No dependencies.

```bash
git clone <this repo> && cd on-approval
npm test                          # see: 6 passing (fit and return-risk rules)
YOUCAM_API_KEY=<your key> npm start
# open http://localhost:8080
```

| Do | See |
| --- | --- |
| Fill in the measure card on the Catalogue page | every tile shows its best size and a fit-confidence chip |
| Open an item | each size scored, with what misses and by how much |
| Add your photo, tap **Try it on** | YouCam returns you wearing the item, next to the product photo |
| Tap **Looks right** or **Looks off** | the piece goes in your parcel with that verdict |
| Open **Parcel** | each piece's fit, try-on status and estimated chance of coming back |
| **Send it on approval** | an approval slip with the decide-by date; nothing is charged |
| In **My approvals**, tap **Keep it** or **Return: too small** | the line is settled |
| Open **Ledger** | real return rates: tried on vs not, high vs low fit, and the reasons |

Without `YOUCAM_API_KEY` the app runs in demo mode: the try-on returns your own photo after a short pause and is labelled "Mock". Everything else works the same.

## How the YouCam API is used

`src/youcam.mjs`, server-side only (the key never reaches the browser):

1. **File API** `POST /s2s/v2.0/file/cloth-v4` for the shopper's photo and the product photo → upload URL + `file_id` for each; the bytes are `PUT` to the upload URL.
2. **AI Clothes** `POST /s2s/v2.0/task/cloth-v4` with `src_file_id`, `ref_file_id`, `garment_category` (from the item: `upper_body`, `lower_body`, `full_body`, `outer`, `shoes` or `auto`) and `filter_multi_person: "normal"`.
3. **Poll** `GET /s2s/v2.0/task/cloth-v4/{task_id}` until `success`, then download the result and keep our own copy, because YouCam result links expire after two hours and the approval slip has to show the try-on for the whole window.

## The numbers, and where they come from

- **Fit score per size** (`src/fit.mjs`): for each measurement on the card, how far it sits outside that size's range, as a share of the range width; inside the range costs a little for sitting at the edge. Confidence drops when two sizes are nearly tied (you are between sizes) and when fewer measurements are given.
- **Chance it comes back** is an *estimate* and is labelled so. It starts from the shop's own usual return rate (set in Ledger → Shop settings, default 25%), is pulled down by fit confidence and a "looks right" try-on, and pushed up by a "looks off" vote.
- **Ledger rates** are counts of decided lines only. With no decisions there is no rate, just a dash.

## Merchants

Ledger → *Add an item*: name, price, garment type and a product photo (flat lay or on a hanger, plain background). The catalogue ships with six sample garments. Set `RESEED_ITEMS=1` once (then remove it) to replace a deployed catalogue with `seed/store.json` without losing parcels.

## Deploy (Railway)

New project from this repo, set `YOUCAM_API_KEY`, and attach a volume mounted at `/data` with `DATA_DIR=/data` so parcels and photos survive redeploys. Start command: `npm start`.

## Privacy

The shopper's photo goes to YouCam for the try-on and is stored with the parcel on the shop's server so the approval slip can show it. The measure card stays in the browser (local storage) and is copied onto the parcel only when it is sent.

## Layout

```
src/server.mjs   HTTP server, routes, store (JSON file)
src/youcam.mjs   YouCam File API + AI Clothes v4 client
src/fit.mjs      size scoring and return-risk estimate
public/          the shop (vanilla HTML, CSS, JS)
seed/store.json  sample catalogue and size charts
test/            fit and risk rules
```

MIT © 2026 Rav3n
