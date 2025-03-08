// backend/controllers/userController.js
const supabase = require('../supabaseClient');

// backend/controllers/userController.js
exports.getUserStores = async (req, res) => {
    try {
        const { userId } = req.params;
        
        // 명시적으로 Content-Type 설정
        res.setHeader('Content-Type', 'application/json');
        
        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }

        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('role')
            .eq('id', userId)
            .single();

        if (userError) {
            console.error('User query error:', userError);
            return res.status(404).json({ error: 'User not found' });
        }

        let stores = [];
        
        if (userData.role === '운영자') {
            const { data, error } = await supabase
                .from('platform_reply_rules')
                .select('store_code, store_name')
                .order('store_code');
            
            if (!error) {
                stores = data;
            }
        } else {
            const { data, error } = await supabase
                .from('store_assignments')
                .select(`
                    store_code,
                    platform_reply_rules (
                        store_name
                    )
                `)
                .eq('user_id', userId);

            if (!error && data) {
                stores = data.map(assignment => ({
                    store_code: assignment.store_code,
                    store_name: assignment.platform_reply_rules?.store_name
                }));
            }
        }

        res.json(stores);

    } catch (err) {
        console.error('getUserStores error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};