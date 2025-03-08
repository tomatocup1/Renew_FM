// backend/routes/reviews.js
const express = require('express');
const router = express.Router();
const reviewsController = require('../controllers/reviewsController');

// 리뷰 목록 조회
router.get('/', reviewsController.getReviews);

// 리뷰 생성
router.post('/', reviewsController.createReview);

module.exports = router;