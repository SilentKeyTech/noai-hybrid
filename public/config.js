// Firebase web config. These values are public identifiers, not secrets: access is
// enforced by App Check and by the Firebase AI Logic API settings of the project.
// Leave apiKey empty to run on-device only (no cloud step).
export const firebaseConfig = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};

// App Check. On localhost a debug token is used (allowed by the contest rules);
// on the hosted demo, reCAPTCHA Enterprise with this site key.
export const appCheckSiteKey = '';

// The cloud model. It only ever receives text in which private values are placeholders.
export const cloudModelName = 'gemini-2.5-flash';
