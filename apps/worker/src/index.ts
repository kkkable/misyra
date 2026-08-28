export function startWorker() {
  return { status: 'started' } as const;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  startWorker();
}
