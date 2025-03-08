// netlify/functions/api.js
const serverless = require('serverless-http');
const app = require('../../backend/server');

// Netlify Functions 환경 변수 설정
process.env.RUNNING_IN_NETLIFY = 'true';

// 모든 요청에 대한 로깅 미들웨어 추가
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

module.exports.handler = serverless(app);