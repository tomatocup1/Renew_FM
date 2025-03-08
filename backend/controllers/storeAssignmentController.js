// backend/controllers/storeAssignmentController.js
const { supabase } = require('../supabaseClient');

// 사용자의 매장 할당 목록 조회
exports.getAllUsers = async (req, res) => {
    try {
      // 사용자 목록 조회
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email, role, created_at')
        .order('name');
      
      if (error) {
        console.error('사용자 목록 조회 오류:', error);
        return res.status(500).json({ error: '사용자 목록을 가져오는데 실패했습니다.' });
      }
      
      return res.status(200).json(data);
    } catch (error) {
      console.error('전체 사용자 조회 오류:', error);
      return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
  };
  
  /**
   * 사용자 ID로 할당된 스토어 목록을 가져옵니다
   */
  exports.getUserStores = async (req, res) => {
    try {
      const { userId } = req.params;
      
      // 사용자 권한 확인 - 본인 또는 운영자/관리자만 조회 가능
      if (req.user.id !== userId && !['운영자', '관리자'].includes(req.user.role)) {
        return res.status(403).json({ error: '접근 권한이 없습니다.' });
      }
      
      // 사용자의 스토어 할당 정보 조회
      const { data: assignments, error: assignmentError } = await supabase
        .from('store_assignments')
        .select('store_code, role_type')
        .eq('user_id', userId);
      
      if (assignmentError) {
        console.error('사용자 스토어 할당 조회 오류:', assignmentError);
        return res.status(500).json({ error: '스토어 할당 정보를 가져오는데 실패했습니다.' });
      }
      
      if (!assignments || assignments.length === 0) {
        return res.status(200).json([]);
      }
      
      // 스토어 코드 목록
      const storeCodes = assignments.map(a => a.store_code);
      
      // 스토어 정보 조회 - 먼저 platform_reply_rules에서 찾기 시도
      const { data: storeRules, error: rulesError } = await supabase
        .from('platform_reply_rules')
        .select('store_code, store_name, platform, platform_code')
        .in('store_code', storeCodes);
        
      // 규칙 정보 조회 오류 시에도 계속 진행 (store_info에서 찾기 시도)
      if (rulesError) {
        console.warn('플랫폼 규칙 조회 오류:', rulesError);
      }
      
      // store_info 테이블에서 추가 정보 조회
      const { data: storeInfos, error: storeError } = await supabase
        .from('store_info')
        .select('store_code, platform_info')
        .in('store_code', storeCodes);
      
      if (storeError) {
        console.error('스토어 정보 조회 오류:', storeError);
        
        // 규칙 정보가 있으면 그것만 반환
        if (storeRules && storeRules.length > 0) {
          return res.status(200).json(storeRules);
        }
        
        return res.status(500).json({ error: '스토어 정보를 가져오는데 실패했습니다.' });
      }
      
      // 두 정보 소스 결합하여 응답 데이터 생성
      let resultMap = {};
      
      // 먼저 store_info 데이터로 기본 맵 생성
      if (storeInfos && storeInfos.length > 0) {
        storeInfos.forEach(store => {
          // platform_info에서 필요한 정보 추출 (JSONB 필드)
          let platformInfo = {};
          try {
            if (store.platform_info) {
              platformInfo = typeof store.platform_info === 'string' 
                ? JSON.parse(store.platform_info) 
                : store.platform_info;
            }
          } catch (e) {
            console.error('플랫폼 정보 파싱 오류:', e);
          }
          
          // 기본 스토어 정보 저장
          resultMap[store.store_code] = {
            store_code: store.store_code,
            store_name: platformInfo.store_name || store.store_code,
            platform: platformInfo.platform || '배달의민족',
            platform_code: platformInfo.platform_code || ''
          };
        });
      }
      
      // platform_reply_rules 정보로 덮어쓰기 또는 추가 (더 상세한 정보)
      if (storeRules && storeRules.length > 0) {
        storeRules.forEach(rule => {
          // 기존 store_code가 없으면 새로 생성, 있으면 업데이트
          if (!resultMap[rule.store_code]) {
            resultMap[rule.store_code] = {
              store_code: rule.store_code,
              store_name: rule.store_name || rule.store_code,
              platform: rule.platform || '배달의민족',
              platform_code: rule.platform_code || ''
            };
          } else {
            // 플랫폼별 규칙이 여러개 있을 수 있으므로 별도 항목으로 추가
            resultMap[`${rule.store_code}_${rule.platform}_${rule.platform_code}`] = {
              store_code: rule.store_code,
              store_name: rule.store_name || resultMap[rule.store_code].store_name,
              platform: rule.platform || '배달의민족',
              platform_code: rule.platform_code || ''
            };
          }
        });
      }
      
      // 맵을 배열로 변환
      const result = Object.values(resultMap);
      
      // 스토어 코드 & 플랫폼 기준 정렬
      result.sort((a, b) => {
        if (a.store_code !== b.store_code) {
          return a.store_code.localeCompare(b.store_code);
        }
        return (a.platform || '').localeCompare(b.platform || '');
      });
      
      return res.status(200).json(result);
      
    } catch (error) {
      console.error('사용자 스토어 조회 오류:', error);
      return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
  };
  

// 매장 할당 저장
exports.assignStores = async (req, res) => {
    try {
      const { userId, stores } = req.body;
      
      if (!userId) {
        return res.status(400).json({ error: '사용자 ID가 필요합니다.' });
      }
      
      if (!Array.isArray(stores)) {
        return res.status(400).json({ error: '할당할 스토어 목록이 올바르지 않습니다.' });
      }
      
      // 사용자 존재 여부 확인
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, role')
        .eq('id', userId)
        .single();
      
      if (userError || !user) {
        console.error('사용자 조회 오류:', userError);
        return res.status(404).json({ error: '해당 사용자를 찾을 수 없습니다.' });
      }
      
      // 트랜잭션 처리를 위한 RPC 함수 사용 또는 단계별 처리
      // 1. 기존 할당 삭제
      const { error: deleteError } = await supabase
        .from('store_assignments')
        .delete()
        .eq('user_id', userId);
      
      if (deleteError) {
        console.error('스토어 할당 삭제 오류:', deleteError);
        return res.status(500).json({ error: '기존 스토어 할당 삭제 중 오류가 발생했습니다.' });
      }
      
      // 2. 새 할당 추가 (할당할 스토어가 있는 경우)
      if (stores.length > 0) {
        const assignments = stores.map(store => ({
          user_id: userId,
          store_code: store.store_code,
          role_type: store.role_type || user.role || 'default'
        }));
        
        const { error: insertError } = await supabase
          .from('store_assignments')
          .insert(assignments);
        
        if (insertError) {
          console.error('스토어 할당 추가 오류:', insertError);
          return res.status(500).json({ error: '스토어 할당 추가 중 오류가 발생했습니다.' });
        }
      }
      
      return res.status(200).json({ 
        message: '스토어 할당이 성공적으로 완료되었습니다.',
        user_id: userId,
        assigned_stores: stores.length
      });
      
    } catch (error) {
      console.error('스토어 할당 오류:', error);
      return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
  };
  

// 모든 사용자 목록 조회 (운영자용)
exports.getAllUsers = async (req, res) => {
    try {
        console.log('1. getAllUsers 시작');
        console.log('요청 헤더:', req.headers);

        // 모든 사용자 조회 (운영자 제외)
        const { data: users, error } = await supabase
            .from('users')
            .select('id, name, email, role')
            .neq('role', '운영자')  // 운영자가 아닌 모든 사용자 조회
            .order('name');

        console.log('사용자 쿼리 결과:', { 사용자수: users?.length || 0, error });
        console.log('2. 필터링된 사용자들:', users);
        console.log('3. 쿼리 에러:', error);

        if (error) throw error;
        res.json(users || []);

    } catch (err) {
        console.error('4. getAllUsers 에러:', err);
        res.status(500).json({ error: err.message });
    }
};

// 모든 매장 목록 조회 (운영자용)
exports.getAllStores = async (req, res) => {
    try {
      // 모든 스토어 정보 조회 - 먼저 platform_reply_rules 테이블에서
      const { data: storeRules, error: rulesError } = await supabase
        .from('platform_reply_rules')
        .select('store_code, store_name, platform, platform_code')
        .order('store_code')
        .order('platform');
      
      // 규칙 정보 조회 오류 시에도 계속 진행
      if (rulesError) {
        console.warn('플랫폼 규칙 조회 오류:', rulesError);
      }
      
      // store_info 테이블에서 추가 정보 조회
      const { data: storeInfos, error: storeError } = await supabase
        .from('store_info')
        .select('store_code, platform_info')
        .order('store_code');
      
      if (storeError) {
        console.error('스토어 정보 조회 오류:', storeError);
        
        // 규칙 정보가 있으면 그것만 반환
        if (storeRules && storeRules.length > 0) {
          return res.status(200).json(storeRules);
        }
        
        return res.status(500).json({ error: '스토어 정보를 가져오는데 실패했습니다.' });
      }
      
      // 두 정보 소스를 결합하여 전체 스토어 목록 생성
      let resultMap = {};
      
      // 먼저 store_info 데이터로 기본 맵 생성
      if (storeInfos && storeInfos.length > 0) {
        storeInfos.forEach(store => {
          // platform_info에서 필요한 정보 추출 (JSONB 필드)
          let platformInfo = {};
          try {
            if (store.platform_info) {
              platformInfo = typeof store.platform_info === 'string' 
                ? JSON.parse(store.platform_info) 
                : store.platform_info;
            }
          } catch (e) {
            console.error('플랫폼 정보 파싱 오류:', e);
          }
          
          // 기본 스토어 정보 저장
          resultMap[store.store_code] = {
            store_code: store.store_code,
            store_name: platformInfo.store_name || store.store_code,
            platform: platformInfo.platform || '배달의민족',
            platform_code: platformInfo.platform_code || ''
          };
        });
      }
      
      // platform_reply_rules 정보로 덮어쓰기 또는 추가 (더 상세한 정보)
      if (storeRules && storeRules.length > 0) {
        storeRules.forEach(rule => {
          // 기존 store_code가 없으면 새로 생성, 있으면 업데이트
          if (!resultMap[rule.store_code]) {
            resultMap[rule.store_code] = {
              store_code: rule.store_code,
              store_name: rule.store_name || rule.store_code,
              platform: rule.platform || '배달의민족',
              platform_code: rule.platform_code || ''
            };
          } else {
            // 플랫폼별 규칙이 여러개 있을 수 있으므로 별도 항목으로 추가
            resultMap[`${rule.store_code}_${rule.platform}_${rule.platform_code}`] = {
              store_code: rule.store_code,
              store_name: rule.store_name || resultMap[rule.store_code].store_name,
              platform: rule.platform || '배달의민족',
              platform_code: rule.platform_code || ''
            };
          }
        });
      }
      
      // 맵을 배열로 변환
      const result = Object.values(resultMap);
      
      // 스토어 코드 & 플랫폼 기준 정렬
      result.sort((a, b) => {
        if (a.store_code !== b.store_code) {
          return a.store_code.localeCompare(b.store_code);
        }
        return (a.platform || '').localeCompare(b.platform || '');
      });
      
      return res.status(200).json(result);
      
    } catch (error) {
      console.error('전체 스토어 조회 오류:', error);
      return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
  };