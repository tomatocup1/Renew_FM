// frontend/js/authService.js
class AuthService {
    constructor() {
        this.API_URL = 'http://localhost:3000/api';
        this.tokenRefreshTimeouts = new Set();
        this.rateLimitRetryDelay = 1000;
        this.maxRetries = 3;
        this.isRefreshing = false;
        this.retryQueue = [];
        this.initTokenRefresh();
    }

    // 소셜 로그인 URL 가져오기
    async getSocialLoginUrl(provider) {
        try {
            const response = await this.fetchWithRetry(`${this.API_URL}/auth/social-url/${provider}`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                },
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error(`소셜 로그인 URL 요청 실패 (${response.status})`);
            }

            return await response.json();
        } catch (error) {
            console.error('Social login URL error:', error);
            throw error;
        }
    }

    // 소셜 로그인 처리
    async processSocialLogin(provider, token) {
        try {
            const response = await this.fetchWithRetry(`${this.API_URL}/auth/social-login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({ provider, access_token: token })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || '소셜 로그인에 실패했습니다.');
            }

            const data = await response.json();
            if (!data.session || !data.user) {
                throw new Error('Invalid response data');
            }

            this.setSession(data.session);
            this.setUser(data.user);
            
            await this.initTokenRefresh();
            return data;
        } catch (error) {
            console.error('Social login error:', error);
            throw error;
        }
    }

    // 기존 로그인 함수
    async login(email, password) {
        try {
            console.log('Attempting login for:', email);
            
            const response = await this.fetchWithRetry(`${this.API_URL}/auth/signin`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                credentials: 'include',
                mode: 'cors',
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || '로그인에 실패했습니다.');
            }

            if (!data.session || !data.user) {
                throw new Error('Invalid response data');
            }

            console.log('Login successful, setting session and user data');
            this.setSession(data.session);
            this.setUser(data.user);
            
            await this.initTokenRefresh();
            return data;
        } catch (error) {
            console.error('Login error:', error);
            throw error;
        }
    }

    // frontend/js/authService.js
    async initTokenRefresh() {
        try {
            const session = this.getSession();
            if (!session) return;

            this.clearExistingRefreshTimer();

            // 5분이 아닌 1분 전에 갱신하도록 수정
            const expiresAt = new Date(session.expires_at).getTime();
            const now = new Date().getTime();
            const timeUntilRefresh = expiresAt - now - (60 * 1000); // 1분 전에 갱신

            if (timeUntilRefresh > 0) {
                this.tokenRefreshInterval = setTimeout(async () => {
                    try {
                        await this.refreshToken();
                    } catch (error) {
                        console.error('Token refresh failed:', error);
                        // 토큰 갱신 실패 시 바로 리다이렉트하지 않고 세션 만료되었을 때만 처리
                        const currentSession = this.getSession();
                        if (!currentSession || new Date(currentSession.expires_at).getTime() <= new Date().getTime()) {
                            window.location.href = '/login.html';
                        }
                    }
                }, timeUntilRefresh);
            }
        } catch (error) {
            console.error('Token refresh init error:', error);
        }
    }

    clearExistingRefreshTimer() {
        if (this.tokenRefreshInterval) {
            clearTimeout(this.tokenRefreshInterval);
            this.tokenRefreshInterval = null;
        }
    }

    clearAllRefreshTimeouts() {
        this.tokenRefreshTimeouts.forEach(timeout => clearTimeout(timeout));
        this.tokenRefreshTimeouts.clear();
        this.clearExistingRefreshTimer();
    }

    async signup(userData) {
        try {
            console.log('Attempting signup');
            
            const response = await this.fetchWithRetry(`${this.API_URL}/auth/signup`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                credentials: 'include',
                mode: 'cors',
                body: JSON.stringify(userData)
            });

            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || data.details || '회원가입에 실패했습니다.');
            }

            console.log('Signup successful');
            return data;
        } catch (error) {
            console.error('Signup error:', error);
            throw error;
        }
    }

    async logout() {
        try {
            const session = this.getSession();
            if (!session) return;

            console.log('Attempting logout');
            
            await this.fetchWithRetry(`${this.API_URL}/auth/signout`, {
                method: 'POST',
                headers: {
                    'Authorization': this.getAuthHeader(),
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                mode: 'cors'
            });

            console.log('Logout successful');
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            this.clearSession();
            window.location.href = '/login.html';
        }
    }

    async refreshToken() {
        if (this.isRefreshing) {
            return new Promise((resolve) => {
                this.retryQueue.push(resolve);
            });
        }
    
        this.isRefreshing = true;
    
        try {
            const session = this.getSession();
            if (!session?.refresh_token) {
                this.handleTokenError();
                return null;
            }
    
            const response = await fetch(`${this.API_URL}/auth/refresh-token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({
                    refresh_token: session.refresh_token
                })
            });
    
            if (!response.ok) {
                this.handleTokenError();
                return null;
            }
    
            const data = await response.json();
            if (!data.session) {
                this.handleTokenError();
                return null;
            }
    
            this.setSession(data.session);
            this.retryQueue.forEach(resolve => resolve(data.session));
            
            // 토큰 갱신 후 다음 갱신 시간 설정
            this.initTokenRefresh();
            
            return data.session;
    
        } catch (error) {
            console.error('Token refresh error:', error);
            this.handleTokenError();
            return null;
        } finally {
            this.isRefreshing = false;
            this.retryQueue = [];
        }
    }
    
    handleTokenError() {
        // 토큰 에러 발생 시 세션 정보만 지우고, 현재 페이지 정보는 유지
        this.clearSession();
        
        // 리다이렉트 시 현재 URL 저장
        const currentPath = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `/login.html?redirect=${currentPath}`;
    }

    async fetchWithRetry(url, options, maxRetries = 3, isRefreshAttempt = false) {
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const response = await fetch(url, options);
                
                // 토큰 만료 오류 처리 (401 응답)
                if (response.status === 401 && !isRefreshAttempt) {
                    const newSession = await this.refreshToken();
                    if (newSession) {
                        // 헤더 업데이트
                        if (options.headers && options.headers.Authorization) {
                            options.headers.Authorization = `Bearer ${newSession.access_token}`;
                        } else if (options.headers) {
                            options.headers.Authorization = `Bearer ${newSession.access_token}`;
                        } else {
                            options.headers = {
                                Authorization: `Bearer ${newSession.access_token}`
                            };
                        }
                        // 재시도
                        return this.fetchWithRetry(url, options, maxRetries, true);
                    }
                }
                
                // 속도 제한 처리 (429 응답)
                if (response.status === 429) {
                    const retryAfter = response.headers.get('Retry-After') || this.rateLimitRetryDelay * Math.pow(2, attempt);
                    await new Promise(resolve => setTimeout(resolve, retryAfter));
                    continue;
                }

                return response;
            } catch (error) {
                // 네트워크 오류인 경우 재시도
                if (attempt === maxRetries - 1) throw error;
                await new Promise(resolve => setTimeout(resolve, this.rateLimitRetryDelay * Math.pow(2, attempt)));
            }
        }
        throw new Error('Max retry attempts reached');
    }

    async checkAuth() {
        try {
            const session = this.getSession();
            if (!session) {
                console.log('No session found during auth check');
                return false;
            }

            const expiresAt = new Date(session.expires_at).getTime();
            const now = new Date().getTime();

            console.log('Session expires in:', Math.round((expiresAt - now) / 1000), 'seconds');

            // 만료 5분 전에 갱신 시도
            if (expiresAt <= now + (5 * 60 * 1000)) {
                console.log('Session expires soon, attempting refresh');
                return !!(await this.refreshToken());
            }

            return true;
        } catch (error) {
            console.error('Auth check error:', error);
            return false;
        }
    }

    async getCurrentUser() {
        try {
            const session = this.getSession();
            if (!session?.access_token) {
                console.log('No valid session found');
                return null;
            }
    
            const cachedUser = this.getUser();
            if (cachedUser) {
                return cachedUser;
            }
    
            const response = await this.fetchWithRetry(`${this.API_URL}/auth/user`, {
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Accept': 'application/json'
                },
                credentials: 'include'
            });
    
            if (response.status === 401) {
                console.log('Token expired, attempting refresh');
                const newSession = await this.refreshToken();
                if (!newSession) {
                    return null;
                }
                return this.getCurrentUser();
            }
    
            if (!response.ok) {
                console.error('Failed to get user info:', response.status);
                return null;
            }
    
            const { user } = await response.json();
            if (!user) {
                console.error('Invalid user data received');
                return null;
            }
            
            this.setUser(user);
            return user;
        } catch (error) {
            console.error('Get current user error:', error);
            return null;
        }
    }

    setSession(session) {
        if (!session) return;
        
        try {
            const sessionData = JSON.stringify(session);
            localStorage.setItem('session', sessionData);
            
            const cookieOptions = [
                'path=/',
                `max-age=${24 * 60 * 60}`,
                'samesite=lax'
            ].join('; ');

            document.cookie = `session=${encodeURIComponent(sessionData)}; ${cookieOptions}`;
            
            this.initTokenRefresh();
            console.log('Session updated successfully');
        } catch (error) {
            console.error('Error setting session:', error);
        }
    }

    getSession() {
        try {
            const session = localStorage.getItem('session');
            return session ? JSON.parse(session) : null;
        } catch (error) {
            console.error('Error getting session:', error);
            this.clearSession();
            return null;
        }
    }

    clearSession() {
        try {
            localStorage.removeItem('session');
            localStorage.removeItem('user');
            document.cookie = 'session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
            this.clearAllRefreshTimeouts();
            console.log('Session cleared successfully');
        } catch (error) {
            console.error('Error clearing session:', error);
        }
    }

    isAuthenticated() {
        try {
            const session = this.getSession();
            if (!session) {
                console.log('No session found');
                return false;
            }
            
            const expiresAt = new Date(session.expires_at).getTime();
            const now = new Date().getTime();
    
            if (expiresAt <= now) {
                console.log('Session expired, attempting refresh');
                return this.refreshToken()
                    .then(newSession => !!newSession)
                    .catch(() => {
                        console.error('Token refresh failed during authentication check');
                        return false;
                    });
            }
            
            if (expiresAt - now < 300000) {
                console.log('Token expires soon, attempting refresh in background');
                this.refreshToken()
                    .then(newSession => {
                        if (newSession) {
                            console.log('Background token refresh successful');
                        }
                    })
                    .catch(error => {
                        console.error('Background token refresh failed:', error);
                        // 백그라운드 갱신 실패는 현재 인증 상태에 영향을 주지 않음
                    });
            }
            
            return true;
        } catch (error) {
            console.error('Authentication check error:', error);
            return false;
        }
    }

    getAuthHeader() {
        try {
            const session = this.getSession();
            console.log('getAuthHeader 호출됨, 세션:', session ? '존재함' : '없음');
            if (!session?.access_token) {
                console.log('No access token available');
                return '';
            }
            return `Bearer ${session.access_token}`;
        } catch (error) {
            console.error('Error getting auth header:', error);
            return '';
        }
    }

    setUser(user) {
        if (!user) return;
        localStorage.setItem('user', JSON.stringify(user));
    }

    // frontend/js/authService.js
    getUser() {
        try {
            const userStr = localStorage.getItem('user');
            if (!userStr) {
                return null;
            }
            const user = JSON.parse(userStr);
            return user;
        } catch (error) {
            console.error('Error getting user:', error);
            localStorage.removeItem('user');
            return null;
        }
    }

    // OAuth 상태 처리
    parseAuthResult() {
        // URL 파라미터에서 OAuth 결과 추출
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const queryParams = new URLSearchParams(window.location.search);
        
        // OAuth 성공 파라미터
        const accessToken = hashParams.get('access_token') || queryParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token') || queryParams.get('refresh_token');
        const expiresIn = hashParams.get('expires_in') || queryParams.get('expires_in');
        const provider = hashParams.get('provider') || queryParams.get('provider');
        
        // OAuth 오류 파라미터
        const error = hashParams.get('error') || queryParams.get('error');
        const errorDescription = hashParams.get('error_description') || queryParams.get('error_description');
        
        if (error) {
            throw new Error(errorDescription || error);
        }
        
        if (accessToken && refreshToken && expiresIn && provider) {
            const expiresAt = new Date();
            expiresAt.setSeconds(expiresAt.getSeconds() + parseInt(expiresIn));
            
            return {
                access_token: accessToken,
                refresh_token: refreshToken,
                expires_at: expiresAt.toISOString(),
                provider
            };
        }
        
        return null;
    }
}

export const authService = new AuthService();