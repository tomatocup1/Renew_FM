const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase 설정이 없습니다!');
  console.log('SUPABASE_URL:', supabaseUrl ? '설정됨' : '없음');
  console.log('SUPABASE_KEY:', supabaseKey ? '설정됨' : '없음');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
      autoRefreshToken: true,
      persistSession: true
  }
});
console.log('Supabase 클라이언트 초기화 완료');

module.exports = supabase;

supabase.from('review_stats').select('*').limit(1)
    .then(({ data, error }) => {
        if (error) {
            console.error('Supabase connection test failed:', error);
            // 연결 실패 시 프로세스 종료 고려
            if (process.env.NODE_ENV === 'production') {
                process.exit(1);
            }
        } else {
            console.log('Supabase connection test successful');
        }
    })
    .catch(error => {
        console.error('Fatal Supabase error:', error);
        if (process.env.NODE_ENV === 'production') {
            process.exit(1);
        }
    });