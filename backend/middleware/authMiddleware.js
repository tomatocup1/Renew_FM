// backend/middleware/authMiddleware.js
const { supabase } = require('../supabaseClient');

async function extractToken(req) {
    if (req.headers.authorization?.startsWith('Bearer ')) {
        return req.headers.authorization.substring(7);
    }

    if (req.cookies?.session) {
        try {
            const sessionData = JSON.parse(req.cookies.session);
            return sessionData.access_token;
        } catch (e) {
            console.error('Session parse error:', e);
        }
    }

    return null;
}

function isTokenExpired(token) {
    try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        return payload.exp * 1000 < Date.now();
    } catch (error) {
        console.error('Token parse error:', error);
        return true;
    }
}

function extractRefreshToken(req) {
    if (req.cookies?.session) {
        try {
            const sessionData = JSON.parse(decodeURIComponent(req.cookies.session));
            return sessionData.refresh_token;
        } catch (e) {
            console.error('Session parse error:', e);
        }
    }
    return null;
}

async function validateAndGetUserData(token) {
    try {
        const { data, error: authError } = await supabase.auth.getUser(token);
        
        if (authError || !data?.user) {
            console.error('Auth validation error:', authError);
            return null;
        }

        const user = data.user;
        console.log('Auth user data:', user);

        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('id', user.id)
            .single();

        if (userError?.code === 'PGRST116') {
            const userMetadata = user.user_metadata || {};
            
            const { data: newUser, error: createError } = await supabase
                .from('users')
                .insert([{
                    id: user.id,
                    email: user.email,
                    name: userMetadata.name || user.email,
                    role: userMetadata.role || '일반사용자',
                    store_code: userMetadata.store_code || null,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }])
                .select()
                .single();

            if (createError) {
                console.error('User creation error:', createError);
                return null;
            }

            return {
                ...newUser,
                auth: user
            };
        }

        if (userError) {
            console.error('User data fetch error:', userError);
            return null;
        }

        return {
            ...userData,
            auth: user
        };

    } catch (error) {
        console.error('User validation error:', error);
        return null;
    }
}

async function refreshUserSession(refreshToken) {
    try {
        const { data, error } = await supabase.auth.refreshSession({
            refresh_token: refreshToken
        });

        if (error) {
            console.error('Session refresh error:', error);
            return null;
        }

        return data.session;
    } catch (error) {
        console.error('Session refresh error:', error);
        return null;
    }
}

function updateSessionCookie(res, session) {
    res.cookie('session', JSON.stringify(session), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000
    });
}

function isApiRequest(req) {
    return req.xhr || req.path.startsWith('/api/');
}

function handleNoToken(req, res) {
    if (isApiRequest(req)) {
        return res.status(401).json({ 
            error: '인증 토큰이 필요합니다.',
            code: 'NO_TOKEN'
        });
    }
    const returnUrl = encodeURIComponent(req.originalUrl);
    return res.redirect(`/login.html?redirect=${returnUrl}`);
}

function handleInvalidToken(req, res) {
    if (isApiRequest(req)) {
        return res.status(401).json({ 
            error: '유효하지 않은 토큰입니다.',
            code: 'INVALID_TOKEN'
        });
    }
    return res.redirect('/login.html');
}

function handleError(req, res, error) {
    console.error('Auth error details:', {
        path: req.path,
        method: req.method,
        error: error.message
    });

    if (isApiRequest(req)) {
        return res.status(500).json({ 
            error: '인증 처리 중 오류가 발생했습니다.',
            code: 'AUTH_ERROR',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
    return res.redirect('/login.html');
}

const requireAuth = async (req, res, next) => {
    try {
        let token = await extractToken(req);
        
        if (!token) {
            return handleNoToken(req, res);
        }

        if (isTokenExpired(token)) {
            const refreshToken = extractRefreshToken(req);
            if (refreshToken) {
                const newSession = await refreshUserSession(refreshToken);
                if (newSession) {
                    token = newSession.access_token;
                    updateSessionCookie(res, newSession);
                } else {
                    return handleInvalidToken(req, res);
                }
            } else {
                return handleInvalidToken(req, res);
            }
        }

        const userData = await validateAndGetUserData(token);
        
        if (!userData) {
            return handleInvalidToken(req, res);
        }

        req.user = userData;
        next();
    } catch (err) {
        console.error('Auth middleware error:', err);
        return handleError(req, res, err);
    }
};

const requireRole = (allowedRoles) => {
    return (req, res, next) => {
        try {
            if (!req.user) {
                return handleNoToken(req, res);
            }

            if (!allowedRoles.includes(req.user.role)) {
                if (isApiRequest(req)) {
                    return res.status(403).json({ 
                        error: '접근 권한이 없습니다.',
                        code: 'INSUFFICIENT_ROLE'
                    });
                }
                return res.redirect('/dashboard.html');
            }

            next();
        } catch (error) {
            console.error('Role check error:', error);
            return handleError(req, res, error);
        }
    };
};

const requireStoreAccess = async (req, res, next) => {
    try {
        const storeCode = req.params.storeCode || req.body.storeCode;
        
        if (!storeCode) {
            return res.status(400).json({ 
                error: '매장 코드가 필요합니다.',
                code: 'NO_STORE_CODE'
            });
        }

        if (req.user.role === '운영자') {
            return next();
        }

        if (req.user.role === '점주' && req.user.store_code === storeCode) {
            return next();
        }

        const { data, error } = await supabase
            .from('store_assignments')
            .select('*')
            .eq('user_id', req.user.id)
            .eq('store_code', storeCode)
            .single();

        if (error || !data) {
            return res.status(403).json({ 
                error: '매장 접근 권한이 없습니다.',
                code: 'NO_STORE_ACCESS'
            });
        }

        req.storeAssignment = data;
        next();
    } catch (err) {
        console.error('Store access check error:', {
            error: err,
            userId: req.user?.id,
            storeCode: req.params.storeCode || req.body.storeCode
        });
        
        return res.status(500).json({ 
            error: '매장 접근 권한 확인 중 오류가 발생했습니다.',
            code: 'STORE_ACCESS_ERROR'
        });
    }
};

/**
 * 인증 미들웨어 - 요청의 Authorization 헤더에서 토큰을 검증하고 사용자 정보를 req.user에 설정
 */
exports.authenticate = async (req, res, next) => {
    try {
      // 헤더에서 토큰 추출
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.warn('인증 토큰이 없거나 유효하지 않은 형식:', authHeader);
        return res.status(401).json({ error: '인증이 필요합니다.' });
      }
      
      const token = authHeader.split(' ')[1];
      
      if (!token) {
        console.warn('인증 토큰이 비어있음');
        return res.status(401).json({ error: '유효한 인증 토큰이 필요합니다.' });
      }
      
      // JWT 토큰 검증 (supabase 라이브러리 사용)
      const { data: { user }, error } = await supabase.auth.getUser(token);
      
      if (error || !user) {
        console.warn('토큰 검증 실패:', error);
        return res.status(401).json({ error: '인증 토큰이 유효하지 않습니다.' });
      }
      
      // 사용자 정보 조회
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();
      
      if (userError || !userData) {
        console.warn('사용자 정보 조회 실패:', userError);
        return res.status(401).json({ error: '사용자 정보를 찾을 수 없습니다.' });
      }
      
      // 요청 객체에 사용자 정보 설정
      req.user = userData;
      
      // 다음 미들웨어로 진행
      next();
    } catch (error) {
      console.error('인증 미들웨어 오류:', error);
      res.status(500).json({ error: '인증 처리 중 서버 오류가 발생했습니다.' });
    }
  };

module.exports = {
    requireAuth,
    requireRole,
    requireStoreAccess
};