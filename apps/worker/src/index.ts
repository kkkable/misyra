import { pathToFileURL } from 'node:url';

export function startWorker() {
  return { status: 'started' } as const;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startWorker();
}
