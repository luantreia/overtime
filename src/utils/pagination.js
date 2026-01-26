export const getPaginationParams = (req) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(1000, parseInt(req.query.limit) || 20); // Máx 1000
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};