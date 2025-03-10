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
      // 모든 헤더 로깅
      console.log('Received headers:', JSON.stringify(event.headers));
      
      // 인증 헤더 추출 및 처리를 강화
      let authHeader = event.headers.authorization || event.headers.Authorization || '';
      console.log('Authorization header:', authHeader.substring(0, 20) + '...');
      
      // Supabase 클라이언트 초기화
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_KEY
      );
      
      // 테스트 모드 추가 - 개발 중에만 활성화
      const TEST_MODE = process.env.NODE_ENV === 'development';
      let user;
      
      if (!authHeader && TEST_MODE) {
        console.log('Test mode enabled - skipping auth');
        // 테스트용 더미 사용자 데이터
        user = { id: 'test-user-id' };
      } else {
        // 토큰 추출 및 검증
        const token = authHeader.replace('Bearer ', '');
        console.log('Token length:', token.length);
        
        if (!token) {
          console.log('No token provided');
          return {
            statusCode: 401,
            headers,
            body: JSON.stringify({ error: '인증이 필요합니다.' })
          };
        }
        
        // 사용자 정보 확인
        const { data, error } = await supabase.auth.getUser(token);
        
        if (error || !data.user) {
          console.log('User validation failed:', error?.message);
          return {
            statusCode: 401,
            headers,
            body: JSON.stringify({ 
              error: '유효하지 않은 인증 정보입니다.',
              details: error?.message
            })
          };
        }
        
        user = data.user;
        console.log('User authenticated:', user.id);
      }
    
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