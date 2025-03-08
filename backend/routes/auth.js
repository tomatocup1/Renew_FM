// backend/routes/auth.js
// backend/routes/auth.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/authMiddleware');

// 회원가입, 로그인
router.post('/signup', authController.signUp);
router.post('/signin', authController.signIn);

// 로그아웃, 유저 정보
router.post('/signout', requireAuth, authController.signOut);
router.get('/user', requireAuth, authController.getUser);

// 소셜 로그인 URL 생성
router.get('/social-url/:provider', authController.getSocialLoginUrl);

// 소셜 로그인 처리
router.post('/social-login', authController.socialSignIn);

// 주의: refresh-token에는 requireAuth 걸지 않는다!
router.post('/refresh-token', authController.refreshToken);

module.exports = router;
