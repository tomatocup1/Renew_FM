// netlify/functions/stats-details.js
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
  // CORS 헤더 설정
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  // OPTIONS 요청 처리
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: '지원하지 않는 HTTP 메소드입니다.' })
    };
  }

  try {
    // 인증 토큰 추출
    const authHeader = event.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    
    // Supabase 클라이언트 초기화
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY
    );
    
    // 사용자 정보 확인
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: '인증에 실패했습니다' })
      };
    }
    
    // 쿼리 파라미터 파싱
    const {
      store_code,
      platform_code,
      platform,
      start_date,
      end_date,
      limit = '20' // 기본값
    } = event.queryStringParameters || {};

    if (!store_code) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: '매장 코드가 필요합니다.' })
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
    
    // 에러 처리
    if (statsResult.error) {
      console.error('통계 데이터 조회 오류:', statsResult.error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: '통계 데이터를 가져올 수 없습니다: ' + statsResult.error.message })
      };
    }
    
    if (reviewsResult.error) {
      console.error('리뷰 데이터 조회 오류:', reviewsResult.error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: '리뷰 데이터를 가져올 수 없습니다: ' + reviewsResult.error.message })
      };
    }
    
    // 응답 구성
    const stats = statsResult.data || [];
    const reviews = reviewsResult.data || [];
    
    // 확인이 필요한 리뷰 수 계산
    const needsBossReply = reviews.filter(review => review.boss_reply_needed).length;
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        stats,
        reviews,
        meta: {
          total_stats: stats.length,
          total_reviews: reviews.length,
          needs_boss_reply: needsBossReply
        }
      })
    };
    
  } catch (error) {
    console.error('함수 실행 오류:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: '서버 오류가 발생했습니다',
        message: error.message 
      })
    };
  }
};