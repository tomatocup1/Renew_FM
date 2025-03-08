// netlify/functions/stats-details.js
const { createClient } = require('@supabase/supabase-js');

// Supabase 클라이언트 초기화
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// CORS 헤더 설정
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event, context) => {
  // OPTIONS 요청 처리 (CORS preflight)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers
    };
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
    
    if (!token) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: '인증이 필요합니다.' })
      };
    }

    // 사용자 정보 확인 (JWT 토큰 검증)
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: '유효하지 않은 인증 정보입니다.' })
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

    // 사용자 권한 확인
    const { data: userData, error: getUserError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (getUserError) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: '사용자 정보를 불러오는데 실패했습니다.' })
      };
    }

    // 운영자가 아닌 경우 매장 할당 확인
    if (userData.role !== '운영자') {
      const { data: assignment, error: assignmentError } = await supabase
        .from('store_assignments')
        .select('*')
        .eq('user_id', user.id)
        .eq('store_code', store_code)
        .maybeSingle();

      if (assignmentError || !assignment) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ error: '해당 매장에 대한 접근 권한이 없습니다.' })
        };
      }
    }

    // 통계 쿼리 구성
    let statsQuery = supabase
      .from('review_stats')
      .select('*')
      .eq('store_code', store_code)
      .order('review_date', { ascending: false });

    // 플랫폼 코드 필터 추가
    if (platform_code) {
      statsQuery = statsQuery.eq('platform_code', platform_code);
    }

    // 플랫폼 필터 추가
    if (platform) {
      statsQuery = statsQuery.eq('platform', platform);
    }

    // 시작 날짜 필터 추가
    if (start_date) {
      statsQuery = statsQuery.gte('review_date', start_date);
    }

    // 종료 날짜 필터 추가
    if (end_date) {
      statsQuery = statsQuery.lte('review_date', end_date);
    }

    // 통계 데이터 조회
    const { data: stats, error: statsError } = await statsQuery;

    if (statsError) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: '통계 정보를 불러오는데 실패했습니다.' })
      };
    }

    // 리뷰 쿼리 구성
    let reviewsQuery = supabase
      .from('reviews')
      .select('*')
      .eq('store_code', store_code)
      .order('review_date', { ascending: false })
      .limit(parseInt(limit));

    // 플랫폼 코드 필터 추가
    if (platform_code) {
      reviewsQuery = reviewsQuery.eq('platform_code', platform_code);
    }

    // 플랫폼 필터 추가
    if (platform) {
      reviewsQuery = reviewsQuery.eq('platform', platform);
    }

    // 시작 날짜 필터 추가
    if (start_date) {
      reviewsQuery = reviewsQuery.gte('review_date', start_date);
    }

    // 종료 날짜 필터 추가
    if (end_date) {
      reviewsQuery = reviewsQuery.lte('review_date', end_date);
    }

    // 리뷰 데이터 조회
    const { data: reviews, error: reviewsError } = await reviewsQuery;

    if (reviewsError) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: '리뷰 정보를 불러오는데 실패했습니다.' })
      };
    }

    // 확인이 필요한 리뷰 수 계산
    const needsBossReply = reviews?.filter(review => review.boss_reply_needed)?.length || 0;

    // 결과 반환
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        stats,
        reviews,
        meta: {
          total_stats: stats?.length || 0,
          total_reviews: reviews?.length || 0,
          needs_boss_reply: needsBossReply
        }
      })
    };

  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: '서버 오류가 발생했습니다.' })
    };
  }
};