// netlify/functions/rules.js
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  // CORS 헤더 설정
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS'
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

    // 답글 규칙 조회
    if (event.httpMethod === 'GET') {
      // 쿼리 파라미터 추출 (필요시)
      const { store_code, platform, platform_code } = event.queryStringParameters || {};
      
      // 기본 쿼리
      let query = supabase.from('platform_reply_rules').select('*');
      
      // 필터 적용
      if (store_code) {
        query = query.eq('store_code', store_code);
      }
      
      if (platform) {
        query = query.eq('platform', platform);
      }
      
      if (platform_code) {
        query = query.eq('platform_code', platform_code);
      }
      
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

    // 답글 규칙 수정
    if (event.httpMethod === 'PUT') {
      // 경로에서 ID 추출 (/api/rules/:id)
      const id = event.path.split('/').pop();
      const updateData = JSON.parse(event.body);
      
      // 데이터 업데이트
      const { data, error } = await supabase
        .from('platform_reply_rules')
        .update(updateData)
        .eq('id', id)
        .select();

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