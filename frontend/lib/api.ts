const PORT = 8000;

export type Health = {
  name: string;
  version: string;
};

export type EnvPatch = {
  key: string;
  value: unknown;
};

function url(host: string, path: string) {
  return `http://${host}:${PORT}${path}`;
}

export async function getHealth(host: string): Promise<Health> {
  const res = await fetch(url(host, "/health"));
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json();
}

export async function getEnv(host: string): Promise<Record<string, unknown>> {
  const res = await fetch(url(host, "/env"));
  if (!res.ok) throw new Error(`GET /env failed: ${res.status}`);
  return res.json();
}

export async function patchEnv(host: string, patch: EnvPatch): Promise<void> {
  const res = await fetch(url(host, "/env"), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`PATCH /env failed: ${res.status}`);
}

export async function patchEnvBulk(
  host: string,
  patches: EnvPatch[],
): Promise<void> {
  for (const p of patches) {
    await patchEnv(host, p);
  }
}

export function getByPath(env: Record<string, unknown>, key: string): unknown {
  const parts = key.split(".");
  let current: unknown = env;
  for (const part of parts) {
    if (current && typeof current === "object" && part in (current as object)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}
