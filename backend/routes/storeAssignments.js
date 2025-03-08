const express = require('express');
const router = express.Router();
const storeAssignmentController = require('../controllers/storeAssignmentController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const supabase = require('../supabaseClient');

console.log('storeAssignments 라우터 로드됨');

// API 엔드포인트 로깅 미들웨어 추가
router.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] 스토어 API 요청:`, {
        path: req.path,
        method: req.method,
        body: req.method === 'POST' ? req.body : undefined,
        query: req.query,
        params: req.params,
        user: req.user?.id
    });
    next();
});

// 기본 인증 미들웨어 적용
router.use(requireAuth);
router.get('/user/:userId/stores', storeAssignmentController.getUserStores);
// 유저 플랫폼별 매장 정보 조회 엔드포인트 추가
router.get('/user-platform-stores', async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: '인증이 필요합니다' });
        }
        
        let stores = [];
        
        if (user.role === '운영자' || user.role === '관리자') {
            const { data, error } = await supabase
                .from('platform_reply_rules')
                .select('store_code, store_name, platform, platform_code')
                .order('store_code')  // store_code로 정렬 변경
                .order('platform');
            
            if (error) throw error;
            stores = data || [];
        } else {
            const { data: assignments, error: assignmentError } = await supabase
                .from('store_assignments')
                .select('store_code')
                .eq('user_id', user.id);

            if (assignmentError) throw assignmentError;

            if (!assignments?.length) {
                return res.json([]);
            }

            const storeCodes = assignments.map(a => a.store_code);
            
            const { data, error } = await supabase
                .from('platform_reply_rules')
                .select('store_code, store_name, platform, platform_code')
                .in('store_code', storeCodes)
                .order('store_code')  // store_code로 정렬 변경
                .order('platform');
                
            if (error) throw error;
            stores = data || [];
        }

        res.json(stores);
    } catch (error) {
        console.error('매장 정보 조회 실패:', error);
        res.status(500).json({ error: '매장 정보를 불러오는데 실패했습니다.' });
    }
});

// 운영자 권한 체크 미들웨어 (아래 라우트에만 적용)
const adminRoutes = express.Router();
adminRoutes.use(requireRole(['운영자', '관리자']));

// 라우트 정의
adminRoutes.get('/users', storeAssignmentController.getAllUsers);
adminRoutes.get('/user/:userId/stores', storeAssignmentController.getUserStores);
adminRoutes.get('/all', storeAssignmentController.getAllStores);
adminRoutes.post('/assignments', storeAssignmentController.assignStores);

// 관리자 라우트 등록
router.use('/', adminRoutes);

module.exports = router;