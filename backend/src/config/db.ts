import mongoose from 'mongoose';

export const connectDB = async (uri: string): Promise<void> => {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  console.log('MongoDB connected successfully');
};

export const disconnectDB = async (): Promise<void> => {
  await mongoose.disconnect();
};
