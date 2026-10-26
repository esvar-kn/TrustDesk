// Pino logger. Pretty output in development, structured JSON otherwise.
// `redact` keeps secrets out of logs (expanded as more are added).
import pino from 'pino';
import { env, isProd, isTest } from './env.js';

export const logger = pino({
  level: isTest ? 'silent' : env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'AUTH_JWT_SECRET',
      'LLM_API_KEY',
      'password',
      '*.password',
    ],
    censor: '[redacted]',
  },
  transport: isProd
    ? undefined
    : { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } },
});
