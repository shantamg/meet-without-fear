/**
 * People Routes
 *
 * Routes for people tracking and cross-feature intelligence.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { listPeople, getPerson, updatePerson, mergePerson, deletePerson } from '../controllers/people';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// GET /api/v1/people - List tracked people
router.get('/', listPeople);

// GET /api/v1/people/:id - Get person details
router.get('/:id', getPerson);

// PATCH /api/v1/people/:id - Update person
router.patch('/:id', updatePerson);

// POST /api/v1/people/:id/merge - Merge person
router.post('/:id/merge', mergePerson);

// DELETE /api/v1/people/:id - Delete person
router.delete('/:id', deletePerson);

export default router;
