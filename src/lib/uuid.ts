export const uuid = (): string =>
  (crypto as Crypto & { randomUUID?: () => string }).randomUUID?.() ||
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (crypto.getRandomValues(new Uint8Array(1))[0] & 15);
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
