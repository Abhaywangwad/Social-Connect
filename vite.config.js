import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In-memory mock database for Social-Connect
const DB = {
  users: {
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
  },
  posts: {
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
  },
  messages: []
};

function parseJsonBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (e) {
        resolve({});
      }
    });
  });
}

function mockApiPlugin() {
  return {
    name: 'mock-api-plugin',
    configureServer(server) {
      // 1. Auth Endpoint: /api/auth/login
      server.middlewares.use('/api/auth/login', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ message: 'Method not allowed' }));
          return;
        }

        const { email, password } = await parseJsonBody(req);

        if (!email || !password) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, message: 'Email and password are required.' }));
          return;
        }

        const cleanEmail = email.trim().toLowerCase();

        if (cleanEmail === 'locked@socialconnect.com') {
          res.statusCode = 403;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            success: false,
            message: 'This account has been temporarily locked due to multiple failed attempts.'
          }));
          return;
        }

        if (cleanEmail === 'alex@socialconnect.com' && password === 'Password123!') {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            success: true,
            token: 'sc_jwt_' + Date.now(),
            user: DB.users.alexmorgan,
            message: 'Welcome back, Alex Morgan!'
          }));
          return;
        }

        res.statusCode = 401;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          success: false,
          message: 'Incorrect email or password. Please try again.'
        }));
      });

      // 2. Profile Details: /api/profile
      server.middlewares.use('/api/profile', async (req, res, next) => {
        const parsedUrl = new URL(req.url, 'http://localhost');
        const username = (parsedUrl.searchParams.get('username') || 'alexmorgan').toLowerCase();

        // 2a. Follow / Unfollow: POST /api/profile/follow
        if (req.url.startsWith('/follow') && req.method === 'POST') {
          const { targetUsername } = await parseJsonBody(req);
          const target = DB.users[targetUsername];
          if (!target) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, message: 'User not found' }));
            return;
          }
          target.isFollowing = !target.isFollowing;
          target.stats.followers += target.isFollowing ? 1 : -1;

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            success: true,
            isFollowing: target.isFollowing,
            followersCount: target.stats.followers,
            message: target.isFollowing ? `Following ${target.username}` : `Unfollowed ${target.username}`
          }));
          return;
        }

        // 2b. Edit Profile: PUT /api/profile/edit
        if (req.url.startsWith('/edit') && (req.method === 'PUT' || req.method === 'POST')) {
          const body = await parseJsonBody(req);
          const targetUser = DB.users.alexmorgan;
          if (body.fullName !== undefined) targetUser.fullName = body.fullName;
          if (body.bio !== undefined) targetUser.bio = body.bio;
          if (body.website !== undefined) targetUser.website = body.website;
          if (body.avatarUrl) targetUser.avatarUrl = body.avatarUrl;

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            success: true,
            user: targetUser,
            message: 'Profile updated successfully!'
          }));
          return;
        }

        // 2c. Posts: GET /api/profile/posts
        if (req.url.startsWith('/posts') && req.method === 'GET') {
          const userPosts = DB.posts[username] || [];
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            success: true,
            username,
            posts: userPosts,
            count: userPosts.length
          }));
          return;
        }

        // 2d. Profile Info: GET /api/profile
        if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?'))) {
          const user = DB.users[username];
          if (!user) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, message: 'User not found.' }));
            return;
          }

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            success: true,
            user
          }));
          return;
        }

        next();
      });

      // 3. Messages Endpoint: POST /api/messages
      server.middlewares.use('/api/messages', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ message: 'Method not allowed' }));
          return;
        }

        const { recipient, text } = await parseJsonBody(req);
        if (!recipient || !text) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, message: 'Recipient and text are required.' }));
          return;
        }

        const messageObj = {
          id: 'msg_' + Date.now(),
          recipient,
          text,
          sentAt: new Date().toISOString()
        };
        DB.messages.push(messageObj);

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          success: true,
          message: `Message sent to @${recipient}!`,
          data: messageObj
        }));
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), mockApiPlugin()],
  server: {
    port: 5173,
    open: false
  }
})
