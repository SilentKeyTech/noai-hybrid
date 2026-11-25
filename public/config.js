// Firebase web config. These values are public identifiers, not secrets: access is
// enforced by App Check and by the Firebase AI Logic API settings of the project.
// Leave apiKey empty to run on-device only (no cloud step).
export const firebaseConfig = {
  apiKey: 'AIzaSyDtCddkMEMd59f1DTXwcYz5zc4Zyto_xhE',
  authDomain: 'noai-hybrid.firebaseapp.com',
  projectId: 'noai-hybrid',
  storageBucket: 'noai-hybrid.firebasestorage.app',
  messagingSenderId: '812966207852',
  appId: '1:812966207852:web:84cb7576c95bc0c02d9349',
};

// App Check. On localhost a debug token is used (allowed by the contest rules);
// on the hosted demo, reCAPTCHA Enterprise with this site key.
export const appCheckSiteKey = '6Lej6TAuAAAAAE2CK9lo1MJHl21wPkiQHcYCyDpb';

// The cloud model. It only ever receives text in which private values are placeholders.
export const cloudModelName = 'gemini-flash-lite-latest';
