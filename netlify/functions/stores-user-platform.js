// netlify/functions/stores-user-platform.js
const { supabase, corsHeaders } = require('./utils/supabase');

exports.handler = async (event, context) => {
  // OPTIONS 요청 처리
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders };
  }
  
  try {
    // 인증 토큰 추출
    const authHeader = event.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    
    if (!token) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: '인증이 필요합니다.' })
      };
    }
    
    // 사용자 정보 확인
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: '유효하지 않은 인증 정보입니다.' })
      };
    }
    
    // 사용자 역할 조회
    const { data: userData, error: dbError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();
      
    if (dbError) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: '사용자 정보를 불러오는데 실패했습니다.' })
      };
    }
    
    let stores = [];
    
    // 관리자/운영자인 경우 모든 매장 조회
    if (userData.role === '운영자' || userData.role === '관리자') {
      const { data, error } = await supabase
        .from('platform_reply_rules')
        .select('store_code, store_name, platform, platform_code')
        .order('store_code')
        .order('platform');
        
      if (error) {
        return {
          statusCode: 500,
          headers: corsHeaders,
          body: JSON.stringify({ error: '매장 정보를 불러오는데 실패했습니다.' })
        };
      }
      
      stores = data || [];
    } else {
      // 일반 사용자는 할당된 매장만 조회
      const { data: assignments, error: assignError } = await supabase
        .from('store_assignments')
        .select('store_code')
        .eq('user_id', user.id);
        
      if (assignError) {
        return {
          statusCode: 500,
          headers: corsHeaders,
          body: JSON.stringify({ error: '매장 할당 정보를 불러오는데 실패했습니다.' })
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
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ error: '매장 정보를 불러오는데 실패했습니다.' })
          };
        }
        
        stores = data || [];
      }
    }
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(stores)
    };
    
  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: '서버 오류가 발생했습니다.' })
    };
  }
};