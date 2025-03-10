// netlify/functions/utils/supabase.js
const { createClient } = require('@supabase/supabase-js');

// 환경 변수 확인
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

// 환경 변수 누락 시 경고
if (!supabaseUrl || !supabaseKey) {
  console.error('⚠️ Supabase 환경 변수가 설정되지 않았습니다!');
}

// Supabase 클라이언트 생성
const supabase = createClient(supabaseUrl, supabaseKey, {
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
    timeout: 10000 // 10초 타임아웃
  }
});

// 공통 CORS 헤더
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