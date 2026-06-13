import FingerprintJS from "@fingerprintjs/fingerprintjs";

// Отпечаток считается один раз и кешируется на время сессии.
let cached = null;
let loadingPromise = null;

export async function getFingerprint() {
  if (cached) return cached;
  if (!loadingPromise) {
    loadingPromise = FingerprintJS.load()
      .then((fp) => fp.get())
      .then((result) => {
        cached = result.visitorId;
        return cached;
      })
      .catch(() => null);
  }
  return loadingPromise;
}
