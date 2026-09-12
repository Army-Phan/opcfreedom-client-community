import fs from 'fs';
import path from 'path';

const logDir = path.resolve('data/logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Log file specifically for Gemini activities
const geminiLogFile = path.join(logDir, 'gemini_activity.log');

function formatMessage(level, context, message) {
  const timestamp = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  return `[${timestamp}] [${level}] [${context}] ${message}\n`;
}

export const logger = {
  info: (context, message) => {
    console.log(`[${context}] ${message}`);
    fs.appendFileSync(geminiLogFile, formatMessage('INFO', context, message));
  },
  warn: (context, message) => {
    console.warn(`[${context}] ⚠️ ${message}`);
    fs.appendFileSync(geminiLogFile, formatMessage('WARN', context, message));
  },
  error: (context, message, error = null) => {
    const errMsg = error ? `${message} - ${error.message}\n${error.stack || ''}` : message;
    console.error(`[${context}] ❌ ${errMsg}`);
    fs.appendFileSync(geminiLogFile, formatMessage('ERROR', context, errMsg));
  }
};
