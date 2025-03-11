// netlify/functions/stats-details.js
const { supabase, corsHeaders } = require('./utils/supabase');

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders };
  }

  try {
    // 쿼리 파라미터 파싱
    const {
      store_code,
      platform_code,
      platform,
      start_date,
      end_date,
      limit = '20'
    } = event.queryStringParameters || {};

    if (!store_code) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: '매장 코드가 필요합니다.' })
      };
    }

    console.log('통계 조회 요청:', { store_code, platform, start_date, end_date });
    
    // 인증 토큰 확인
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader) {
      console.log('Authorization 헤더 없음');
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: '인증이 필요합니다.' })
      };
    }
    
    // 통계 데이터 조회
    let statsQuery = supabase
      .from('review_stats')
      .select('*')
      .eq('store_code', store_code);
      
    // 리뷰 데이터 조회
    let reviewsQuery = supabase
      .from('reviews')
      .select('*')
      .eq('store_code', store_code)
      .order('review_date', { ascending: false })
      .limit(parseInt(limit));
    
    // 필터 적용
    if (platform_code) {
      statsQuery = statsQuery.eq('platform_code', platform_code);
      reviewsQuery = reviewsQuery.eq('platform_code', platform_code);
    }
    
    if (platform) {
      statsQuery = statsQuery.eq('platform', platform);
      reviewsQuery = reviewsQuery.eq('platform', platform);
    }
    
    if (start_date) {
      statsQuery = statsQuery.gte('review_date', start_date);
      reviewsQuery = reviewsQuery.gte('review_date', start_date);
    }
    
    if (end_date) {
      statsQuery = statsQuery.lte('review_date', end_date);
      reviewsQuery = reviewsQuery.lte('review_date', end_date);
    }
    
    // 정렬
    statsQuery = statsQuery.order('review_date', { ascending: false });
    
    // 병렬 쿼리 실행
    const [statsResult, reviewsResult] = await Promise.all([
      statsQuery,
      reviewsQuery
    ]);
    
    console.log('조회 결과:', {
      stats: statsResult.data?.length || 0, 
      reviews: reviewsResult.data?.length || 0
    });
    
    // 쿼리 오류 확인
    if (statsResult.error) {
      console.error('통계 데이터 조회 오류:', statsResult.error);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          error: '통계 데이터 조회 중 오류가 발생했습니다.',
          details: statsResult.error.message
        })
      };
    }
    
    if (reviewsResult.error) {
      console.error('리뷰 데이터 조회 오류:', reviewsResult.error);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          error: '리뷰 데이터 조회 중 오류가 발생했습니다.',
          details: reviewsResult.error.message
        })
      };
    }
    
    // 데이터 빈 배열로 초기화 (null이 아닌 빈 배열로 처리)
    const stats = statsResult.data || [];
    const reviews = reviewsResult.data || [];
    
    // 데이터가 없는 경우
    if (stats.length === 0 && reviews.length === 0) {
      console.log('데이터가 없음');
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          stats: [],
          reviews: [],
          meta: {
            total_stats: 0,
            total_reviews: 0,
            needs_boss_reply: 0,
            message: '해당 기간에 데이터가 없습니다.'
          }
        })
      };
    }
    
    // 응답 구성
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        stats,
        reviews,
        meta: {
          total_stats: stats.length,
          total_reviews: reviews.length,
          needs_boss_reply: reviews.filter(r => r.boss_reply_needed).length
        }
      })
    };
    
  } catch (error) {
    console.error('함수 실행 오류:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: '서버 오류가 발생했습니다',
        message: error.message 
      })
    };
  }
};