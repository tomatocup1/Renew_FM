// netlify/functions/api.js
const serverless = require('serverless-http');
const app = require('../../backend/server');

// Express 요청 로그 미들웨어 추가
app.use((req, res, next) => {
  console.log(`Netlify Function: ${req.method} ${req.url}`);
  
  // CORS 헤더 추가하여 API 요청 허용
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  // OPTIONS 요청에 대한 처리 (CORS preflight)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// 누락된 API 엔드포인트 디버깅을 위한 미들웨어
app.use('/api/auth/user', (req, res, next) => {
  console.log('auth/user 엔드포인트 요청 감지됨');
  next();
});

app.use('/api/auth/refresh-token', (req, res, next) => {
  console.log('auth/refresh-token 엔드포인트 요청 감지됨');
  next();
});

module.exports.handler = serverless(app, {
  binary: ['image/png', 'image/jpeg', 'image/gif'],
  basePath: '',
  disableLogs: false
});