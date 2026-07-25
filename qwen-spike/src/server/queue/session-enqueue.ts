import "server-only";
import { deleteSession } from "../sessions/session-store";

type EnqueueTarget = {
  enqueue(job: { id: string; run: () => Promise<void> }): number;
};

export async function enqueueSessionOrRollback(
  queue: EnqueueTarget,
  id: string,
  run: () => Promise<void>,
): Promise<number> {
  try {
    return queue.enqueue({ id, run });
  } catch (error) {
    await deleteSession(id);
    throw error;
  }
}
