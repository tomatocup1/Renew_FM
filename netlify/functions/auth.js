// netlify/functions/auth.js
const { supabase, corsHeaders } = require('./utils/supabase');

exports.handler = async (event) => {
  // OPTIONS 요청 처리
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders };
  }
  
  // 경로 분석
  const path = event.path.replace(/^\/.netlify\/functions\/auth\/?/, '');
  
  try {
    // 로그인 처리
    if (path === 'signin' && event.httpMethod === 'POST') {
      const { email, password } = JSON.parse(event.body);
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      
      if (error) throw error;
      
      // 사용자 정보 조회
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', data.user.id)
        .single();
        
      if (userError) throw userError;
      
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          session: {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_at: data.session.expires_at
          },
          user: userData
        })
      };
    }
    
    // 로그아웃 처리
    if (path === 'signout' && event.httpMethod === 'POST') {
      const authHeader = event.headers.authorization || '';
      const token = authHeader.replace('Bearer ', '');
      
      if (token) {
        await supabase.auth.signOut({ token });
      }
      
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ message: '로그아웃 되었습니다.' })
      };
    }
    
    // 토큰 갱신
    if (path === 'refresh-token' && event.httpMethod === 'POST') {
      const { refresh_token } = JSON.parse(event.body);
      
      if (!refresh_token) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: '리프레시 토큰이 필요합니다.' })
        };
      }
      
      const { data, error } = await supabase.auth.refreshSession({ refresh_token });
      
      if (error) {
        return {
          statusCode: 401,
          headers: corsHeaders,
          body: JSON.stringify({ error: '토큰 갱신 실패' })
        };
      }
      
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          session: {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_at: data.session.expires_at
          }
        })
      };
    }
    
    // 사용자 정보 조회
    if (path === 'user' && event.httpMethod === 'GET') {
      const authHeader = event.headers.authorization || '';
      const token = authHeader.replace('Bearer ', '');
      
      if (!token) {
        return {
          statusCode: 401,
          headers: corsHeaders,
          body: JSON.stringify({ error: '인증이 필요합니다.' })
        };
      }
      
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      
      if (userError || !user) {
        return {
          statusCode: 401,
          headers: corsHeaders,
          body: JSON.stringify({ error: '유효하지 않은 토큰입니다.' })
        };
      }
      
      const { data: userData, error: dbError } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();
        
      if (dbError) {
        return {
          statusCode: 500,
          headers: corsHeaders,
          body: JSON.stringify({ error: '사용자 정보를 불러오는데 실패했습니다.' })
        };
      }
      
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ user: userData })
      };
    }
    
    // 소셜 로그인 URL 생성
    if (path === 'social-url' && event.httpMethod === 'GET') {
      const provider = event.queryStringParameters.provider;
      const redirectUrl = process.env.SITE_URL || 'http://localhost:8888';
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${redirectUrl}/auth-callback.html`
        }
      });
      
      if (error) throw error;
      
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ url: data.url })
      };
    }
    
    // 소셜 로그인 처리
    if (path === 'social-login' && event.httpMethod === 'POST') {
      const { provider, access_token } = JSON.parse(event.body);
      
      if (!provider || !access_token) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: '잘못된 요청입니다.' })
        };
      }
      
      // Supabase 소셜 로그인 API 호출
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider,
        token: access_token
      });
      
      if (error) throw error;
      
      // 사용자 정보 조회 또는 생성
      let userData;
      const { data: existingUser, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', data.user.id)
        .single();
        
      if (userError?.code === 'PGRST116') {
        // 사용자 정보가 없는 경우 생성
        const userMetadata = data.user.user_metadata || {};
        
        const { data: newUser, error: createError } = await supabase
          .from('users')
          .insert([{
            id: data.user.id,
            email: data.user.email,
            name: userMetadata.name || userMetadata.full_name || data.user.email,
            role: '일반사용자',
            created_at: new Date().toISOString()
          }])
          .select()
          .single();
          
        if (createError) throw createError;
        userData = newUser;
      } else if (userError) {
        throw userError;
      } else {
        userData = existingUser;
      }
      
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          session: {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_at: data.session.expires_at
          },
          user: userData
        })
      };
    }
    
    return {
      statusCode: 404,
      headers: corsHeaders,
      body: JSON.stringify({ error: '요청한 경로를 찾을 수 없습니다.' })
    };
    
  } catch (error) {
    console.error('Auth function error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message })
    };
  }
};