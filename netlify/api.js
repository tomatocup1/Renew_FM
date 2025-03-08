// netlify/functions/api.js
const serverless = require('serverless-http');
const app = require('../../backend/server');

// Express 앱을 Netlify Function으로 래핑
module.exports.handler = serverless(app);