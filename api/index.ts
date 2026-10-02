import app from '../server.js';

// Disable Vercel's default body parser so Express and Multer can handle multipart/form-data file uploads
export const config = {
  api: {
    bodyParser: false,
  },
};

export default app;
