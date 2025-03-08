// backend/controllers/storeAssignmentController.js
const supabase = require('../supabaseClient');

// 사용자의 매장 할당 목록 조회
exports.getUserStores = async (req, res) => {
    try {
        const { userId } = req.params;
        
        // 사용자 정보 조회
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('role')
            .eq('id', userId)
            .single();

        if (userError) {
            console.error('사용자 정보 조회 오류:', userError);
            // 권한 확인이 안되면 요청자의 권한 사용
            if (req.user && req.user.role === '운영자') {
                console.log('요청자가 운영자 권한, 계속 진행');
            } else {
                throw userError;
            }
        }

        // 운영자 권한 확인 (DB에서 조회된 정보 또는 요청자 정보 사용)
        const isAdmin = userData?.role === '운영자' || req.user?.role === '운영자';
        console.log('사용자 역할:', isAdmin ? '운영자' : (userData?.role || '권한 미확인'));

        // 운영자인 경우 모든 매장 조회
        if (isAdmin) {
            const { data: stores, error } = await supabase
                .from('platform_reply_rules')
                .select('store_code, platform, platform_code, store_name')
                .order('store_name')
                .order('platform');
            
            if (error) {
                console.error('매장 정보 조회 오류:', error);
                throw error;
            }

            console.log('조회된 매장 정보:', stores?.length || 0);
            
            // 매장 정보 포맷팅
            const formattedStores = stores.filter(store => store.platform && store.store_name).map(store => ({
                value: JSON.stringify({
                    store_code: store.store_code,
                    platform_code: store.platform_code || ''
                }),
                label: `[${store.platform || '플랫폼 없음'}] ${store.store_name || '이름 없음'} (${store.platform_code || '코드 없음'})`
            }));

            console.log('포맷팅된 매장 정보:', formattedStores.length);
            
            return res.json(formattedStores);
        }

        // 일반 사용자의 경우 할당된 매장만 조회
        const { data: assignments, error: assignmentError } = await supabase
            .from('store_assignments')
            .select(`
                store_code,
                role_type,
                platform_reply_rules (
                    store_name,
                    platform,
                    platform_code
                )
            `)
            .eq('user_id', userId);

        if (assignmentError) {
            console.error('매장 할당 정보 조회 오류:', assignmentError);
            throw assignmentError;
        }

        console.log('조회된 매장 할당 정보:', assignments?.length || 0);

        // 매장 정보 포맷팅
        const formattedStores = assignments
            .filter(assignment => assignment.platform_reply_rules)
            .map(assignment => ({
                value: JSON.stringify({
                    store_code: assignment.store_code,
                    platform_code: assignment.platform_reply_rules.platform_code || ''
                }),
                label: `[${assignment.platform_reply_rules.platform || '플랫폼 없음'}] ${assignment.platform_reply_rules.store_name || '이름 없음'} (${assignment.platform_reply_rules.platform_code || '코드 없음'})`
            }));

        console.log('포맷팅된 매장 정보:', formattedStores.length);
        
        res.json(formattedStores);

    } catch (err) {
        console.error('매장 조회 에러:', err);
        res.status(500).json({ error: err.message });
    }
};

// 매장 할당 저장
exports.assignStores = async (req, res) => {
    try {
        const { userId, stores } = req.body;  // stores = [{store_code, role_type}]
        
        // 기존 할당 정보 삭제
        const { error: deleteError } = await supabase
            .from('store_assignments')
            .delete()
            .eq('user_id', userId);

        if (deleteError) throw deleteError;

        // 새로운 할당 정보 추가
        const { data, error } = await supabase
            .from('store_assignments')
            .insert(stores.map(store => ({
                user_id: userId,
                store_code: store.store_code,
                role_type: store.role_type
            })));

        if (error) throw error;

        res.json({
            message: '매장 할당이 완료되었습니다.',
            data
        });

    } catch (err) {
        console.error('매장 할당 에러:', err);
        res.status(500).json({ error: err.message });
    }
};

// 모든 사용자 목록 조회 (운영자용)
exports.getAllUsers = async (req, res) => {
    try {
        console.log('1. getAllUsers 시작');
        console.log('요청 헤더:', req.headers);

        // 모든 사용자 조회 (운영자 제외)
        const { data: users, error } = await supabase
            .from('users')
            .select('id, name, email, role')
            .neq('role', '운영자')  // 운영자가 아닌 모든 사용자 조회
            .order('name');

        console.log('사용자 쿼리 결과:', { 사용자수: users?.length || 0, error });
        console.log('2. 필터링된 사용자들:', users);
        console.log('3. 쿼리 에러:', error);

        if (error) throw error;
        res.json(users || []);

    } catch (err) {
        console.error('4. getAllUsers 에러:', err);
        res.status(500).json({ error: err.message });
    }
};

// 모든 매장 목록 조회 (운영자용)
exports.getAllStores = async (req, res) => {
    try {
        console.log('getAllStores 함수 호출됨');
        console.log('요청 헤더:', req.headers);
        // 단순 쿼리로 변경
        const { data: stores, error } = await supabase
            .from('platform_reply_rules')
            .select('store_code, store_name, platform, platform_code')
            .order('store_code');

            console.log('Supabase 쿼리 결과:', { stores: stores?.length || 0, error });
        if (error) throw error;
        
        const formattedStores = stores.map(store => ({
            store_code: store.store_code,
            store_name: store.store_name || '이름 없음',
            platform: store.platform || '알 수 없음',
            platform_code: store.platform_code || ''
        }));

        res.json(formattedStores);
    } catch (err) {
        console.error('매장 목록 조회 에러:', err);
        res.status(500).json({ error: err.message });
    }
};