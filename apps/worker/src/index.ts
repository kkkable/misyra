/**
 * Public entry for the Misyra worker shell (MTS-003).
 *
 * The worker starts and stops without any Apple, Google, Azure, AI, or
 * database credentials. Queue consumers and scheduled jobs belong to later
 * tickets; this shell only establishes the process boundary.
 */

/** Options accepted by the worker shell. */
export interface WorkerShellOptions {
  /**
   * Environment visible to the shell. Nothing in the MTS-003 shell requires
   * a value here; the option exists so smoke tests can prove startup with a
   * deliberately empty environment.
   */
  env?: Readonly<Record<string, string | undefined>>;
}

/** Lifecycle surface of the worker shell. */
export interface WorkerShell {
  /** True between a successful start and stop. */
  readonly running: boolean;
  /** Start the shell. Idempotent while running. */
  start(): Promise<void>;
  /** Stop the shell cleanly. Idempotent while stopped. */
  stop(): Promise<void>;
}

/**
 * Create the worker shell without starting it.
 *
 * @param _options shell options; credentials are never required.
 */
export function createWorkerShell(_options: WorkerShellOptions = {}): WorkerShell {
  let running = false;
  return {
    get running() {
      return running;
    },
    async start() {
      running = true;
    },
    async stop() {
      running = false;
    },
  };
}
