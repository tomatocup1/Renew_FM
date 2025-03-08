// backend/controllers/authController.js
const supabase = require('../supabaseClient');

exports.signUp = async (req, res) => {
    try {
        const { email, password, name, role } = req.body;
        
        // 1. 이메일 중복 확인
        const { data: existingUser } = await supabase
            .from('users')
            .select('email')
            .eq('email', email)
            .single();

        if (existingUser) {
            return res.status(400).json({
                error: '이미 등록된 이메일입니다.'
            });
        }

        // 2. Supabase Auth로 사용자 생성
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { name, role }
            }
        });

        if (authError) throw authError;

        let storeCode = null;
        
        // 3. 점주인 경우 매장 코드 자동 생성
        if (role === '점주') {
            const { data: maxStore } = await supabase
                .from('platform_reply_rules')
                .select('store_code')
                .order('store_code', { ascending: false })
                .limit(1);

            const lastNum = maxStore?.[0] 
                ? parseInt(maxStore[0].store_code.replace('STORE', '')) 
                : 0;
            
            storeCode = `STORE${String(lastNum + 1).padStart(5, '0')}`;
            
            // store_info에 새 매장 추가
            const { error: storeError } = await supabase
                .from('store_info')
                .insert([{ store_code: storeCode }]);

            if (storeError) throw storeError;
        }

        // 4. users 테이블에 사용자 정보 저장
        const { data: userData, error: userError } = await supabase
            .from('users')
            .insert([{
                id: authData.user.id,
                email,
                name,
                role,
                store_code: storeCode
            }])
            .select()
            .single();

        if (userError) throw userError;

        // 5. 매장 할당 정보 저장 (점주인 경우)
        if (storeCode) {
            const { error: assignError } = await supabase
                .from('store_assignments')
                .insert([{
                    user_id: authData.user.id,
                    store_code: storeCode,
                    role_type: role
                }]);

            if (assignError) throw assignError;
        }

        res.status(201).json({
            message: '회원가입이 완료되었습니다.',
            user: {
                ...userData,
                store_code: storeCode
            }
        });

    } catch (err) {
        console.error('회원가입 처리 중 예외 발생:', err);
        res.status(500).json({
            error: '서버 오류',
            details: err.message
        });
    }
};

exports.signIn = async (req, res) => {
    try {
      const { email, password } = req.body;
      console.log('로그인 시도:', { email });
  
      // Supabase 인증
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
      });
  
      if (authError) {
        console.error('인증 오류:', authError);
        return res.status(401).json({
          error: '로그인 실패',
          details: '이메일 또는 비밀번호가 올바르지 않습니다.'
        });
      }
  
      if (!authData?.user) {
        console.error('인증 데이터 없음');
        return res.status(401).json({
          error: '로그인 실패',
          details: '인증 데이터가 없습니다.'
        });
      }
  
      // 사용자 정보 조회
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', authData.user.id)
        .single();
  
      if (userError && userError.code !== 'PGRST116') {
        console.error('사용자 정보 조회 오류:', userError);
        return res.status(500).json({
          error: '사용자 정보 조회 실패',
          details: userError.message
        });
      }
  
      // 사용자 정보가 없으면 자동 생성
      let user = userData;
      if (!userData) {
        console.log('사용자 정보 없음, 새 사용자 생성');
        const { data: newUser, error: createError } = await supabase
          .from('users')
          .insert([{
            id: authData.user.id,
            email: authData.user.email,
            name: authData.user.user_metadata?.name || authData.user.email,
            role: '일반사용자',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }])
          .select()
          .single();
  
        if (createError) {
          console.error('사용자 생성 오류:', createError);
          return res.status(500).json({
            error: '사용자 생성 실패',
            details: createError.message
          });
        }
  
        user = newUser;
      }
  
      // 세션 정보 구성
      const sessionData = {
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token,
        expires_at: authData.session.expires_at
      };
  
      // CORS 헤더 설정
      res.set({
        'Access-Control-Allow-Origin': req.headers.origin || '*',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Expose-Headers': 'X-Session-Save'
      });
      
      // 클라이언트에서의 세션 저장을 위한 헤더
      res.set('X-Session-Save', 'true');
      
      // HTTP 전용 쿠키 (JavaScript에서 접근 가능)
      res.cookie('session', JSON.stringify(sessionData), {
        httpOnly: false, // 클라이언트 JS에서 접근 가능하도록
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000 // 24시간
      });
      
      console.log('로그인 성공, 응답 보냄');
      
      return res.json({
        message: '로그인 성공',
        session: sessionData,
        user
      });
    } catch (err) {
      console.error('로그인 처리 중 예외 발생:', err);
      res.status(500).json({
        error: '서버 오류',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    }
  };

exports.signOut = async (req, res) => {
    try {
        const { error } = await supabase.auth.signOut();
        
        if (error) throw error;

        res.json({
            message: '로그아웃 되었습니다.',
            success: true
        });

    } catch (err) {
        console.error('로그아웃 처리 중 예외 발생:', err);
        res.status(500).json({
            error: '서버 오류',
            details: '로그아웃 처리 중 오류가 발생했습니다.'
        });
    }
};
// backend/controllers/authController.js에 추가

// 소셜 로그인 처리
exports.socialSignIn = async (req, res) => {
    try {
        const { provider, access_token } = req.body;
        
        if (!provider || !access_token) {
            return res.status(400).json({
                error: '잘못된 요청입니다.',
                details: '프로바이더와 액세스 토큰이 필요합니다.'
            });
        }
        
        // Supabase 소셜 로그인 API 호출
        const { data: authData, error: authError } = await supabase.auth.signInWithIdToken({
            provider: provider,
            token: access_token,
        });
        
        if (authError) throw authError;
        
        if (!authData?.user) {
            throw new Error('인증 데이터가 없습니다.');
        }
        
        // 사용자 정보 조회 또는 생성
        let userData;
        const { data: existingUser, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('id', authData.user.id)
            .single();
            
        if (userError?.code === 'PGRST116') {
            // 사용자 정보가 없는 경우 생성
            const userMetadata = authData.user.user_metadata || {};
            
            // 소셜 로그인 프로바이더별 이름 필드 처리
            let userName = userMetadata.name || userMetadata.full_name || 
                           userMetadata.preferred_username || authData.user.email || 
                           `${provider} 사용자`;
                           
            const { data: newUser, error: createError } = await supabase
                .from('users')
                .insert([{
                    id: authData.user.id,
                    email: authData.user.email,
                    name: userName,
                    role: '일반사용자', // 기본 역할은 일반사용자로 설정
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
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
        
        // 세션 정보 구성
        const sessionData = {
            access_token: authData.session.access_token,
            refresh_token: authData.session.refresh_token,
            expires_at: authData.session.expires_at,
            user: {
                ...userData,
                auth: authData.user
            }
        };
        
        // 쿠키에 세션 정보 저장
        res.cookie('session', JSON.stringify({
            access_token: sessionData.access_token,
            refresh_token: sessionData.refresh_token,
            expires_at: sessionData.expires_at
        }), {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000 // 24시간
        });
        
        return res.json({
            message: '로그인 성공',
            session: sessionData,
            user: userData
        });
        
    } catch (err) {
        console.error('Social login error:', err);
        res.status(500).json({
            error: '서버 오류',
            details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
};

// 소셜 로그인 URL 생성
exports.getSocialLoginUrl = async (req, res) => {
    try {
        const { provider } = req.params;
        const redirectUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth-callback`;
        
        let authUrl = '';
        
        if (provider === 'google') {
            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: redirectUrl
                }
            });
            
            if (error) throw error;
            authUrl = data.url;
            
        } else if (provider === 'kakao') {
            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: 'kakao',
                options: {
                    redirectTo: redirectUrl
                }
            });
            
            if (error) throw error;
            authUrl = data.url;
        } else {
            return res.status(400).json({
                error: '지원하지 않는 프로바이더입니다.'
            });
        }
        
        res.json({ url: authUrl });
        
    } catch (err) {
        console.error('Generate social URL error:', err);
        res.status(500).json({
            error: '서버 오류',
            details: err.message
        });
    }
};
exports.refreshToken = async (req, res) => {
    try {
        const { refresh_token } = req.body;
        if (!refresh_token) {
            return res.status(400).json({ error: '리프레시 토큰이 없습니다.' });
        }

        const { data, error } = await supabase.auth.refreshSession({ 
            refresh_token 
        });

        if (error) {
            // 401 상태 코드로 변경하여 프론트엔드에서 로그인 페이지로 리다이렉션
            return res.status(401).json({ 
                error: '토큰 갱신 실패',
                code: 'TOKEN_REFRESH_FAILED'
            });
        }

        res.json({
            session: {
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
                expires_at: new Date(Date.now() + 3600 * 1000).toISOString() // 1시간
            }
        });
    } catch (err) {
        res.status(401).json({ 
            error: '토큰 갱신 실패',
            code: 'TOKEN_REFRESH_FAILED'
        });
    }
};

exports.getUser = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                error: '인증 정보가 없습니다.',
                details: '로그인이 필요합니다.'
            });
        }

        res.json({ user: req.user });
    } catch (err) {
        console.error('사용자 정보 조회 중 예외 발생:', err);
        res.status(500).json({
            error: '서버 오류',
            details: '사용자 정보 조회 중 오류가 발생했습니다.'
        });
    }
};

exports.updateUser = async (req, res) => {
    try {
        const { name, phone } = req.body;
        const userId = req.user.id;

        const { data, error } = await supabase
            .from('users')
            .update({ name, phone })
            .eq('id', userId)
            .select()
            .single();

        if (error) throw error;

        res.json({
            message: '프로필이 업데이트되었습니다.',
            user: data
        });

    } catch (err) {
        console.error('프로필 업데이트 중 예외 발생:', err);
        res.status(500).json({
            error: '서버 오류',
            details: '프로필 업데이트 중 오류가 발생했습니다.'
        });
    }
};

exports.resetPassword = async (req, res) => {
    try {
        const { email } = req.body;

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${process.env.FRONTEND_URL}/reset-password`
        });

        if (error) throw error;

        res.json({
            message: '비밀번호 재설정 이메일이 전송되었습니다.'
        });

    } catch (err) {
        console.error('비밀번호 재설정 중 예외 발생:', err);
        res.status(500).json({
            error: '서버 오류',
            details: '비밀번호 재설정 처리 중 오류가 발생했습니다.'
        });
    }
};