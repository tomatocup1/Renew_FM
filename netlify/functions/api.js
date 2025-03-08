// netlify/functions/api.js
const serverless = require('serverless-http');
const express = require('express');
const app = require('../../backend/server');

// 디버깅을 위한 로그 추가
console.log('Netlify Function loading...');

// 모든 요청에 대한 로깅 추가
app.use((req, res, next) => {
  console.log(`[Netlify] ${req.method} ${req.path}`);
  
  // CORS 헤더 추가 (API 요청 시 CORS 문제 해결)
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// Express 앱 래핑
const handler = serverless(app);

// Netlify Function 핸들러
exports.handler = async (event, context) => {
  // 디버깅을 위한 요청 로그
  console.log(`Received ${event.httpMethod} request to ${event.path}`);
  
  // 요청 처리
  const result = await handler(event, context);
  
  // 응답 로그
  console.log(`Returning status ${result.statusCode}`);
  
  return result;
};