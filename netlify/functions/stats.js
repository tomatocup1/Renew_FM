// netlify/functions/stats.js
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  // CORS 헤더 설정
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };

  // OPTIONS 요청 처리
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }

  try {
    // Supabase 클라이언트 초기화
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY
    );

    // 통계와 리뷰 데이터 조회
    if (event.path.includes('/api/stats/details') && event.httpMethod === 'GET') {
      const { 
        store_code, 
        start_date, 
        end_date, 
        platform_code, 
        platform 
      } = event.queryStringParameters || {};

      if (!store_code) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: '매장 코드가 필요합니다.' })
        };
      }

      // 통계 쿼리 구성
      let statsQuery = supabase
        .from('review_stats')
        .select()
        .eq('store_code', store_code);
        
      let reviewsQuery = supabase
        .from('reviews')
        .select('*, boss_reply_needed')
        .eq('store_code', store_code);

      // 필터 적용
      if (platform_code) {
        statsQuery = statsQuery.eq('platform_code', platform_code);
        reviewsQuery = reviewsQuery.eq('platform_code', platform_code);
      }
      
      if (platform) {
        statsQuery = statsQuery.eq('platform', platform);
        reviewsQuery = reviewsQuery.eq('platform', platform);
      }

      // 날짜 필터 적용
      if (start_date && end_date) {
        statsQuery = statsQuery
          .gte('review_date', start_date)
          .lte('review_date', end_date);
          
        reviewsQuery = reviewsQuery
          .gte('review_date', start_date)
          .lte('review_date', end_date);
      }

      // 정렬 적용
      statsQuery = statsQuery.order('review_date', { ascending: false });
      reviewsQuery = reviewsQuery.order('created_at', { ascending: false });

      // 병렬 쿼리 실행
      const [statsResult, reviewsResult] = await Promise.all([
        statsQuery,
        reviewsQuery
      ]);

      // 에러 처리
      if (statsResult.error) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: '통계 데이터 조회 실패',
            details: statsResult.error.message
          })
        };
      }

      if (reviewsResult.error) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: '리뷰 데이터 조회 실패',
            details: reviewsResult.error.message
          })
        };
      }

      // 확인 필요 리뷰 수 계산
      const needsBossReplyCount = (reviewsResult.data || [])
        .filter(r => r.boss_reply_needed === true)
        .length;

      // 응답 반환
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
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
            total_stats: (statsResult.data || []).length,
            total_reviews: (reviewsResult.data || []).length,
            needs_boss_reply: needsBossReplyCount
          }
        })
      };
    }

    // 지원하지 않는 경로
    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ error: '지원되지 않는 요청입니다.' })
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};