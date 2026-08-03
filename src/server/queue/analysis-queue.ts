import "server-only";
import { env } from "../config/env";
import { updateSession } from "../sessions/session-store";

type Job = { id: string; run: () => Promise<void> };
class AnalysisQueue {
  private active = false;
  private pending: Job[] = [];

  enqueue(job: Job): number {
    if (this.pending.length >= env.maxQueued) throw new Error("The analysis queue is full. Please try again shortly.");
    this.pending.push(job);
    const position = this.pending.length + (this.active ? 1 : 0);
    void this.refreshPositions();
    void this.drain();
    return position;
  }

  private async refreshPositions(): Promise<void> {
    await Promise.all(this.pending.map((job, index) => updateSession(job.id, { queuePosition: index + (this.active ? 1 : 0), message: "Waiting for the previous analysis to finish" })));
  }

  private async drain(): Promise<void> {
    if (this.active) return;
    const job = this.pending.shift();
    if (!job) return;
    this.active = true;
    await this.refreshPositions();
    try { await job.run(); }
    finally { this.active = false; void this.drain(); }
  }

  state(): { active: boolean; queued: number } { return { active: this.active, queued: this.pending.length }; }
}

const globalQueue = globalThis as typeof globalThis & { __analysisQueue?: AnalysisQueue };
export const analysisQueue = globalQueue.__analysisQueue ??= new AnalysisQueue();
