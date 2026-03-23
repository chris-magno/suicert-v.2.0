"use client";

import { signOut as clientSignOut } from "next-auth/react";

function clearZkloginEphemeralState() {
  function clearStore(store: Storage) {
    const keysToRemove: string[] = [];
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (key && key.startsWith("zklogin:flow:")) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      store.removeItem(key);
    }
  }

  try {
    clearStore(sessionStorage);
    clearStore(localStorage);
  } catch {
    // Best-effort cleanup.
  }
}

async function clearWalletSessionCookie() {
  try {
    await fetch("/api/wallet/session", {
      method: "DELETE",
      credentials: "include",
      cache: "no-store",
      keepalive: true,
    });
  } catch {
    // Best-effort cleanup.
  }
}

export async function performFullLogout(callbackUrl = "/") {
  window.dispatchEvent(new CustomEvent("suicert:wallet-auth-cleared"));
  clearZkloginEphemeralState();
  await clearWalletSessionCookie();
  window.dispatchEvent(new CustomEvent("suicert:wallet-auth-cleared"));
  await clientSignOut({ callbackUrl });
}
