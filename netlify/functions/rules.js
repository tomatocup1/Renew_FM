// netlify/functions/rules.js
const { createClient } = require('@supabase/supabase-js');

// Supabase 클라이언트 초기화
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// CORS 헤더 설정
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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

  try {
    if (event.httpMethod === 'GET') {
      // URL 쿼리 파라미터에서 값 추출
      const { store_code, platform, platform_code } = event.queryStringParameters || {};

      if (!store_code) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: '매장 코드가 필요합니다.' })
        };
      }

      // 사용자 접근 권한 확인 (운영자는 모든 매장, 그 외에는 할당된 매장만)
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

      if (userData.role !== '운영자') {
        // 매장 할당 확인
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

      // 쿼리 구성
      let query = supabase
        .from('platform_reply_rules')
        .select('*')
        .eq('store_code', store_code);

      // 플랫폼 필터 추가
      if (platform) {
        query = query.eq('platform', platform);
      }

      // 플랫폼 코드 필터 추가
      if (platform_code) {
        query = query.eq('platform_code', platform_code);
      }

      // 쿼리 실행
      const { data: rules, error: rulesError } = await query;

      if (rulesError) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: '규칙 정보를 불러오는데 실패했습니다.' })
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(rules)
      };
    }

    // POST 요청 처리 (새 규칙 생성)
    if (event.httpMethod === 'POST') {
      const ruleData = JSON.parse(event.body);
      
      // 필수 필드 확인
      if (!ruleData.store_code || !ruleData.platform) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: '매장 코드와 플랫폼 정보가 필요합니다.' })
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

      if (userData.role !== '운영자' && userData.role !== '프차관리자') {
        // 매장 할당 확인
        const { data: assignment, error: assignmentError } = await supabase
          .from('store_assignments')
          .select('*')
          .eq('user_id', user.id)
          .eq('store_code', ruleData.store_code)
          .maybeSingle();

        if (assignmentError || !assignment) {
          return {
            statusCode: 403,
            headers,
            body: JSON.stringify({ error: '해당 매장에 대한 접근 권한이 없습니다.' })
          };
        }
      }

      // 새 규칙 생성
      const { data: newRule, error: insertError } = await supabase
        .from('platform_reply_rules')
        .insert([{
          ...ruleData,
          created_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (insertError) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: '규칙 생성에 실패했습니다.', details: insertError.message })
        };
      }

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify(newRule)
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: '지원하지 않는 HTTP 메소드입니다.' })
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