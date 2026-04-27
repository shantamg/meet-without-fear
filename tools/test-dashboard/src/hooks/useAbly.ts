import { useEffect, useRef } from 'react';
import Ably from 'ably';

// WARNING: VITE_ABLY_KEY exposes the Ably API key in the client bundle.
// In production, swap to token auth via a backend endpoint (see
// tools/status-dashboard/src/hooks/useAblyConnection.ts for the pattern).
// Only set VITE_ABLY_KEY for local development.
const ablyKey = import.meta.env.VITE_ABLY_KEY as string | undefined;

const TEST_RUNS_CHANNEL = 'test-runs:updates';

export type TestRunsEvent = {
  type: 'run.queued' | 'run.started' | 'run.updated' | 'run.finished';
  run_id?: string;
  [key: string]: unknown;
};

type Callback = (event: TestRunsEvent) => void;

/**
 * Subscribe to the `test-runs:updates` Ably channel.
 * No-op if VITE_ABLY_KEY is not set — UI still works, it just won't get
 * realtime nudges. Callers can fall back to manual refresh.
 */
export function useTestRunsChannel(onMessage: Callback): void {
  const cbRef = useRef(onMessage);
  cbRef.current = onMessage;

  useEffect(() => {
    if (!ablyKey) {
      // eslint-disable-next-line no-console
      console.info(
        '[useTestRunsChannel] VITE_ABLY_KEY not set — live updates disabled.'
      );
      return;
    }

    const client = new Ably.Realtime({ key: ablyKey });
    const channel = client.channels.get(TEST_RUNS_CHANNEL);

    const handler = (msg: Ably.Message) => {
      const data = msg.data as TestRunsEvent | undefined;
      if (!data) return;
      cbRef.current(data);
    };

    channel.subscribe(handler);

    return () => {
      channel.unsubscribe(handler);
      client.close();
    };
  }, []);
}
