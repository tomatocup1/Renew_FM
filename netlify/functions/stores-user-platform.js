// netlify/functions/stores-user-platform.js
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
    return { statusCode: 204, headers };
  }

  try {
    // 인증 헤더 추출 및 디버깅 정보 출력
    const authHeader = event.headers.authorization || '';
    console.log('Received authorization header:', authHeader ? 'Present' : 'Missing');
    
    // Supabase 클라이언트 초기화
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_KEY
    );
    
    // 인증 헤더가 없는 경우
    if (!authHeader) {
      console.log('No authorization header provided');
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: '인증이 필요합니다.' })
      };
    }

    // 토큰 추출
    const token = authHeader.replace('Bearer ', '');
    console.log('Token extracted, verifying with Supabase');
    
    // 사용자 정보 확인
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      console.log('User validation failed:', userError?.message);
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: '유효하지 않은 인증 정보입니다.' })
      };
    }
    
    console.log('User authenticated successfully:', user.id);
    
    // 사용자 역할 조회
    const { data: userData, error: dbError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();
      
    if (dbError) {
      console.log('Failed to fetch user role:', dbError.message);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: '사용자 정보를 불러오는데 실패했습니다.' })
      };
    }
    
    let stores = [];
    
    // 관리자/운영자인 경우 모든 매장 조회
    if (userData.role === '운영자' || userData.role === '관리자') {
      console.log('Fetching all stores for admin user');
      const { data, error } = await supabase
        .from('platform_reply_rules')
        .select('store_code, store_name, platform, platform_code')
        .order('store_code')
        .order('platform');
        
      if (error) {
        console.log('Error fetching stores:', error.message);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: '매장 정보를 불러오는데 실패했습니다.' })
        };
      }
      
      stores = data || [];
    } else {
      // 일반 사용자는 할당된 매장만 조회
      console.log('Fetching assigned stores for user:', user.id);
      const { data: assignments, error: assignError } = await supabase
        .from('store_assignments')
        .select('store_code')
        .eq('user_id', user.id);
        
      if (assignError) {
        console.log('Error fetching store assignments:', assignError.message);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: '매장 할당 정보를 불러오는데 실패했습니다.' })
        };
      }
      
      if (assignments && assignments.length > 0) {
        const storeCodes = assignments.map(a => a.store_code);
        console.log('Found store codes:', storeCodes);
        
        const { data, error } = await supabase
          .from('platform_reply_rules')
          .select('store_code, store_name, platform, platform_code')
          .in('store_code', storeCodes)
          .order('store_code')
          .order('platform');
          
        if (error) {
          console.log('Error fetching store details:', error.message);
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: '매장 정보를 불러오는데 실패했습니다.' })
          };
        }
        
        stores = data || [];
      }
    }
    
    console.log('Returning stores count:', stores.length);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(stores)
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