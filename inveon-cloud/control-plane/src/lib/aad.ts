/**
 * Associated data for envelope-encrypted app credentials: a ciphertext only
 * decrypts for the app (and purpose) it was written for.
 */
export const registryAad = (appId: string) => `registry:${appId}`;
export const deployKeyAad = (appId: string) => `deploy-key:${appId}`;
export const webhookAad = (appId: string) => `webhook:${appId}`;
