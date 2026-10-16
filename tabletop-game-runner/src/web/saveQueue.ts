import { ApiError } from "./api";

export interface SaveStatus {
  /** Folder of the last successful save, relative to the project root. */
  dir: string | null;
  /** The last failure. It stays until every waiting event is saved. */
  error: string | null;
  /** Finished games saved so far. A change means the saved results changed. */
  gamesSaved: number;
}

const RETRY_MS = [500, 1000, 2000, 5000];

/**
 * Saves events one at a time, in order. A failed save stays first in the queue and is tried again after a short wait,
 * so a server restart loses no event. A 4xx answer comes back on every try, so that event is dropped.
 */
export class SaveQueue<E extends { type: string }> {
  private waiting: E[] = [];
  private running = false;
  private status: SaveStatus = { dir: null, error: null, gamesSaved: 0 };

  constructor(
    private readonly save: (event: E) => Promise<{ dir: string }>,
    private readonly onStatus: (status: SaveStatus) => void,
    private readonly retryMs = RETRY_MS,
    /** The event type that ends a game, or a puzzle attempt, for the `gamesSaved` count. */
    private readonly finishedType = "game",
  ) {}

  push(events: E[]): void {
    this.waiting.push(...events);
    if (!this.running && this.waiting.length) void this.run();
  }

  private async run(): Promise<void> {
    this.running = true;
    let failures = 0;
    while (this.waiting.length) {
      const event = this.waiting[0]!;
      try {
        const { dir } = await this.save(event);
        this.waiting.shift();
        failures = 0;
        const gamesSaved = this.status.gamesSaved + (event.type === this.finishedType ? 1 : 0);
        this.update({ dir, gamesSaved, error: this.waiting.length ? this.status.error : null });
      } catch (error) {
        this.update({ error: error instanceof Error ? error.message : String(error) });
        if (error instanceof ApiError && error.status < 500) {
          this.waiting.shift();
          continue;
        }
        await new Promise((resolve) => setTimeout(resolve, this.retryMs[Math.min(failures++, this.retryMs.length - 1)]));
      }
    }
    this.running = false;
  }

  private update(change: Partial<SaveStatus>): void {
    this.status = { ...this.status, ...change };
    this.onStatus(this.status);
  }
}
