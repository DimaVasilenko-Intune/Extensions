/**
 * License Database Manager
 * 
 * Manages user licenses in a local JSON file
 * - Creates new users with 30-day trial
 * - Tracks trial expiration
 * - Manages paid licenses
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '../data/licenses.json');

/**
 * Ensures the data directory and database file exist
 */
async function initializeDatabase() {
  try {
    const dataDir = path.join(__dirname, '../data');
    
    // Create data directory if it doesn't exist
    try {
      await fs.access(dataDir);
    } catch {
      await fs.mkdir(dataDir, { recursive: true });
      console.log('[DB] Created data directory');
    }
    
    // Create licenses.json if it doesn't exist
    try {
      await fs.access(DB_PATH);
    } catch {
      await fs.writeFile(DB_PATH, JSON.stringify({ users: [] }, null, 2));
      console.log('[DB] Created licenses.json database');
    }
  } catch (error) {
    console.error('[DB] Initialization error:', error);
    throw error;
  }
}

/**
 * Reads the license database
 * @returns {Promise<Object>} Database object with users array
 */
async function readDatabase() {
  await initializeDatabase();
  
  try {
    const data = await fs.readFile(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('[DB] Read error:', error);
    return { users: [] };
  }
}

/**
 * Writes to the license database
 * @param {Object} data - Database object
 */
async function writeDatabase(data) {
  try {
    await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('[DB] Write error:', error);
    throw error;
  }
}

/**
 * Finds a user by userId
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} User object or null
 */
export async function findUser(userId) {
  const db = await readDatabase();
  return db.users.find(u => u.userId === userId) || null;
}

/**
 * Creates a new user with 30-day trial
 * @param {string} userId - User ID
 * @param {string} extensionVersion - Extension version
 * @returns {Promise<Object>} Created user object
 */
export async function createUser(userId, extensionVersion) {
  const db = await readDatabase();
  
  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
  
  const newUser = {
    userId,
    extensionVersion,
    createdAt: now.toISOString(),
    trialEndsAt: trialEndsAt.toISOString(),
    paidUntil: null,
    lastSeenAt: now.toISOString(),
    requestCount: 1
  };
  
  db.users.push(newUser);
  await writeDatabase(db);
  
  console.log(`[DB] Created new user: ${userId} (Trial until ${trialEndsAt.toISOString()})`);
  
  return newUser;
}

/**
 * Updates user's last seen timestamp
 * @param {string} userId - User ID
 */
export async function updateLastSeen(userId) {
  const db = await readDatabase();
  const user = db.users.find(u => u.userId === userId);
  
  if (user) {
    user.lastSeenAt = new Date().toISOString();
    user.requestCount = (user.requestCount || 0) + 1;
    await writeDatabase(db);
  }
}

/**
 * Calculates license status for a user
 * @param {Object} user - User object
 * @returns {Object} Status object with status, daysLeft, etc.
 */
export function calculateLicenseStatus(user) {
  const now = new Date();
  
  // Check paid license first
  if (user.paidUntil) {
    const paidUntil = new Date(user.paidUntil);
    if (now < paidUntil) {
      const daysLeft = Math.ceil((paidUntil - now) / (1000 * 60 * 60 * 24));
      return {
        status: 'active',
        daysLeft,
        userId: user.userId,
        licenseType: 'paid',
        expiresAt: user.paidUntil
      };
    }
  }
  
  // Check trial
  const trialEndsAt = new Date(user.trialEndsAt);
  if (now < trialEndsAt) {
    const daysLeft = Math.ceil((trialEndsAt - now) / (1000 * 60 * 60 * 24));
    return {
      status: 'trial',
      daysLeft,
      userId: user.userId,
      licenseType: 'trial',
      expiresAt: user.trialEndsAt
    };
  }
  
  // Expired
  return {
    status: 'expired',
    daysLeft: 0,
    userId: user.userId,
    licenseType: 'expired',
    expiresAt: user.trialEndsAt
  };
}

/**
 * Extends a user's paid license
 * @param {string} userId - User ID
 * @param {number} days - Number of days to extend
 */
export async function extendPaidLicense(userId, days) {
  const db = await readDatabase();
  const user = db.users.find(u => u.userId === userId);
  
  if (!user) {
    throw new Error('User not found');
  }
  
  const now = new Date();
  const currentPaidUntil = user.paidUntil ? new Date(user.paidUntil) : now;
  const extendFrom = currentPaidUntil > now ? currentPaidUntil : now;
  const newPaidUntil = new Date(extendFrom.getTime() + days * 24 * 60 * 60 * 1000);
  
  user.paidUntil = newPaidUntil.toISOString();
  await writeDatabase(db);
  
  console.log(`[DB] Extended license for ${userId} until ${newPaidUntil.toISOString()}`);
  
  return user;
}

/**
 * Gets database statistics
 * @returns {Promise<Object>} Stats object
 */
export async function getDatabaseStats() {
  const db = await readDatabase();
  
  const stats = {
    totalUsers: db.users.length,
    activeUsers: 0,
    trialUsers: 0,
    expiredUsers: 0
  };
  
  db.users.forEach(user => {
    const status = calculateLicenseStatus(user);
    if (status.status === 'active') stats.activeUsers++;
    else if (status.status === 'trial') stats.trialUsers++;
    else stats.expiredUsers++;
  });
  
  return stats;
}

// Initialize database on module load
await initializeDatabase();
