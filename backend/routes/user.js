// backend/routes/user.js
const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

// 사용자의 매장 정보를 platform_reply_rules에서 가져오는 엔드포인트
router.get('/:userId/stores', requireAuth, async (req, res) => {
    try {
        const { userId } = req.params;
        
        // 먼저 사용자 정보 확인 (운영자인지 체크)
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('role')
            .eq('id', userId)
            .single();
            
        if (userError) {
            console.error('사용자 정보 조회 실패:', userError);
            // 임시로 권한 정보 제공 (인증된 사용자이므로)
            console.log('임시 권한 정보 생성 - 요청 계속 진행');
        }
        
        // 운영자인 경우 모든 매장의 platform_reply_rules 조회
        if (userData?.role === '운영자' || req.user?.role === '운영자') {
            console.log('운영자 계정으로 모든 매장 조회 중...');
            
            const { data: allRules, error: allRulesError } = await supabase
                .from('platform_reply_rules')
                .select('store_code, store_name, platform, platform_code')
                .order('platform', { ascending: true })
                .order('store_name', { ascending: true });
                
            if (allRulesError) {
                console.error('운영자 매장 전체 조회 실패:', allRulesError);
                throw allRulesError;
            }
            
            console.log(`운영자 권한으로 ${allRules?.length || 0}개 매장 조회됨`);
            
            // 중복 제거 (같은 매장의 여러 플랫폼 규칙이 있을 수 있음)
            const uniqueRules = allRules.reduce((acc, curr) => {
                const key = `${curr.store_code}-${curr.platform_code}`;
                if (!acc[key]) {
                    acc[key] = curr;
                }
                return acc;
            }, {});

            const formattedRules = Object.values(uniqueRules).map(rule => ({
                store_code: rule.store_code,
                store_name: rule.store_name,
                platform: rule.platform,
                platform_code: rule.platform_code
            }));
            
            console.log(`운영자에게 ${formattedRules.length}개 매장 데이터 전송`);
            return res.json(formattedRules);
        }

        // 일반 사용자의 경우 할당된 매장만 조회
        console.log('일반 사용자의 매장 할당 조회 중...');
        const { data: assignments, error: assignmentError } = await supabase
            .from('store_assignments')
            .select('store_code')
            .eq('user_id', userId);

        if (assignmentError) {
            console.error('매장 할당 조회 오류:', assignmentError);
            throw assignmentError;
        }

        if (!assignments?.length) {
            console.log('사용자에게 할당된 매장이 없습니다');
            return res.json([]);
        }

        // 할당된 매장들의 platform_reply_rules 조회
        const storeCodes = assignments.map(a => a.store_code);
        console.log('Fetching platform rules for store codes:', storeCodes);

        const { data: rules, error: rulesError } = await supabase
            .from('platform_reply_rules')
            .select('store_code, store_name, platform, platform_code')
            .in('store_code', storeCodes)
            .order('platform', { ascending: true })
            .order('store_name', { ascending: true });

        if (rulesError) {
            console.error('Platform rules fetch error:', rulesError);
            throw rulesError;
        }

        console.log('Raw platform rules:', rules);

        // 중복 제거 (같은 매장의 여러 플랫폼 규칙이 있을 수 있음)
        const uniqueRules = rules.reduce((acc, curr) => {
            const key = `${curr.store_code}-${curr.platform_code}`;
            if (!acc[key]) {
                acc[key] = curr;
            }
            return acc;
        }, {});

        const formattedRules = Object.values(uniqueRules).map(rule => ({
            store_code: rule.store_code,
            store_name: rule.store_name,
            platform: rule.platform,
            platform_code: rule.platform_code
        }));

        console.log('Formatted rules:', formattedRules);
        res.json(formattedRules);

    } catch (error) {
        console.error('Store rules fetch error:', error);
        res.status(500).json({ error: '매장 정보를 불러오는데 실패했습니다.' });
    }
});

module.exports = router;