// statsController.js
const supabase = require('../supabaseClient');

exports.getStatsWithReviews = async (req, res) => {
    try {
        const { store_code, start_date, end_date, platform_code, platform } = req.query;
        
        console.log('Received stats request for:', { 
            store_code, 
            start_date,
            end_date,
            platform_code,
            platform
        });

        if (!store_code) {
            return res.status(400).json({ 
                error: '매장 코드가 필요합니다.' 
            });
        }

        // 기본 쿼리 생성
        let statsQuery = supabase
            .from('review_stats')
            .select()
            .eq('store_code', store_code);
            
        let reviewsQuery = supabase
            .from('reviews')
            .select('*, boss_reply_needed')  // boss_reply_needed 필드 추가
            .eq('store_code', store_code);

        // 플랫폼 필터 추가
        if (platform_code) {
            statsQuery = statsQuery.eq('platform_code', platform_code);
            reviewsQuery = reviewsQuery.eq('platform_code', platform_code);
        }
        
        if (platform) {
            statsQuery = statsQuery.eq('platform', platform);
            reviewsQuery = reviewsQuery.eq('platform', platform);
        }

        // 날짜 필터 추가
        if (start_date && end_date) {
            statsQuery = statsQuery
                .gte('review_date', start_date)
                .lte('review_date', end_date);
                
            reviewsQuery = reviewsQuery
                .gte('review_date', start_date)
                .lte('review_date', end_date);
        }

        // 정렬 추가
        statsQuery = statsQuery.order('review_date', { ascending: false });
        reviewsQuery = reviewsQuery.order('created_at', { ascending: false });

        // 병렬로 쿼리 실행
        const [statsResult, reviewsResult] = await Promise.all([
            statsQuery,
            reviewsQuery
        ]);

        if (statsResult.error) {
            console.error('Stats query error:', statsResult.error);
            return res.status(400).json({
                error: '통계 데이터 조회 실패',
                details: statsResult.error.message
            });
        }

        if (reviewsResult.error) {
            console.error('Reviews query error:', reviewsResult.error);
            return res.status(400).json({
                error: '리뷰 데이터 조회 실패',
                details: reviewsResult.error.message
            });
        }

        // 확인 필요 리뷰 수 계산
        const needsBossReplyCount = reviewsResult.data?.filter(r => r.boss_reply_needed === true).length || 0;

        return res.json({
            stats: statsResult.data || [],
            reviews: reviewsResult.data || [],
            meta: {
                store_code,
                platform_code,
                platform,
                date_range: {
                    start: start_date,
                    end: end_date
                },
                total_stats: statsResult.data?.length || 0,
                total_reviews: reviewsResult.data?.length || 0,
                needs_boss_reply: needsBossReplyCount
            }
        });

    } catch (error) {
        console.error('Stats controller error:', error);
        return res.status(500).json({
            error: '데이터 조회 중 오류가 발생했습니다',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};