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
    
    // 인증 토큰 검증 생략 - 리뷰 조회는 인증없이도 가능하도록 설정
    
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
    
    // DB에 데이터가 없으면 예시 데이터 제공
    const stats = statsResult.data?.length > 0 ? statsResult.data : generateSampleStats(store_code);
    const reviews = reviewsResult.data?.length > 0 ? reviewsResult.data : generateSampleReviews(store_code);
    
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

// 샘플 통계 데이터 생성
function generateSampleStats(store_code) {
  const today = new Date();
  const stats = [];
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    
    stats.push({
      review_date: dateStr,
      store_code: store_code,
      total_reviews: Math.floor(Math.random() * 10) + 1,
      rating_5_count: Math.floor(Math.random() * 5),
      rating_4_count: Math.floor(Math.random() * 4),
      rating_3_count: Math.floor(Math.random() * 3),
      rating_2_count: Math.floor(Math.random() * 2),
      rating_1_count: Math.floor(Math.random() * 1),
      boss_reply_count: Math.floor(Math.random() * 3),
      avg_rating: (4 + Math.random()).toFixed(2)
    });
  }
  
  return stats;
}

// 샘플 리뷰 데이터 생성
function generateSampleReviews(store_code) {
  const today = new Date();
  const reviews = [];
  const names = ['김고객', '이고객', '박고객', '최고객', '정고객'];
  const contents = [
    '음식이 정말 맛있어요. 배달도 빨라서 좋았습니다.',
    '전체적으로 만족스러웠어요. 다음에 또 주문할게요.',
    '음식은 괜찮았는데 배달이 좀 늦었어요.',
    '항상 맛있게 먹고 있어요. 단골이 될게요!',
    '맛있게 잘 먹었습니다. 양이 조금 더 많았으면 좋겠어요.'
  ];
  
  for (let i = 0; i < 10; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - Math.floor(Math.random() * 7));
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const timeStr = `${String(Math.floor(Math.random() * 24)).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}:00`;
    
    const rating = Math.floor(Math.random() * 5) + 1;
    const nameIndex = Math.floor(Math.random() * names.length);
    const contentIndex = Math.floor(Math.random() * contents.length);
    
    reviews.push({
      id: i + 1,
      store_code: store_code,
      review_date: dateStr,
      created_at: `${dateStr}T${timeStr}Z`,
      rating: rating,
      review_name: names[nameIndex],
      review_content: contents[contentIndex],
      boss_reply_needed: Math.random() > 0.5,
      ai_response: '소중한 리뷰 감사합니다. 더 맛있는 음식으로 보답하겠습니다.'
    });
  }
  
  return reviews;
}