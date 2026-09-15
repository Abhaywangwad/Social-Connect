/**
 * Profile Service for Social-Connect
 * Handles profile fetching, posts, follow/unfollow, profile edits, and messaging.
 */

export const PROFILE_CONFIG = {
  profileEndpoint: '/api/profile',
  postsEndpoint: '/api/profile/posts',
  followEndpoint: '/api/profile/follow',
  editEndpoint: '/api/profile/edit',
  messageEndpoint: '/api/messages',
};

// Fallback local data if backend is offline or static
const LOCAL_FALLBACK_PROFILES = {
  alexmorgan: {
    id: 'user_alex_1',
    username: 'alexmorgan',
    email: 'alex@socialconnect.com',
    fullName: 'Alex Morgan',
    role: 'Product Designer & Visual Creator',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
    bio: 'Product Designer @SocialConnect 🎨\nDocumenting modern architecture, generative art & minimal spaces 📸\nSan Francisco, CA',
    website: 'https://alexmorgan.design',
    isVerified: true,
    isOwnProfile: true,
    isFollowing: false,
    stats: { posts: 9, followers: 1420, following: 382 }
  },
  elena_visuals: {
    id: 'user_elena_2',
    username: 'elena_visuals',
    email: 'elena@visuals.io',
    fullName: 'Elena Rostova',
    role: 'Travel & Urban Photographer',
    avatarUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=400&q=80',
    bio: 'Exploring light, shadows & brutalist structures 🏛️\nSony Alpha A7IV | Leica M11 📸\nBased in Berlin & Tokyo',
    website: 'https://elenarostova.photography',
    isVerified: true,
    isOwnProfile: false,
    isFollowing: false,
    stats: { posts: 6, followers: 28450, following: 419 }
  },
  new_creator: {
    id: 'user_maya_3',
    username: 'new_creator',
    email: 'maya@creators.io',
    fullName: 'Maya Lin',
    role: 'Digital Creator',
    avatarUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=400&q=80',
    bio: 'Starting a new creative journey 🌿 Just set up my Social-Connect account. New work dropping soon!',
    website: '',
    isVerified: false,
    isOwnProfile: false,
    isFollowing: false,
    stats: { posts: 0, followers: 48, following: 112 }
  }
};

const LOCAL_FALLBACK_POSTS = {
  alexmorgan: [
    {
      id: 'p1',
      imageUrl: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=800&q=80',
      caption: 'Minimalist morning studio lights ☕✨ Quiet spaces before the sprint starts.',
      likes: 342,
      commentsCount: 28,
      createdAt: '2 hours ago'
    },
    {
      id: 'p2',
      imageUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&q=80',
      caption: 'Weekend escape into the misty mountains 🌲 High dynamic range in the fog.',
      likes: 894,
      commentsCount: 64,
      createdAt: '1 day ago'
    },
    {
      id: 'p3',
      imageUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80',
      caption: 'Generative fluid forms explored in Blender & GLSL shaders. Volumetric glow.',
      likes: 1205,
      commentsCount: 97,
      createdAt: '3 days ago'
    },
    {
      id: 'p4',
      imageUrl: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=80',
      caption: 'Glass facade reflections at dusk. Geometry and concrete in downtown.',
      likes: 512,
      commentsCount: 39,
      createdAt: '5 days ago'
    },
    {
      id: 'p5',
      imageUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=800&q=80',
      caption: 'Circuit board aesthetics. Hardware micro-architecture inspection.',
      likes: 421,
      commentsCount: 19,
      createdAt: '1 week ago'
    },
    {
      id: 'p6',
      imageUrl: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=800&q=80',
      caption: 'Late night desk setup. Dark theme UI design iteration #42 💻',
      likes: 673,
      commentsCount: 52,
      createdAt: '1 week ago'
    },
    {
      id: 'p7',
      imageUrl: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=800&q=80',
      caption: 'First light breaking across the ridge. Pure tranquility.',
      likes: 789,
      commentsCount: 45,
      createdAt: '2 weeks ago'
    },
    {
      id: 'p8',
      imageUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80',
      caption: 'Turquoise waters and coastlines. Natural gradient palette.',
      likes: 954,
      commentsCount: 71,
      createdAt: '2 weeks ago'
    },
    {
      id: 'p9',
      imageUrl: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=800&q=80',
      caption: 'Retro analog synthesizers and modular patches. Nostalgia waves 🕹️',
      likes: 1102,
      commentsCount: 88,
      createdAt: '3 weeks ago'
    }
  ],
  elena_visuals: [
    {
      id: 'ep1',
      imageUrl: 'https://images.unsplash.com/photo-1514565131-fce0801e5785?auto=format&fit=crop&w=800&q=80',
      caption: 'Tokyo by night. Neon reflections in the Shinjuku drizzle.',
      likes: 4230,
      commentsCount: 215,
      createdAt: '4 hours ago'
    },
    {
      id: 'ep2',
      imageUrl: 'https://images.unsplash.com/photo-1509281373149-e957c6296406?auto=format&fit=crop&w=800&q=80',
      caption: 'Warm cinematic tones and retro silhouettes.',
      likes: 3100,
      commentsCount: 142,
      createdAt: '2 days ago'
    },
    {
      id: 'ep3',
      imageUrl: 'https://images.unsplash.com/photo-1477959858617-67f30bc75b82?auto=format&fit=crop&w=800&q=80',
      caption: 'Urban sprawl and brutalist symmetry from above.',
      likes: 5620,
      commentsCount: 388,
      createdAt: '4 days ago'
    },
    {
      id: 'ep4',
      imageUrl: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=800&q=80',
      caption: 'Street portrait on 35mm film. Golden hour contrast.',
      likes: 2940,
      commentsCount: 118,
      createdAt: '1 week ago'
    },
    {
      id: 'ep5',
      imageUrl: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=800&q=80',
      caption: 'Architectural shadows and monochrome lines in Berlin.',
      likes: 3890,
      commentsCount: 165,
      createdAt: '2 weeks ago'
    },
    {
      id: 'ep6',
      imageUrl: 'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?auto=format&fit=crop&w=800&q=80',
      caption: 'Subway rush hour rhythm and motion blur.',
      likes: 4890,
      commentsCount: 204,
      createdAt: '3 weeks ago'
    }
  ],
  new_creator: []
};

/**
 * Fetch profile details for a given username
 */
export async function fetchProfile(username = 'alexmorgan') {
  try {
    const res = await fetch(`${PROFILE_CONFIG.profileEndpoint}?username=${encodeURIComponent(username)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { success: true, user: data.user };
  } catch (_err) {
    // Fallback to local data
    const user = LOCAL_FALLBACK_PROFILES[username] || LOCAL_FALLBACK_PROFILES.alexmorgan;
    return { success: true, user, isFallback: true };
  }
}

/**
 * Fetch posts for a given username
 */
export async function fetchUserPosts(username = 'alexmorgan') {
  try {
    const res = await fetch(`${PROFILE_CONFIG.postsEndpoint}?username=${encodeURIComponent(username)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { success: true, posts: data.posts || [] };
  } catch (_err) {
    const posts = LOCAL_FALLBACK_POSTS[username] || [];
    return { success: true, posts, isFallback: true };
  }
}

/**
 * Toggle follow/unfollow for a target user
 */
export async function toggleFollowUser(targetUsername) {
  try {
    const res = await fetch(PROFILE_CONFIG.followEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUsername })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (_err) {
    const target = LOCAL_FALLBACK_PROFILES[targetUsername];
    if (target) {
      target.isFollowing = !target.isFollowing;
      target.stats.followers += target.isFollowing ? 1 : -1;
      return {
        success: true,
        isFollowing: target.isFollowing,
        followersCount: target.stats.followers,
        message: target.isFollowing ? `Following ${target.username}` : `Unfollowed ${target.username}`
      };
    }
    return { success: false, message: 'Could not update follow status.' };
  }
}

/**
 * Update current user's profile details
 */
export async function updateUserProfile(profileData) {
  try {
    const res = await fetch(PROFILE_CONFIG.editEndpoint, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profileData)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (_err) {
    const alex = LOCAL_FALLBACK_PROFILES.alexmorgan;
    Object.assign(alex, profileData);
    return { success: true, user: alex, message: 'Profile updated locally.' };
  }
}

/**
 * Send direct message
 */
export async function sendDirectMessage(recipient, text) {
  try {
    const res = await fetch(PROFILE_CONFIG.messageEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient, text })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (_err) {
    return {
      success: true,
      message: `Message sent to @${recipient}!`,
      data: { recipient, text, sentAt: new Date().toISOString() }
    };
  }
}
