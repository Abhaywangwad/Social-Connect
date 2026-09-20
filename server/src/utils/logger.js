import config from '../config/config.js';

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'refreshtoken',
  'accesstoken',
  'authorization',
  'cookie',
  'secret',
  'apikey',
  'apisecret',
  'tokenhash',
  'refreshtokenhash',
  'resettoken',
  'verificationtoken',
  'signature',
  'smtppassword',
  'clientsecret',
  'bearer',
  'sessionsecret',
  'code',
]);

/**
 * Deeply redacts sensitive fields from objects or query parameters before logging.
 *
 * @param {*} data
 * @returns {*} Sanitized copy of data
 */
export const maskSecrets = (data) => {
  if (data === null || typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(maskSecrets);
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    const isSensitiveKey =
      SENSITIVE_KEYS.has(lowerKey) ||
      lowerKey.endsWith('password') ||
      lowerKey.endsWith('token') ||
      lowerKey.endsWith('secret') ||
      lowerKey.endsWith('key');

    if (typeof value === 'object' && value !== null) {
      sanitized[key] = maskSecrets(value);
    } else if (isSensitiveKey) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
};

/**
 * Strips or redacts sensitive query parameters from URLs or route paths.
 * E.g. "/api/auth/verify?token=secret123&user=456" -> "/api/auth/verify?token=[REDACTED]&user=456"
 *
 * @param {string} urlString
 * @returns {string} Sanitized URL
 */
export const sanitizeUrl = (urlString) => {
  if (!urlString || typeof urlString !== 'string') return urlString;

  try {
    const isRelative = !urlString.startsWith('http://') && !urlString.startsWith('https://');
    const dummyBase = 'http://localhost';
    const parsed = new URL(isRelative ? `${dummyBase}${urlString.startsWith('/') ? '' : '/'}${urlString}` : urlString);

    let hasSensitive = false;
    for (const [key] of parsed.searchParams.entries()) {
      const lowerKey = key.toLowerCase();
      if (
        SENSITIVE_KEYS.has(lowerKey) ||
        lowerKey.includes('token') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('password') ||
        lowerKey.includes('key') ||
        lowerKey.includes('signature')
      ) {
        parsed.searchParams.set(key, '[REDACTED]');
        hasSensitive = true;
      }
    }

    if (!hasSensitive) return urlString;

    if (isRelative) {
      return `${parsed.pathname}${parsed.search}`;
    }
    return parsed.toString();
  } catch (_e) {
    // If URL parsing fails, fallback to regex replacement for obvious query parameters
    return urlString.replace(/([?&](?:token|password|secret|key|verificationToken|resetToken)=)[^&]+/gi, '$1[REDACTED]');
  }
};

/**
 * Standard structured logger.
 * Outputs machine-parseable JSON in production and readable colorized logs in development.
 */
class Logger {
  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    let sanitizedMeta = maskSecrets(meta);

    // Sanitize any route or url in metadata
    if (sanitizedMeta.route) {
      sanitizedMeta.route = sanitizeUrl(sanitizedMeta.route);
    }
    if (sanitizedMeta.url) {
      sanitizedMeta.url = sanitizeUrl(sanitizedMeta.url);
    }
    if (sanitizedMeta.path) {
      sanitizedMeta.path = sanitizeUrl(sanitizedMeta.path);
    }

    if (config.isProd) {
      return JSON.stringify({
        timestamp,
        level,
        message,
        ...sanitizedMeta,
      });
    }

    const metaStr = Object.keys(sanitizedMeta).length > 0 ? ` ${JSON.stringify(sanitizedMeta)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
  }

  info(message, meta = {}) {
    console.log(this.formatMessage('info', message, meta));
  }

  warn(message, meta = {}) {
    console.warn(this.formatMessage('warn', message, meta));
  }

  error(message, meta = {}) {
    console.error(this.formatMessage('error', message, meta));
  }

  debug(message, meta = {}) {
    if (config.isDev || config.isTest) {
      console.debug(this.formatMessage('debug', message, meta));
    }
  }
}

const logger = new Logger();
export default logger;
