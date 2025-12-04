/**
 * License Management Routes
 * 
 * Handles license checking and trial management
 */

import express from 'express';
import { findUser, createUser, updateLastSeen, calculateLicenseStatus, getDatabaseStats } from '../lib/db.js';

const router = express.Router();

/**
 * POST /api/checkLicense
 * 
 * Checks or creates user license status
 * 
 * Request body:
 * {
 *   "userId": "unique-user-id",
 *   "extensionVersion": "1.0.0"
 * }
 * 
 * Response:
 * {
 *   "status": "active" | "trial" | "expired",
 *   "daysLeft": number,
 *   "userId": "...",
 *   "licenseType": "paid" | "trial" | "expired"
 * }
 */
router.post('/checkLicense', async (req, res, next) => {
  try {
    const { userId, extensionVersion } = req.body;
    
    // Validate input
    if (!userId) {
      return res.status(400).json({
        error: 'Missing required field: userId'
      });
    }
    
    if (!extensionVersion) {
      return res.status(400).json({
        error: 'Missing required field: extensionVersion'
      });
    }
    
    console.log(`[License] Checking license for user: ${userId}`);
    
    // Find or create user
    let user = await findUser(userId);
    
    if (!user) {
      // New user - create with 30-day trial
      user = await createUser(userId, extensionVersion);
      console.log(`[License] New user created with 30-day trial: ${userId}`);
    } else {
      // Existing user - update last seen
      await updateLastSeen(userId);
    }
    
    // Calculate license status
    const licenseStatus = calculateLicenseStatus(user);
    
    console.log(`[License] User ${userId}: ${licenseStatus.status} (${licenseStatus.daysLeft} days left)`);
    
    res.json(licenseStatus);
    
  } catch (error) {
    console.error('[License] Error:', error);
    next(error);
  }
});

/**
 * GET /api/stats
 * 
 * Gets database statistics (for admin purposes)
 */
router.get('/stats', async (req, res, next) => {
  try {
    const stats = await getDatabaseStats();
    
    res.json({
      ...stats,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[Stats] Error:', error);
    next(error);
  }
});

export default router;
