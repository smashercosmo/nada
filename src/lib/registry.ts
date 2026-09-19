/**
 * Quick existence check against the npm registry, so a typo in a package
 * name surfaces as a friendly re-prompt instead of a `pnpm add` stack trace.
 */
export async function packageExistsOnRegistry(name: string): Promise<boolean> {
  // Scoped packages (@scope/name) need the slash percent-encoded; the
  // leading "@" is left as-is since registry.npmjs.org expects it literally.
  const urlPath = name.startsWith("@") ? name.replace("/", "%2f") : name;
  const url = `https://registry.npmjs.org/${urlPath}`;
  try {
    const res = await fetch(url, { method: "HEAD" });
    if (res.status === 200) return true;
    if (res.status === 404) return false;
    // HEAD isn't supported by every path (scoped packages in particular);
    // fall back to GET before giving up.
    const fallback = await fetch(url, { method: "GET" });
    return fallback.status === 200;
  } catch {
    // Network hiccup: don't block the user on a check that's advisory only.
    return true;
  }
}
