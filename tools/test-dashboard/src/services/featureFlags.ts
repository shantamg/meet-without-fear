// Phase 1A: web queueing is intentionally bot-only — POST /api/runs requires
// the BOT_WRITER_TOKEN, which the SPA does not have. Enabling this flag without
// also wiring user auth on the API would just produce 401s.
//
// Flip to true (via VITE_WEB_QUEUEING_ENABLED=true) once Phase 1B lands Clerk
// auth on the queue endpoint.
export const WEB_QUEUEING_ENABLED =
  import.meta.env.VITE_WEB_QUEUEING_ENABLED === 'true';

export const QUEUEING_DISABLED_MESSAGE =
  'Phase 1A: web-trigger is staged. The API rejects unauthenticated POSTs until Phase 1B wires user auth — for now queue runs via the EC2 writer script (scripts/ec2-bot/scripts/write-test-result.ts).';
