// backend/routes/rules.js
const express = require('express');
const router = express.Router();
const rulesController = require('../controllers/rulesController');

// 답글 규칙 조회
router.get('/', rulesController.getRules);

// 답글 규칙 수정
router.put('/:id', rulesController.updateRule);

module.exports = router;