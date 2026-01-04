/**
 * Notification Routes for Meet Without Fear
 *
 * API endpoints for managing in-app notifications.
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { successResponse, errorResponse } from '../utils/response';
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} from '../services/notification';

const router = Router();

// All notification routes require authentication
router.use(requireAuth);

/**
 * GET /notifications
 * Get paginated list of notifications for the current user.
 * Supports cursor-based pagination for infinite scroll.
 *
 * Query params:
 * - cursor: ID of the last notification from previous page
 * - limit: Number of notifications to return (default 20, max 50)
 */
router.get('/notifications', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const cursor = req.query.cursor as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

    const result = await getNotifications(userId, cursor, limit);
    successResponse(res, result);
  } catch (err) {
    console.error('[Notifications] Error fetching notifications:', err);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to fetch notifications', 500);
  }
});

/**
 * GET /notifications/unread-count
 * Get the count of unread notifications for the current user.
 */
router.get('/notifications/unread-count', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const count = await getUnreadCount(userId);
    successResponse(res, { count });
  } catch (err) {
    console.error('[Notifications] Error getting unread count:', err);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to get unread count', 500);
  }
});

/**
 * PATCH /notifications/:id/read
 * Mark a single notification as read.
 */
router.patch('/notifications/:id/read', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const notificationId = req.params.id;

    const result = await markAsRead(notificationId, userId);
    successResponse(res, result);
  } catch (err) {
    console.error('[Notifications] Error marking notification as read:', err);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to mark notification as read', 500);
  }
});

/**
 * PATCH /notifications/mark-all-read
 * Mark all notifications as read for the current user.
 */
router.patch('/notifications/mark-all-read', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const result = await markAllAsRead(userId);
    successResponse(res, result);
  } catch (err) {
    console.error('[Notifications] Error marking all notifications as read:', err);
    errorResponse(res, 'INTERNAL_ERROR', 'Failed to mark all notifications as read', 500);
  }
});

export default router;
