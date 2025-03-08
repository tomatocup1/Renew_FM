// netlify/functions/storeAssignments.js
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

    // 경로 분석
    const path = event.path.replace('/api/stores/', '');

    // 사용자 플랫폼별 매장 정보 조회
    if (path === 'user-platform-stores' && event.httpMethod === 'GET') {
      // 인증 헤더에서 사용자 ID 추출
      const authHeader = event.headers.authorization;
      let userData = null;

      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        const { data: { user } } = await supabase.auth.getUser(token);
        userData = user;
      }

      if (!userData) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: '인증이 필요합니다.' })
        };
      }

      // 사용자 정보 조회
      const { data: userInfo, error: userError } = await supabase
        .from('users')
        .select('role')
        .eq('id', userData.id)
        .single();

      if (userError) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: userError.message })
        };
      }

      let stores = [];

      // 관리자/운영자인 경우 모든 매장 조회
      if (userInfo.role === '운영자' || userInfo.role === '관리자') {
        const { data, error } = await supabase
          .from('platform_reply_rules')
          .select('store_code, store_name, platform, platform_code')
          .order('store_code')
          .order('platform');

        if (error) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: error.message })
          };
        }

        stores = data || [];
      } else {
        // 일반 사용자는 할당된 매장만 조회
        const { data: assignments, error: assignmentError } = await supabase
          .from('store_assignments')
          .select('store_code')
          .eq('user_id', userData.id);

        if (assignmentError) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: assignmentError.message })
          };
        }

        if (assignments && assignments.length > 0) {
          const storeCodes = assignments.map(a => a.store_code);
          
          const { data, error } = await supabase
            .from('platform_reply_rules')
            .select('store_code, store_name, platform, platform_code')
            .in('store_code', storeCodes)
            .order('store_code')
            .order('platform');

          if (error) {
            return {
              statusCode: 400,
              headers,
              body: JSON.stringify({ error: error.message })
            };
          }

          stores = data || [];
        }
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(stores)
      };
    }

    // 다른 경로 및 메서드 처리...
    
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