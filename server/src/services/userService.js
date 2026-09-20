import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';

/**
 * Normalizes user document into a safe profile representation.
 *
 * @param {Object} user Mongoose user document
 * @param {boolean} [includePrivateFields=false] Whether to include fields like email
 * @returns {Object} Safe profile object with counts instead of raw arrays
 */
const formatUserProfile = (user, includePrivateFields = false) => {
  const profile = {
    id: user._id,
    username: user.username,
    fullName: user.fullName,
    bio: user.bio || '',
    profilePicture: user.profilePicture || null,
    followersCount: typeof user.followersCount === 'number' ? user.followersCount : 0,
    followingCount: typeof user.followingCount === 'number' ? user.followingCount : 0,
    isPrivate: user.isPrivate,
    isVerified: user.isVerified,
    createdAt: user.createdAt,
  };

  if (includePrivateFields) {
    profile.email = user.email;
    profile.updatedAt = user.updatedAt;
  }

  return profile;
};

/**
 * Retrieves authenticated user's private profile.
 *
 * @param {string} userId Authenticated user's ObjectId
 * @returns {Promise<Object>}
 */
export const getCurrentUserProfile = async (userId) => {
  const user = await User.findById(userId)
    .select('-password -__v -normalizedFullName')
    .lean();
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  return formatUserProfile(user, true);
};

/**
 * Retrieves another user's public profile by unique username.
 * Excludes private personal details like email.
 *
 * @param {string} rawUsername
 * @returns {Promise<Object>}
 */
export const getUserByUsername = async (rawUsername) => {
  if (!rawUsername || typeof rawUsername !== 'string') {
    throw ApiError.badRequest('Username is required');
  }

  const username = rawUsername.trim().toLowerCase();
  const user = await User.findOne({ username })
    .select('-password -__v -normalizedFullName -email')
    .lean();

  if (!user) {
    throw ApiError.notFound(`User '@${username}' not found`);
  }

  return formatUserProfile(user, false);
};

/**
 * Updates the authenticated user's profile with allowed fields only.
 * Forbidden fields (password, email, followers, following, isVerified) are strictly rejected.
 *
 * @param {string} userId Authenticated user's ObjectId
 * @param {Object} updateData Incoming update payload
 * @returns {Promise<Object>}
 */
export const updateCurrentUserProfile = async (userId, updateData) => {
  const allowedFields = ['username', 'fullName', 'bio', 'profilePicture'];
  const sanitizedUpdates = {};

  // 1. Filter update data for strictly allowed fields
  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(updateData, field)) {
      sanitizedUpdates[field] = updateData[field];
    }
  }

  // 2. Reject request if no valid update fields are provided
  const keysToUpdate = Object.keys(sanitizedUpdates);
  if (keysToUpdate.length === 0) {
    throw ApiError.badRequest(
      'No valid fields provided for update. Allowed fields: username, fullName, bio, profilePicture'
    );
  }

  // 3. Validate individual field values
  if (sanitizedUpdates.username !== undefined) {
    if (typeof sanitizedUpdates.username !== 'string' || !sanitizedUpdates.username.trim()) {
      throw ApiError.badRequest('Username cannot be empty');
    }

    const trimmedUsername = sanitizedUpdates.username.trim().toLowerCase();
    if (trimmedUsername.length < 3 || trimmedUsername.length > 30) {
      throw ApiError.badRequest('Username must be between 3 and 30 characters');
    }

    const usernameRegex = /^[a-z0-9_.]+$/;
    if (!usernameRegex.test(trimmedUsername)) {
      throw ApiError.badRequest(
        'Username can only contain lowercase letters, numbers, underscores, and periods'
      );
    }

    // Check if another user already owns this username
    const existingUser = await User.findOne({
      username: trimmedUsername,
      _id: { $ne: userId },
    });

    if (existingUser) {
      throw ApiError.conflict('Username is already taken');
    }

    sanitizedUpdates.username = trimmedUsername;
  }

  if (sanitizedUpdates.fullName !== undefined) {
    if (typeof sanitizedUpdates.fullName !== 'string' || !sanitizedUpdates.fullName.trim()) {
      throw ApiError.badRequest('Full name cannot be empty');
    }
    const trimmedFullName = sanitizedUpdates.fullName.trim();
    if (trimmedFullName.length < 2 || trimmedFullName.length > 50) {
      throw ApiError.badRequest('Full name must be between 2 and 50 characters');
    }
    sanitizedUpdates.fullName = trimmedFullName;
    sanitizedUpdates.normalizedFullName = trimmedFullName.toLowerCase();
  }

  if (sanitizedUpdates.bio !== undefined) {
    if (typeof sanitizedUpdates.bio !== 'string') {
      throw ApiError.badRequest('Bio must be a string');
    }
    const trimmedBio = sanitizedUpdates.bio.trim();
    if (trimmedBio.length > 150) {
      throw ApiError.badRequest('Bio cannot exceed 150 characters');
    }
    sanitizedUpdates.bio = trimmedBio;
  }

  if (sanitizedUpdates.profilePicture !== undefined) {
    if (typeof sanitizedUpdates.profilePicture !== 'string') {
      throw ApiError.badRequest('Profile picture must be a string URL');
    }
    sanitizedUpdates.profilePicture = sanitizedUpdates.profilePicture.trim();
  }

  // 4. Update the user document
  try {
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: sanitizedUpdates },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      throw ApiError.notFound('User not found');
    }

    return formatUserProfile(updatedUser, true);
  } catch (error) {
    if (error.code === 11000) {
      throw ApiError.conflict('Username is already taken');
    }
    throw error;
  }
};
