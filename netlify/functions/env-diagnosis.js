// netlify/functions/env-diagnosis.js
exports.handler = async (event) => {
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    };
    
    try {
      // 환경 변수 상태 확인
      const envChecks = {
        SUPABASE_URL: process.env.SUPABASE_URL ? '설정됨' : '없음',
        SUPABASE_KEY: process.env.SUPABASE_KEY ? '설정됨' : '없음',
        SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY ? '설정됨' : '없음',
        NODE_ENV: process.env.NODE_ENV || '설정 안됨',
        CONTEXT: process.env.CONTEXT || '설정 안됨',
        DEPLOY_ID: process.env.DEPLOY_ID || '설정 안됨'
      };
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          message: '환경 변수 진단 결과',
          env_status: envChecks,
          timestamp: new Date().toISOString(),
          netlify_info: {
            deploy_url: process.env.DEPLOY_URL || '알 수 없음',
            build_id: process.env.BUILD_ID || '알 수 없음'
          }
        })
      };
    } catch (error) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: '환경 변수 확인 중 오류 발생',
          message: error.message
        })
      };
    }
  };