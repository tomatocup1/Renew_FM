// netlify/functions/reviews.js
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  // CORS 헤더 설정
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
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

    // 리뷰 목록 조회
    if (event.httpMethod === 'GET') {
      // 쿼리 파라미터 추출
      const { 
        store_code, 
        platform_code, 
        start_date, 
        end_date,
        limit,
        page
      } = event.queryStringParameters || {};

      // 쿼리 구성
      let query = supabase.from('reviews').select('*');

      // 필터 적용
      if (store_code) {
        query = query.eq('store_code', store_code);
      }
      
      if (platform_code) {
        query = query.eq('platform_code', platform_code);
      }
      
      if (start_date && end_date) {
        query = query.gte('review_date', start_date)
                     .lte('review_date', end_date);
      }

      // 페이징 적용
      if (limit) {
        query = query.limit(parseInt(limit));
        
        if (page && page > 1) {
          const offset = (parseInt(page) - 1) * parseInt(limit);
          query = query.range(offset, offset + parseInt(limit) - 1);
        }
      }

      // 정렬 적용
      query = query.order('created_at', { ascending: false });

      // 쿼리 실행
      const { data, error } = await query;

      if (error) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: error.message })
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(data)
      };
    }

    // 리뷰 생성
    if (event.httpMethod === 'POST') {
      const reviewData = JSON.parse(event.body);
      
      // 데이터 삽입
      const { data, error } = await supabase
        .from('reviews')
        .insert([reviewData]);

      if (error) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: error.message })
        };
      }

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify(data)
      };
    }

    // 지원하지 않는 메서드
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: '지원되지 않는 HTTP 메서드입니다.' })
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};