import mongoose from 'mongoose';

export const connectDB = async (uri: string): Promise<void> => {
  try {
    await mongoose.connect(uri);
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};
