import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export class ArtifactManager {
  constructor(rootDir) {
    this.rootDir = rootDir;
  }

  async ensureSessionDir(sessionId) {
    const sessionDir = join(this.rootDir, sessionId);
    await mkdir(sessionDir, { recursive: true });
    return sessionDir;
  }

  async nextPath(sessionId, prefix, extension) {
    const sessionDir = await this.ensureSessionDir(sessionId);
    return join(sessionDir, `${prefix}-${timestamp()}.${extension}`);
  }

  async writeText(sessionId, prefix, extension, contents) {
    const filePath = await this.nextPath(sessionId, prefix, extension);
    await writeFile(filePath, contents, 'utf8');
    return filePath;
  }
}
