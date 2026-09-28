import { createReadStream } from "node:fs";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";

/**
 * Files on local disk under PORTAL_UPLOAD_DIR. On the server that directory
 * is the portal_uploads Docker volume, so uploads survive rebuilds. Keys are
 * "<yyyy>/<mm>/<file id>" and never contain user input, so a key can't
 * escape the directory.
 */
export class LocalStorage {
  constructor(private readonly root: string) {}

  private resolve(key: string) {
    if (!/^\d{4}\/\d{2}\/[0-9a-f-]{36}$/.test(key)) throw new Error(`Bad storage key: ${key}`);
    return path.join(path.resolve(this.root), key);
  }

  async put(key: string, bytes: Buffer): Promise<void> {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    // Write then rename, so a crash never leaves half a file under the real name.
    const temp = `${target}.part`;
    await writeFile(temp, bytes);
    await rename(temp, target);
  }

  async open(key: string): Promise<{ stream: Readable; size: number } | null> {
    const target = this.resolve(key);
    try {
      const { size } = await stat(target);
      return { stream: createReadStream(target), size };
    } catch {
      return null;
    }
  }

  async remove(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }
}

export function storageKeyFor(id: string, at = new Date()) {
  return `${at.getUTCFullYear()}/${String(at.getUTCMonth() + 1).padStart(2, "0")}/${id}`;
}
