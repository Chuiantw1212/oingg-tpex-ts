import { Request, Response, NextFunction } from 'ultimate-express';

/**
 * Middleware to require a task secret for specific endpoints.
 * It checks for a secret in the 'x-task-secret' header or 'task_secret' query parameter.
 * The expected secret should be set in the environment variable `TASK_SECRET`.
 *
 * If the secret is missing or invalid, it sends a 401 Unauthorized response.
 * If the `TASK_SECRET` environment variable is not set, it sends a 500 Server Error.
 */
export const requireTaskSecret = (req: Request, res: Response, next: NextFunction) => {
  const expectedSecret = process.env.TASK_SECRET; // 從環境變數中獲取預期的密鑰

  if (!expectedSecret) {
    console.error('TASK_SECRET environment variable is not set. Please configure it.');
    return res.status(500).json({ message: 'Server configuration error: Task secret not defined.' });
  }

  const providedSecret = req.headers['x-task-secret'] || req.query.task_secret; // 檢查請求頭或查詢參數

  if (!providedSecret || providedSecret !== expectedSecret) {
    return res.status(401).json({ message: 'Unauthorized: Invalid or missing task secret.' });
  }

  next(); // 密鑰有效，繼續處理請求
};
