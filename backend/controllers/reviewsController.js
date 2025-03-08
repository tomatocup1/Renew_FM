// backend/controllers/reviewsController.js
const supabase = require('../supabaseClient');

// 리뷰 목록 조회
exports.getReviews = async (req, res) => {
  try {
    const { store_code, platform_code, startDate, endDate } = req.query;
    
    let query = supabase
      .from('reviews')
      .select('*');

    if (store_code) {
      query = query.eq('store_code', store_code);
    }
    if (platform_code) {
      query = query.eq('platform_code', platform_code);
    }
    if (startDate && endDate) {
      query = query.gte('review_date', startDate)
                  .lte('review_date', endDate);
    }

    const { data, error } = await query;
    
    if (error) throw error;
    res.json(data);

  } catch (err) {
    console.error('Error in getReviews:', err);
    res.status(500).json({ error: err.message });
  }
};

// 리뷰 생성
exports.createReview = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('reviews')
      .insert(req.body);

    if (error) throw error;
    res.json(data);

  } catch (err) {
    console.error('Error in createReview:', err);
    res.status(500).json({ error: err.message });
  }
};