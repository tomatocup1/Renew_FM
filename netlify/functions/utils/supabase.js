// netlify/functions/utils/supabase.js
const { createClient } = require('@supabase/supabase-js');

// 환경 변수 확인 및 상세 로깅
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

console.log('환경 변수 상태 확인:');
console.log('SUPABASE_URL:', supabaseUrl ? '설정됨' : '없음');
console.log('SUPABASE_SERVICE_KEY:', process.env.SUPABASE_SERVICE_KEY ? '설정됨' : '없음');
console.log('SUPABASE_KEY:', process.env.SUPABASE_KEY ? '설정됨' : '없음');

// 개발/테스트 환경에서 기본값 사용 (선택사항)
const isDev = process.env.NODE_ENV === 'development' || process.env.CONTEXT === 'dev';

let supabase;
try {
  // 실제 운영 환경에서는 환경 변수가 반드시 필요
  if (!supabaseUrl || !supabaseKey) {
    if (isDev) {
      console.warn('⚠️ 개발 환경: Supabase 환경 변수 누락. 테스트 클라이언트 사용');
      // 개발 환경용 더미 클라이언트 (선택사항)
      supabase = {
        auth: { signInWithPassword: () => ({ data: { session: {}, user: {} }, error: null }) },
        from: () => ({ select: () => ({ data: [], error: null }) })
      };
    } else {
      throw new Error(`환경 변수 누락: ${!supabaseUrl ? 'SUPABASE_URL ' : ''}${!supabaseKey ? 'SUPABASE_SERVICE_KEY/SUPABASE_KEY' : ''}`);
    }
  } else {
    // 정상적인 Supabase 클라이언트 생성
    supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      },
      global: {
        headers: {
          'X-Client-Info': 'netlify-functions'
        }
      },
      realtime: {
        timeout: 10000
      }
    });
    
    console.log('Supabase 클라이언트 생성 성공');
  }
} catch (error) {
  console.error('Supabase 클라이언트 생성 오류:', error.message);
  throw error;
}

// 공통 CORS 헤더 - 기존 코드 유지
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Content-Type': 'application/json'
};

module.exports = {
  supabase,
  corsHeaders
};