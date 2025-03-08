// backend/controllers/rulesController.js
const supabase = require('../supabaseClient');

// 답글 규칙 조회
exports.getRules = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('platform_reply_rules')
      .select('*');

    if (error) throw error;
    res.json(data);

  } catch (err) {
    console.error('Error in getRules:', err);
    res.status(500).json({ error: err.message });
  }
};

// 답글 규칙 수정
exports.updateRule = async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('platform_reply_rules')
      .update(req.body)
      .eq('id', id)
      .select();

    if (error) throw error;
    res.json(data);

  } catch (err) {
    console.error('Error in updateRule:', err);
    res.status(500).json({ error: err.message });
  }
};