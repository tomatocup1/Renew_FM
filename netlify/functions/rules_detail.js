// netlify/functions/rules-detail.js
const { createClient } = require('@supabase/supabase-js');

// Supabase 클라이언트 초기화
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// CORS 헤더 설정
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
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
    // 경로에서 규칙 ID 추출
    const ruleId = event.path.split('/').pop();
    
    if (!ruleId || isNaN(parseInt(ruleId))) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: '유효한 규칙 ID가 필요합니다.' })
      };
    }

    // 규칙 정보 조회
    const { data: rule, error: ruleError } = await supabase
      .from('platform_reply_rules')
      .select('*')
      .eq('id', ruleId)
      .single();

    if (ruleError) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: '규칙을 찾을 수 없습니다.' })
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

    // 운영자 또는 프차관리자가 아닌 경우 매장 할당 확인
    if (userData.role !== '운영자' && userData.role !== '프차관리자') {
      const { data: assignment, error: assignmentError } = await supabase
        .from('store_assignments')
        .select('*')
        .eq('user_id', user.id)
        .eq('store_code', rule.store_code)
        .maybeSingle();

      if (assignmentError || !assignment) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ error: '해당 매장에 대한 접근 권한이 없습니다.' })
        };
      }
    }

    // GET 요청 처리 (규칙 상세 조회)
    if (event.httpMethod === 'GET') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(rule)
      };
    }

    // PUT 요청 처리 (규칙 업데이트)
    if (event.httpMethod === 'PUT') {
      const updateData = JSON.parse(event.body);
      
      // 매장 코드와 플랫폼은 변경할 수 없음
      delete updateData.store_code;
      delete updateData.platform;
      delete updateData.platform_code;
      delete updateData.created_at;
      
      // 규칙 업데이트
      const { data: updatedRule, error: updateError } = await supabase
        .from('platform_reply_rules')
        .update({
          ...updateData,
          updated_at: new Date().toISOString()
        })
        .eq('id', ruleId)
        .select()
        .single();

      if (updateError) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: '규칙 업데이트에 실패했습니다.', details: updateError.message })
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(updatedRule)
      };
    }

    // DELETE 요청 처리 (규칙 삭제)
    if (event.httpMethod === 'DELETE') {
      // 운영자만 삭제 가능
      if (userData.role !== '운영자') {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ error: '규칙 삭제는 운영자만 가능합니다.' })
        };
      }

      const { error: deleteError } = await supabase
        .from('platform_reply_rules')
        .delete()
        .eq('id', ruleId);

      if (deleteError) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: '규칙 삭제에 실패했습니다.', details: deleteError.message })
        };
      }

      return {
        statusCode: 204,
        headers
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