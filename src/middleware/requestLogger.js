// middleware/requestLogger.js
import logger from '../utils/logger.js';

export const requestLogger = (req, res, next) => {
  const start = Date.now();

  // Log when response is finished
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      user: req.user?.uid || 'anonymous',
    };

    if (res.statusCode >= 400) {
      logger.warn(logData);
    } else {
      logger.info(logData);
    }
  });

  next();
};
