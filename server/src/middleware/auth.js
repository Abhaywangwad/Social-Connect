import jwt from 'jsonwebtoken';

// Protects a route: only logged-in users get through.
// The JWT is stored in an HttpOnly cookie called "token".
const protect = (req, res, next) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ message: 'Please log in' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id; // available in every controller after this
    next();
  } catch {
    return res.status(401).json({ message: 'Session expired, please log in again' });
  }
};

export default protect;
