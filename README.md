# NOAI Hybrid

**It delivers what it cannot see.** The AI writes the answer. NOAI hides the names before they leave your machine and puts them back when the answer returns.

NOAI Hybrid routes AI work **by sensitivity, not by capability**. Gemini Nano does the private reading on your device. The cloud Gemini model does the heavy writing, but it only ever receives placeholders such as `[PERSON_1]` and `[IBAN_1]`. The real values are put back on the device when the answer arrives.

Built for #BuildHybridAI 2026 with **Firebase AI Logic hybrid inference** (Web / Chrome).

## The problem

People paste HR complaints, patient referrals and contracts into AI chat every day. The text carries names, phone numbers, national IDs, IBANs and file references. Companies either ban AI and lose the productivity, or allow it and leak personal data. Rules-only redaction misses what does not look like a pattern: "Grace from HR", "Lina from payroll".

## How it works

| Step | Where | Firebase AI Logic |
|---|---|---|
| 1. Rules hide structured identifiers and known names: emails, phones, IBANs, cards, Saudi ID and Iqama numbers, dates of birth, companies with a legal suffix, file references, names in English and Arabic | Device | none |
| 2. Gemini Nano reads what is left and finds the names and organisations the rules missed. Every item it returns must be quoted from the text or it is ignored | Device | `getGenerativeModel(ai, { mode: InferenceMode.ONLY_ON_DEVICE, onDeviceParams: { promptOptions: { responseConstraint } } })` |
| 3. Leak gate: the outgoing text is checked for every hidden value; one hit blocks the send | Device | none |
| 4. The cloud model writes the reply, summary or obligations checklist on placeholders only. Offline, or with "Keep everything on this device", the same call runs on Gemini Nano | Cloud, falls back to device | `mode: InferenceMode.PREFER_IN_CLOUD`, `generateContent`, `response.inferenceSource` shown on screen |
| 5. Placeholders are swapped back to the real values | Device | none |

The owner sees every hidden value as a chip and can click one to send it as is. The screen shows how many values stayed on the device, how many bytes left, the SHA-256 of exactly what was sent, and whether the answer was written in the cloud or on the device.

## Run it

Requirements: Chrome 138 or later on a desktop that supports Gemini Nano (Prompt API). Node 22.13 or later.

```
npm install
npm run build      # turns the NOAI redactor (TypeScript) into browser JavaScript
npm start          # http://127.0.0.1:7810/
```

Without a Firebase config the app runs **on-device only**: Gemini Nano both finds the private details and writes the answer. To add the cloud step, create a Firebase project, enable Firebase AI Logic with the Gemini Developer API, register a web app, turn on App Check (reCAPTCHA Enterprise; on localhost a debug token is used), and fill in `public/config.js`.

## What was built during the contest period (11 to 30 Nov 2026)

New in this repository: the whole web app (`public/app.js`, `index.html`, `style.css`, `samples.js`), the Gemini Nano finder with a JSON response constraint and quote check, the leak gate, the hybrid writer with cloud-to-device fallback and the on-screen inference source, the reference-number and title rules, and the build that strips TypeScript types for the browser.

## Pre-existing code (disclosed)

`vendor-src/redact.ts` and `vendor-src/names.ts` are the on-device redactor from NOAI by Silent Key Technologies (first published in SilentKeyTech/noai), written before the contest. Silent Key owns them and licenses this copy under AGPL-3.0 with the rest of this repo. One change was made during the contest: words such as "between" and "with" are no longer read as the start of a company name. `npm run build` turns them into `public/lib/*.js`.

## Limits

- Gemini Nano must be available in the browser; where it is not, only the rules run and the screen says so.
- Over-hiding happens (a site name can be read as a person). The owner can un-hide any chip.
- Medicines are hidden by default; un-hide them when the task needs them.

## Licence

AGPL-3.0, see `LICENSE`. If you want to use this code in a product or service without publishing your own source, a commercial licence is available from Silent Key Technologies. All names, numbers and companies in the samples are invented.
