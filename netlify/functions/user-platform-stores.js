// netlify/functions/stores-user-platform.js
exports.handler = async (event, context) => {
    const { createClient } = require('@supabase/supabase-js');
    
    // Netlify 환경변수에서 Supabase 정보 가져오기
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    
    try {
      // 인증 헤더 처리
      const authHeader = event.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return {
          statusCode: 401,
          body: JSON.stringify({ error: '인증이 필요합니다' })
        };
      }
      
      // Supabase에서 직접 데이터 가져오기
      const { data, error } = await supabase
        .from('platform_reply_rules')
        .select('store_code, store_name, platform, platform_code')
        .order('store_code');
        
      if (error) throw error;
      
      return {
        statusCode: 200,
        body: JSON.stringify(data)
      };
    } catch (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: '데이터 조회 실패: ' + error.message })
      };
    }
  };