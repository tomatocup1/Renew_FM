const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const helmet = require('helmet');
require('dotenv').config();

const app = express();

const requiredEnvVars = [
    'SUPABASE_URL',
    'SUPABASE_KEY',
    'COOKIE_SECRET',
    'NODE_ENV'
];

requiredEnvVars.forEach(varName => {
    if (!process.env[varName]) {
        console.error(`Missing required environment variable: ${varName}`);
        process.exit(1);
    }
});

// CORS 설정을 업데이트하여 Netlify 환경 지원
const corsOptions = {
    origin: function(origin, callback) {
      // 허용할 도메인 목록
      const allowedOrigins = [
        'http://localhost:3000',
        'https://wealthfm.co.kr',
        'https://www.wealthfm.co.kr'
      ];
      
      // 개발 환경이거나 허용된 도메인이면 허용
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        console.warn('CORS 거부됨:', origin);
        callback(new Error('CORS 정책에 의해 금지됨'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type', 
      'Authorization', 
      'X-Requested-With',
      'Accept'
    ],
    exposedHeaders: ['X-Session-Save'] // 클라이언트가 접근할 수 있는 커스텀 헤더
  };
  
  app.use(cors(corsOptions));
// 기본 보안 설정
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

// 기본 미들웨어
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(process.env.COOKIE_SECRET));

// 미들웨어와 라우터 임포트
const { requireAuth, requireRole } = require('./middleware/authMiddleware');
const authRouter = require('./routes/auth');
const statsRouter = require('./routes/stats');
const reviewsRouter = require('./routes/reviews');
const rulesRouter = require('./routes/rules');
const userRouter = require('./routes/user');
const storeAssignmentsRouter = require('./routes/storeAssignments');

// API 라우트 설정
const apiRoutes = express.Router();

// 인증이 필요없는 라우트
apiRoutes.use('/auth', authRouter);

// 인증이 필요한 라우트
apiRoutes.use('/stats', requireAuth, statsRouter);
apiRoutes.use('/reviews', requireAuth, reviewsRouter);
apiRoutes.use('/rules', requireAuth, requireRole(['관리자', '운영자']), rulesRouter);
apiRoutes.use('/user', requireAuth, userRouter);
apiRoutes.use('/stores', requireAuth, storeAssignmentsRouter);

// API 라우트를 /api 경로에 마운트
app.use('/api', apiRoutes);

// server.js
app.use('/api/auth', authRoutes);

// 정적 파일 제공 설정
app.use(express.static(path.join(__dirname, '../frontend'), {
    maxAge: '1d',
    etag: true
}));

// 페이지 라우트 설정
const pageRoutes = express.Router();

// 기본 페이지 라우트
pageRoutes.get(['/', '/login'], (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/login.html'));
});

pageRoutes.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/signup.html'));
});

// 인증이 필요한 페이지 라우트
pageRoutes.get('/dashboard', requireAuth, (req, res) => {
    const sessionData = {
        user: req.user,
        session: req.user.session
    };

    res.cookie('session', JSON.stringify(sessionData), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000
    });
    
    res.sendFile(path.join(__dirname, '../frontend/dashboard.html'));
});

pageRoutes.get('/admin/store-manager', requireAuth, requireRole(['운영자']), (req, res) => {
    const sessionData = {
        user: req.user,
        session: req.user.session
    };

    res.cookie('session', JSON.stringify(sessionData), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000
    });
    
    res.sendFile(path.join(__dirname, '../frontend/admin/store-manager.html'));
});

// 페이지 라우트 적용
app.use('/', pageRoutes);

// admin 정적 파일 제공
app.use('/admin', express.static(path.join(__dirname, '../frontend/admin')));

// 헬스 체크
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV
    });
});

// 404 에러 처리
app.use((req, res, next) => {
    if (req.xhr || req.path.startsWith('/api/')) {
        res.status(404).json({ 
            error: 'Not Found',
            path: req.path
        });
    } else {
        res.status(404).sendFile(path.join(__dirname, '../frontend/login.html'));
    }
});

// 전역 에러 처리
app.use((err, req, res, next) => {
    console.error('Server Error:', {
        url: req.url,
        method: req.method,
        params: req.params,
        query: req.query,
        error: err.message,
        stack: err.stack
    });

    if (req.xhr || req.path.startsWith('/api/')) {
        res.status(err.status || 500).json({
            error: err.message || 'Internal Server Error',
            details: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    } else {
        res.status(500).sendFile(path.join(__dirname, '../frontend/error.html'));
    }
});

// 소셜 로그인 콜백 처리
pageRoutes.get('/auth-callback', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/auth-callback.html'));
});

// 서버 시작
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
    console.log(`🚀 Server is running at http://localhost:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
});

// 정상적인 종료 처리
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
    });
});

module.exports = app;