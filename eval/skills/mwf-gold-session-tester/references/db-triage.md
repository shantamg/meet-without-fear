# DB Triage

MWF uses Prisma with Postgres. The local backend env is usually `backend/.env`. Run DB checks from the backend workspace.

## Safe Query Pattern

Use `npx tsx` and load dotenv. Avoid printing raw secrets.

```bash
cd backend
npx tsx -e 'import "dotenv/config"; import { PrismaClient } from "@prisma/client"; (async()=>{ const prisma = new PrismaClient(); /* query */ await prisma.$disconnect(); })().catch(e=>{ console.error(e); process.exit(1); });'
```

## Current Session State Query

Replace `SESSION_ID`.

```bash
cd backend
npx tsx -e 'import "dotenv/config"; import { PrismaClient } from "@prisma/client"; (async()=>{ const prisma = new PrismaClient(); const sessionId="SESSION_ID"; const session=await prisma.session.findUnique({ where:{id:sessionId}, include:{ relationship:{ include:{ members:{ include:{ user:true } } } }, stageProgress:{ orderBy:[{userId:"asc"},{stage:"asc"}] }, messages:{ orderBy:{timestamp:"desc"}, take:40, select:{id:true,role:true,senderId:true,forUserId:true,stage:true,content:true,timestamp:true} } }}); if(!session){ console.log("no session"); return; } const users=session.relationship.members.map(m=>m.user); const vessels=await prisma.userVessel.findMany({ where:{sessionId}, include:{ user:true, identifiedNeeds:{ orderBy:{createdAt:"asc"} } }}); console.log(JSON.stringify({ session:{id:session.id,status:session.status,currentStage:session.currentStage,relationshipId:session.relationshipId}, users:users.map(u=>({id:u.id,name:u.name,email:u.email})), stageProgress:session.stageProgress.map(p=>({userId:p.userId,user:users.find(u=>u.id===p.userId)?.name,stage:p.stage,status:p.status,completedAt:p.completedAt,gates:p.gatesSatisfied})), vessels:vessels.map(v=>({userId:v.userId,user:v.user.name,needs:v.identifiedNeeds.map(n=>({need:n.need,category:n.category,confirmed:n.confirmed,evidence:n.evidence,createdAt:n.createdAt}))})), recentMessages:session.messages.map(m=>({role:m.role,stage:m.stage,sender:users.find(u=>u.id===m.senderId)?.name||m.senderId,forUser:users.find(u=>u.id===m.forUserId)?.name||m.forUserId,at:m.timestamp,content:m.content.slice(0,700)}))}, null, 2)); await prisma.$disconnect(); })().catch(e=>{ console.error(e); process.exit(1); });'
```

## What To Verify

Stage 2:

- Both users have Stage 2 `StageProgress.status = COMPLETED`.
- Gates include `empathyValidated: true`.
- `EmpathyAttempt.status` should match the UI claim.
- Stage 3 transition should occur only after both validations.

Stage 3:

- `UserVessel.identifiedNeeds` should exist only for needs actually captured/confirmed for that user.
- Stage 3 gates should progress through user-confirmed and consented states, not AI inference.
- Do not trust UI text that says "both users" without checking:
  - `needsConfirmed`
  - `needsShared`
  - `needsValidated`
  - `IdentifiedNeed.confirmed`

Privacy/isolation:

- AI messages have `forUserId`; a user's browser should not show partner-only AI messages.
- Shared content roles should match intended visibility:
  - `EMPATHY_STATEMENT`
  - `SHARED_CONTEXT`
  - `VALIDATION_FEEDBACK`
  - Stage 3 needs reveal/validation messages

## Common Contradictions

- UI says "what each of you named" but partner has no needs records or gates.
- UI says partner is still reflecting but DB shows partner completed.
- Browser shows `forUserId` content for the wrong user after realtime event.
- Session stage advanced even though one user's latest stage progress lacks required gates.

## Code Paths To Inspect

- `backend/src/controllers/stage2.ts`: empathy validation and Stage 3 transition.
- `backend/src/controllers/stage3.ts`: needs capture, confirm, consent, comparison/reveal, validation.
- `backend/src/controllers/messages.ts`: post-message stage-specific processing.
- `backend/src/services/stage-prompts.ts`: stage prompt contracts.
- `backend/src/services/realtime.ts`: session/partner event payloads.
- `mobile/src/screens/UnifiedSessionScreen.tsx`: chat UI, cards, waiting/input rendering.
- `mobile/src/utils/getWaitingStatus.ts` and `mobile/src/config/waitingStatusConfig.ts`: waiting copy.
